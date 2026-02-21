import {
  type ParsedRequestHead,
  type ParsedResponseHead,
  parseRequestHead,
  parseResponseHead,
  isHttpRequest,
  isHttpResponse,
  isHttp2Preface,
  containsChunkedEnd,
} from "./http";
import { onH2Write, onH2Read, onH2Free } from "./h2";

const MAX_BODY_BYTES = 65536;

let requestCounter = 0;

function generateId(): string {
  return `${Date.now()}-${++requestCounter}`;
}

type ConnectionState = "idle" | "request_sent" | "reading_response";

interface Connection {
  state: ConnectionState;
  http2: boolean;

  writeBuffer: Uint8Array;
  readBuffer: Uint8Array;

  requestHead: ParsedRequestHead | null;
  requestBody: Uint8Array | null;
  requestBodyExpected: number;
  requestBodyRead: number;
  requestStartTime: number;

  responseHead: ParsedResponseHead | null;
  responseBody: Uint8Array | null;
  responseBodyExpected: number;
  responseBodyRead: number;
  responseChunked: boolean;
}

const connections = new Map<string, Connection>();

function newConnection(): Connection {
  return {
    state: "idle",
    http2: false,
    writeBuffer: new Uint8Array(0),
    readBuffer: new Uint8Array(0),
    requestHead: null,
    requestBody: null,
    requestBodyExpected: 0,
    requestBodyRead: 0,
    requestStartTime: 0,
    responseHead: null,
    responseBody: null,
    responseBodyExpected: 0,
    responseBodyRead: 0,
    responseChunked: false,
  };
}

function resetForNextRequest(conn: Connection): void {
  conn.state = "idle";
  conn.writeBuffer = new Uint8Array(0);
  conn.readBuffer = new Uint8Array(0);
  conn.requestHead = null;
  conn.requestBody = null;
  conn.requestBodyExpected = 0;
  conn.requestBodyRead = 0;
  conn.requestStartTime = 0;
  conn.responseHead = null;
  conn.responseBody = null;
  conn.responseBodyExpected = 0;
  conn.responseBodyRead = 0;
  conn.responseChunked = false;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function bodyToString(body: Uint8Array | null): string | null {
  if (!body || body.length === 0) return null;
  let s = "";
  for (let i = 0; i < body.length; i++) {
    s += String.fromCharCode(body[i]);
  }
  return s;
}

function emitHttpMessage(conn: Connection): void {
  if (!conn.requestHead) return;

  const host = conn.requestHead.headers["host"] ?? "unknown";
  const url = `https://${host}${conn.requestHead.path}`;
  const duration = Date.now() - conn.requestStartTime;

  const requestHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(conn.requestHead.headers)) {
    requestHeaders[k] = v;
  }

  const responseHeaders: Record<string, string> = {};
  if (conn.responseHead) {
    for (const [k, v] of Object.entries(conn.responseHead.headers)) {
      responseHeaders[k] = v;
    }
  }

  send({
    type: "http",
    payload: {
      id: generateId(),
      method: conn.requestHead.method,
      url,
      requestHeaders,
      requestBody: bodyToString(conn.requestBody),
      requestBodySize: conn.requestBodyRead,
      statusCode: conn.responseHead?.statusCode ?? 0,
      responseHeaders,
      responseBody: bodyToString(conn.responseBody),
      responseBodySize: conn.responseBodyRead,
      duration,
      timestamp: Date.now(),
    },
  });
}

function getOrCreate(ssl: string): Connection {
  let conn = connections.get(ssl);
  if (!conn) {
    conn = newConnection();
    connections.set(ssl, conn);
  }
  return conn;
}

export function onWrite(ssl: string, data: Uint8Array, fullSize: number): void {
  const conn = getOrCreate(ssl);

  if (conn.http2) {
    onH2Write(ssl, data);
    return;
  }

  if (conn.state === "idle") {
    if (isHttp2Preface(data)) {
      conn.http2 = true;
      send({ type: "log", payload: { message: "detected HTTP/2 connection on " + ssl } });
      return;
    }

    conn.writeBuffer = concat(conn.writeBuffer, data);

    if (!isHttpRequest(conn.writeBuffer)) {
      conn.writeBuffer = new Uint8Array(0);
      return;
    }

    const head = parseRequestHead(conn.writeBuffer);
    if (!head) return;

    conn.requestHead = head;
    conn.requestStartTime = Date.now();
    conn.state = "request_sent";

    const cl = head.headers["content-length"];
    if (cl) {
      conn.requestBodyExpected = parseInt(cl, 10) || 0;
    }

    const bodyStart = conn.writeBuffer.subarray(head.headLength);
    if (bodyStart.length > 0 && conn.requestBodyExpected > 0) {
      const capture = Math.min(bodyStart.length, MAX_BODY_BYTES);
      conn.requestBody = bodyStart.subarray(0, capture);
      conn.requestBodyRead = bodyStart.length;
    }

    conn.writeBuffer = new Uint8Array(0);
    return;
  }

  if (conn.state === "request_sent") {
    if (conn.requestBodyExpected > 0 && conn.requestBodyRead < conn.requestBodyExpected) {
      const remaining = conn.requestBodyExpected - conn.requestBodyRead;
      const chunk = data.subarray(0, Math.min(data.length, remaining));
      conn.requestBodyRead += chunk.length;

      if (conn.requestBody && conn.requestBody.length < MAX_BODY_BYTES) {
        const canCapture = Math.min(chunk.length, MAX_BODY_BYTES - conn.requestBody.length);
        conn.requestBody = concat(conn.requestBody, chunk.subarray(0, canCapture));
      } else if (!conn.requestBody) {
        const capture = Math.min(chunk.length, MAX_BODY_BYTES);
        conn.requestBody = chunk.subarray(0, capture);
      }
      return;
    }
    return;
  }

  if (conn.state === "reading_response") {
    emitHttpMessage(conn);
    resetForNextRequest(conn);
    onWrite(ssl, data, fullSize);
    return;
  }
}

export function onRead(ssl: string, data: Uint8Array): void {
  const conn = getOrCreate(ssl);

  if (conn.http2) {
    onH2Read(ssl, data);
    return;
  }

  if (conn.state !== "request_sent" && conn.state !== "reading_response") {
    return;
  }

  if (conn.state === "request_sent") {
    conn.readBuffer = concat(conn.readBuffer, data);

    if (!isHttpResponse(conn.readBuffer)) {
      conn.readBuffer = new Uint8Array(0);
      return;
    }

    const head = parseResponseHead(conn.readBuffer);
    if (!head) return;

    conn.responseHead = head;
    conn.state = "reading_response";

    const cl = head.headers["content-length"];
    const te = head.headers["transfer-encoding"];

    if (cl) {
      conn.responseBodyExpected = parseInt(cl, 10) || 0;
    } else if (te && te.toLowerCase().includes("chunked")) {
      conn.responseChunked = true;
      conn.responseBodyExpected = -1;
    } else {
      conn.responseBodyExpected = -1;
    }

    const bodyStart = conn.readBuffer.subarray(head.headLength);
    if (bodyStart.length > 0) {
      processResponseBody(conn, bodyStart);
    }

    conn.readBuffer = new Uint8Array(0);

    if (isResponseComplete(conn)) {
      emitHttpMessage(conn);
      resetForNextRequest(conn);
    } else {
      scheduleIdleFlush(ssl, conn);
    }
    return;
  }

  if (conn.state === "reading_response") {
    processResponseBody(conn, data);

    if (isResponseComplete(conn)) {
      emitHttpMessage(conn);
      resetForNextRequest(conn);
    } else {
      scheduleIdleFlush(ssl, conn);
    }
  }
}

function processResponseBody(conn: Connection, data: Uint8Array): void {
  conn.responseBodyRead += data.length;

  if (!conn.responseBody) {
    const capture = Math.min(data.length, MAX_BODY_BYTES);
    conn.responseBody = data.subarray(0, capture);
  } else if (conn.responseBody.length < MAX_BODY_BYTES) {
    const canCapture = Math.min(data.length, MAX_BODY_BYTES - conn.responseBody.length);
    conn.responseBody = concat(conn.responseBody, data.subarray(0, canCapture));
  }

  if (conn.responseChunked && containsChunkedEnd(data)) {
    conn.responseBodyExpected = conn.responseBodyRead;
  }
}

const RESPONSE_IDLE_MS = 150;

function isResponseComplete(conn: Connection): boolean {
  if (conn.responseBodyExpected >= 0 && conn.responseBodyRead >= conn.responseBodyExpected) {
    return true;
  }
  return false;
}

function scheduleIdleFlush(ssl: string, conn: Connection): void {
  if (conn.responseBodyExpected >= 0) return;

  const snapshot = conn.responseBodyRead;
  setTimeout(() => {
    const current = connections.get(ssl);
    if (!current || current !== conn) return;
    if (current.state !== "reading_response") return;
    if (current.responseBodyRead === snapshot) {
      emitHttpMessage(current);
      resetForNextRequest(current);
    }
  }, RESPONSE_IDLE_MS);
}

export function onFree(ssl: string): void {
  const conn = connections.get(ssl);
  if (!conn) return;

  if (conn.http2) {
    onH2Free(ssl);
  } else if (conn.requestHead && (conn.state === "request_sent" || conn.state === "reading_response")) {
    emitHttpMessage(conn);
  }

  connections.delete(ssl);
}

export function needsData(ssl: string): boolean {
  const conn = connections.get(ssl);
  if (!conn) return true;
  if (conn.http2) return true;
  if (conn.state === "reading_response" && conn.responseHead) {
    if (conn.responseBody && conn.responseBody.length >= MAX_BODY_BYTES) {
      return false;
    }
  }
  return true;
}

export function onReadBytes(ssl: string, byteCount: number): void {
  const conn = connections.get(ssl);
  if (!conn) return;
  if (conn.http2) return;
  if (conn.state !== "reading_response") return;

  conn.responseBodyRead += byteCount;

  if (isResponseComplete(conn)) {
    emitHttpMessage(conn);
    resetForNextRequest(conn);
  } else {
    scheduleIdleFlush(ssl, conn);
  }
}

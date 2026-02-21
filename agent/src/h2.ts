import { HpackDecoder } from "./hpack";

const FRAME_HEADER_SIZE = 9;
const MAX_BODY_BYTES = 65536;

const FRAME_DATA = 0x0;
const FRAME_HEADERS = 0x1;
const FRAME_RST_STREAM = 0x3;
const FRAME_GOAWAY = 0x7;
const FRAME_CONTINUATION = 0x9;

const FLAG_END_STREAM = 0x1;
const FLAG_END_HEADERS = 0x4;
const FLAG_PADDED = 0x8;
const FLAG_PRIORITY = 0x20;

interface H2Stream {
  id: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: Uint8Array;
  responseBody: Uint8Array;
  requestBodySize: number;
  responseBodySize: number;
  startTime: number;
  requestComplete: boolean;
  responseComplete: boolean;
  headerBuffer: Uint8Array;
  expectContinuation: boolean;
  continuationIsRequest: boolean;
}

interface H2Connection {
  requestDecoder: HpackDecoder;
  responseDecoder: HpackDecoder;
  streams: Map<number, H2Stream>;
  writeBuffer: Uint8Array;
  readBuffer: Uint8Array;
}

const h2Connections = new Map<string, H2Connection>();

let requestCounter = 0;

function generateId(): string {
  return `h2-${Date.now()}-${++requestCounter}`;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function bodyToString(body: Uint8Array): string | null {
  if (body.length === 0) return null;
  let s = "";
  for (let i = 0; i < body.length; i++) {
    s += String.fromCharCode(body[i]);
  }
  return s;
}

function getOrCreateH2(ssl: string): H2Connection {
  let conn = h2Connections.get(ssl);
  if (!conn) {
    conn = {
      requestDecoder: new HpackDecoder(),
      responseDecoder: new HpackDecoder(),
      streams: new Map(),
      writeBuffer: new Uint8Array(0),
      readBuffer: new Uint8Array(0),
    };
    h2Connections.set(ssl, conn);
  }
  return conn;
}

function getOrCreateStream(h2: H2Connection, streamId: number): H2Stream {
  let stream = h2.streams.get(streamId);
  if (!stream) {
    stream = {
      id: streamId,
      requestHeaders: {},
      responseHeaders: {},
      requestBody: new Uint8Array(0),
      responseBody: new Uint8Array(0),
      requestBodySize: 0,
      responseBodySize: 0,
      startTime: Date.now(),
      requestComplete: false,
      responseComplete: false,
      headerBuffer: new Uint8Array(0),
      expectContinuation: false,
      continuationIsRequest: false,
    };
    h2.streams.set(streamId, stream);
  }
  return stream;
}

function emitH2Message(stream: H2Stream): void {
  if (!stream.requestHeaders[":method"]) return;

  const method = stream.requestHeaders[":method"] ?? "GET";
  const scheme = stream.requestHeaders[":scheme"] ?? "https";
  const authority = stream.requestHeaders[":authority"] ?? "unknown";
  const path = stream.requestHeaders[":path"] ?? "/";
  const url = `${scheme}://${authority}${path}`;
  const duration = Date.now() - stream.startTime;
  const statusStr = stream.responseHeaders[":status"] ?? "0";
  const statusCode = parseInt(statusStr, 10) || 0;

  const requestHeaders: Record<string, string> = {};
  for (const k of Object.keys(stream.requestHeaders)) {
    if (!k.startsWith(":")) requestHeaders[k] = stream.requestHeaders[k];
  }
  requestHeaders["host"] = authority;

  const responseHeaders: Record<string, string> = {};
  for (const k of Object.keys(stream.responseHeaders)) {
    if (!k.startsWith(":")) responseHeaders[k] = stream.responseHeaders[k];
  }

  send({
    type: "http",
    payload: {
      id: generateId(),
      method,
      url,
      requestHeaders,
      requestBody: bodyToString(stream.requestBody),
      requestBodySize: stream.requestBodySize,
      statusCode,
      responseHeaders,
      responseBody: bodyToString(stream.responseBody),
      responseBodySize: stream.responseBodySize,
      duration,
      timestamp: Date.now(),
    },
  });
}

function processHeaderBlock(
  h2: H2Connection,
  stream: H2Stream,
  headerData: Uint8Array,
  isRequest: boolean,
): void {
  try {
    const decoder = isRequest ? h2.requestDecoder : h2.responseDecoder;
    const headers = decoder.decode(headerData, 0, headerData.length);
    if (isRequest) {
      for (const k of Object.keys(headers)) {
        stream.requestHeaders[k] = headers[k];
      }
      if (!stream.startTime || stream.startTime === 0) {
        stream.startTime = Date.now();
      }
    } else {
      for (const k of Object.keys(headers)) {
        stream.responseHeaders[k] = headers[k];
      }
    }
  } catch (_) {}
}

function processFrames(ssl: string, data: Uint8Array, isWrite: boolean): void {
  const h2 = getOrCreateH2(ssl);

  const bufKey = isWrite ? "writeBuffer" : "readBuffer";
  let buffer = concat(h2[bufKey], data);
  let pos = 0;

  while (pos + FRAME_HEADER_SIZE <= buffer.length) {
    const length = (buffer[pos] << 16) | (buffer[pos + 1] << 8) | buffer[pos + 2];
    const type = buffer[pos + 3];
    const flags = buffer[pos + 4];
    const streamId = ((buffer[pos + 5] & 0x7f) << 24) | (buffer[pos + 6] << 16) | (buffer[pos + 7] << 8) | buffer[pos + 8];

    if (pos + FRAME_HEADER_SIZE + length > buffer.length) break;

    const frameStart = pos + FRAME_HEADER_SIZE;
    pos += FRAME_HEADER_SIZE + length;

    if (streamId === 0) continue;

    const stream = getOrCreateStream(h2, streamId);

    if (type === FRAME_HEADERS) {
      let hdrOffset = frameStart;
      let hdrEnd = frameStart + length;

      if (flags & FLAG_PADDED) {
        const padLength = buffer[hdrOffset];
        hdrOffset += 1;
        hdrEnd -= padLength;
      }

      if (flags & FLAG_PRIORITY) {
        hdrOffset += 5;
      }

      if (hdrOffset > hdrEnd) continue;

      const headerData = buffer.subarray(hdrOffset, hdrEnd);

      if (flags & FLAG_END_HEADERS) {
        processHeaderBlock(h2, stream, headerData, isWrite);
      } else {
        stream.headerBuffer = headerData.slice();
        stream.expectContinuation = true;
        stream.continuationIsRequest = isWrite;
      }

      if (flags & FLAG_END_STREAM) {
        if (isWrite) stream.requestComplete = true;
        else stream.responseComplete = true;
      }
    } else if (type === FRAME_CONTINUATION) {
      if (stream.expectContinuation) {
        const contData = buffer.subarray(frameStart, frameStart + length);
        stream.headerBuffer = concat(stream.headerBuffer, contData);

        if (flags & FLAG_END_HEADERS) {
          stream.expectContinuation = false;
          processHeaderBlock(h2, stream, stream.headerBuffer, stream.continuationIsRequest);
          stream.headerBuffer = new Uint8Array(0);
        }
      }
    } else if (type === FRAME_DATA) {
      let dataOffset = frameStart;
      let dataEnd = frameStart + length;

      if (flags & FLAG_PADDED) {
        const padLength = buffer[dataOffset];
        dataOffset += 1;
        dataEnd -= padLength;
      }

      if (dataOffset < dataEnd) {
        const bodyChunk = buffer.subarray(dataOffset, dataEnd);
        if (isWrite) {
          stream.requestBodySize += bodyChunk.length;
          if (stream.requestBody.length < MAX_BODY_BYTES) {
            const cap = Math.min(bodyChunk.length, MAX_BODY_BYTES - stream.requestBody.length);
            stream.requestBody = concat(stream.requestBody, bodyChunk.subarray(0, cap));
          }
        } else {
          stream.responseBodySize += bodyChunk.length;
          if (stream.responseBody.length < MAX_BODY_BYTES) {
            const cap = Math.min(bodyChunk.length, MAX_BODY_BYTES - stream.responseBody.length);
            stream.responseBody = concat(stream.responseBody, bodyChunk.subarray(0, cap));
          }
        }
      }

      if (flags & FLAG_END_STREAM) {
        if (isWrite) stream.requestComplete = true;
        else stream.responseComplete = true;
      }
    } else if (type === FRAME_RST_STREAM) {
      if (stream.requestHeaders[":method"]) {
        emitH2Message(stream);
      }
      h2.streams.delete(streamId);
      continue;
    }

    if (stream.requestComplete && stream.responseComplete) {
      emitH2Message(stream);
      h2.streams.delete(streamId);
    }
  }

  h2[bufKey] = pos < buffer.length ? buffer.subarray(pos).slice() : new Uint8Array(0);
}

export function onH2Write(ssl: string, data: Uint8Array): void {
  try {
    processFrames(ssl, data, true);
  } catch (_) {}
}

export function onH2Read(ssl: string, data: Uint8Array): void {
  try {
    processFrames(ssl, data, false);
  } catch (_) {}
}

export function onH2Free(ssl: string): void {
  const h2 = h2Connections.get(ssl);
  if (!h2) return;

  for (const stream of h2.streams.values()) {
    if (stream.requestHeaders[":method"]) {
      emitH2Message(stream);
    }
  }

  h2Connections.delete(ssl);
}

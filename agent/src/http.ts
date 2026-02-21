const HEADER_END = [0x0d, 0x0a, 0x0d, 0x0a];
const CRLF = [0x0d, 0x0a];

export interface ParsedRequestHead {
  method: string;
  path: string;
  headers: Record<string, string>;
  headLength: number;
}

export interface ParsedResponseHead {
  statusCode: number;
  headers: Record<string, string>;
  headLength: number;
}

function findSequence(data: Uint8Array, seq: number[], start = 0): number {
  const len = data.length - seq.length + 1;
  outer: for (let i = start; i < len; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (data[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function decodeAscii(data: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) {
    s += String.fromCharCode(data[i]);
  }
  return s;
}

function parseHeaders(
  data: Uint8Array,
  lineStart: number,
  headEnd: number,
): Record<string, string> {
  const headers: Record<string, string> = {};
  let pos = lineStart;

  while (pos < headEnd) {
    const lineEnd = findSequence(data, CRLF, pos);
    if (lineEnd === -1 || lineEnd >= headEnd) break;
    const line = decodeAscii(data, pos, lineEnd);
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const name = line.substring(0, colonIdx).trim().toLowerCase();
      const value = line.substring(colonIdx + 1).trim();
      headers[name] = value;
    }
    pos = lineEnd + 2;
  }

  return headers;
}

export function isHttpRequest(data: Uint8Array): boolean {
  if (data.length < 16) return false;
  const methods = ["GET ", "POST ", "PUT ", "DELETE ", "PATCH ", "HEAD ", "OPTIONS ", "CONNECT "];
  const start = decodeAscii(data, 0, Math.min(data.length, 10));
  for (const m of methods) {
    if (start.startsWith(m)) return true;
  }
  return false;
}

export function isHttpResponse(data: Uint8Array): boolean {
  if (data.length < 12) return false;
  const start = decodeAscii(data, 0, 9);
  return start.startsWith("HTTP/1.") || start.startsWith("HTTP/1 ");
}

export function isHttp2Preface(data: Uint8Array): boolean {
  if (data.length < 24) return false;
  const preface = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
  const start = decodeAscii(data, 0, 24);
  return start === preface;
}

export function parseRequestHead(data: Uint8Array): ParsedRequestHead | null {
  const headEnd = findSequence(data, HEADER_END);
  if (headEnd === -1) return null;

  const headLength = headEnd + 4;
  const firstLineEnd = findSequence(data, CRLF, 0);
  if (firstLineEnd === -1) return null;

  const requestLine = decodeAscii(data, 0, firstLineEnd);
  const parts = requestLine.split(" ");
  if (parts.length < 2) return null;

  const method = parts[0];
  const path = parts[1];
  const headers = parseHeaders(data, firstLineEnd + 2, headEnd);

  return { method, path, headers, headLength };
}

export function parseResponseHead(data: Uint8Array): ParsedResponseHead | null {
  const headEnd = findSequence(data, HEADER_END);
  if (headEnd === -1) return null;

  const headLength = headEnd + 4;
  const firstLineEnd = findSequence(data, CRLF, 0);
  if (firstLineEnd === -1) return null;

  const statusLine = decodeAscii(data, 0, firstLineEnd);
  const parts = statusLine.split(" ");
  if (parts.length < 2) return null;

  const statusCode = parseInt(parts[1], 10);
  if (isNaN(statusCode)) return null;

  const headers = parseHeaders(data, firstLineEnd + 2, headEnd);

  return { statusCode, headers, headLength };
}

const CHUNKED_END = [0x30, 0x0d, 0x0a, 0x0d, 0x0a];

export function containsChunkedEnd(data: Uint8Array): boolean {
  return findSequence(data, CHUNKED_END) !== -1;
}

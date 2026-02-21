const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(data: Uint8Array): string {
  let result = "";
  const len = data.length;
  let i = 0;
  while (i < len) {
    const a = data[i++];
    const b = i < len ? data[i++] : 0;
    const c = i < len ? data[i++] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += B64[(triplet >> 18) & 0x3f];
    result += B64[(triplet >> 12) & 0x3f];
    result += i - 2 < len ? B64[(triplet >> 6) & 0x3f] : "=";
    result += i - 1 < len ? B64[triplet & 0x3f] : "=";
  }
  return result;
}

const TEXT_TYPES = /text\/|json|xml|html|javascript|css|csv|svg|yaml|toml|plain|urlencoded/i;

function isTextContentType(contentType: string): boolean {
  return TEXT_TYPES.test(contentType);
}

function bodyToString(body: Uint8Array): string {
  let s = "";
  for (let i = 0; i < body.length; i++) {
    s += String.fromCharCode(body[i]);
  }
  return s;
}

export interface EncodedBody {
  body: string | null;
  encoding: "text" | "base64";
}

export function encodeBody(
  raw: Uint8Array | null,
  contentType: string,
): EncodedBody {
  if (!raw || raw.length === 0) return { body: null, encoding: "text" };
  if (isTextContentType(contentType)) {
    return { body: bodyToString(raw), encoding: "text" };
  }
  return { body: base64Encode(raw), encoding: "base64" };
}

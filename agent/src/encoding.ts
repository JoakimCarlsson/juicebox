const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(data: Uint8Array): string {
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

export interface EncodedBody {
  body: string | null;
  encoding: "base64";
}

export function encodeBody(
  raw: Uint8Array | null,
  _contentType: string,
): EncodedBody {
  if (!raw || raw.length === 0) return { body: null, encoding: "base64" };
  return { body: base64Encode(raw), encoding: "base64" };
}

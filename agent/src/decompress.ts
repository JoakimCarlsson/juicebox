const Z_OK = 0;
const Z_STREAM_END = 1;
const Z_FINISH = 4;
const BROTLI_SUCCESS = 1;
const OUTPUT_SIZE = 524288;

const is64 = Process.pointerSize === 8;
const Z_STREAM_SIZE = is64 ? 112 : 56;

const OFF_NEXT_IN = 0;
const OFF_AVAIL_IN = is64 ? 8 : 4;
const OFF_NEXT_OUT = is64 ? 24 : 12;
const OFF_AVAIL_OUT = is64 ? 32 : 16;

let _inflateInit2_: NativeFunction<number, [NativePointer, number, NativePointer, number]> | null = null;
let _inflate: NativeFunction<number, [NativePointer, number]> | null = null;
let _inflateEnd: NativeFunction<number, [NativePointer]> | null = null;
let _zlibVersion: NativeFunction<NativePointer, []> | null = null;
let versionPtr: NativePointer = NULL;

function findExport(libName: string, funcName: string): NativePointer | null {
  const mod = Process.findModuleByName(libName);
  return mod ? mod.findExportByName(funcName) : null;
}

function findExportAny(funcName: string, libNames: string[]): NativePointer | null {
  for (const lib of libNames) {
    const addr = findExport(lib, funcName);
    if (addr) return addr;
  }
  for (const mod of Process.enumerateModules()) {
    const addr = mod.findExportByName(funcName);
    if (addr) return addr;
  }
  return null;
}

try {
  const zv = findExport("libz.so", "zlibVersion");
  const zi = findExport("libz.so", "inflateInit2_");
  const inf = findExport("libz.so", "inflate");
  const ze = findExport("libz.so", "inflateEnd");
  if (zv && zi && inf && ze) {
    _zlibVersion = new NativeFunction(zv, "pointer", []);
    _inflateInit2_ = new NativeFunction(zi, "int", ["pointer", "int", "pointer", "int"]);
    _inflate = new NativeFunction(inf, "int", ["pointer", "int"]);
    _inflateEnd = new NativeFunction(ze, "int", ["pointer"]);
    versionPtr = _zlibVersion() as NativePointer;
  }
} catch (_) {}

let _brotliDecompress: NativeFunction<number, [number | UInt64, NativePointer, NativePointer, NativePointer]> | null = null;

try {
  const addr = findExportAny("BrotliDecoderDecompress", ["libbrotlidec.so", "libbrotlidec.so.1"]);
  if (addr) {
    _brotliDecompress = new NativeFunction(addr, "int", ["size_t", "pointer", "pointer", "pointer"]);
  }
} catch (_) {}

function toArrayBuffer(input: Uint8Array): ArrayBuffer {
  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
}

function zlibDecompress(input: Uint8Array, windowBits: number): Uint8Array | null {
  if (!_inflateInit2_ || !_inflate || !_inflateEnd) return null;

  const strm = Memory.alloc(Z_STREAM_SIZE);
  const inputBuf = Memory.alloc(input.length);
  inputBuf.writeByteArray(toArrayBuffer(input));
  const outputBuf = Memory.alloc(OUTPUT_SIZE);

  strm.add(OFF_NEXT_IN).writePointer(inputBuf);
  strm.add(OFF_AVAIL_IN).writeU32(input.length);
  strm.add(OFF_NEXT_OUT).writePointer(outputBuf);
  strm.add(OFF_AVAIL_OUT).writeU32(OUTPUT_SIZE);

  let ret = _inflateInit2_(strm, windowBits, versionPtr, Z_STREAM_SIZE) as number;
  if (ret !== Z_OK) return null;

  ret = _inflate(strm, Z_FINISH) as number;
  const availOut = strm.add(OFF_AVAIL_OUT).readU32();
  const produced = OUTPUT_SIZE - availOut;

  _inflateEnd(strm);

  if (ret !== Z_STREAM_END && ret !== Z_OK) return null;
  if (produced <= 0) return null;

  const result = outputBuf.readByteArray(produced);
  return result ? new Uint8Array(result) : null;
}

function brotliDecompress(input: Uint8Array): Uint8Array | null {
  if (!_brotliDecompress) return null;

  const inputBuf = Memory.alloc(input.length);
  inputBuf.writeByteArray(toArrayBuffer(input));
  const outputBuf = Memory.alloc(OUTPUT_SIZE);
  const decodedSizePtr = Memory.alloc(Process.pointerSize);
  if (is64) {
    decodedSizePtr.writeU64(OUTPUT_SIZE);
  } else {
    decodedSizePtr.writeU32(OUTPUT_SIZE);
  }

  const ret = _brotliDecompress(input.length, inputBuf, decodedSizePtr, outputBuf) as number;
  if (ret !== BROTLI_SUCCESS) return null;

  const decodedSize = is64 ? decodedSizePtr.readU64() : decodedSizePtr.readU32();
  const size = typeof decodedSize === "number" ? decodedSize : Number(decodedSize);
  if (size <= 0) return null;

  const result = outputBuf.readByteArray(size);
  return result ? new Uint8Array(result) : null;
}

export function decompressBody(
  raw: Uint8Array | null,
  contentEncoding: string,
): Uint8Array | null {
  if (!raw || raw.length === 0) return raw;
  const enc = contentEncoding.trim().toLowerCase();
  if (!enc || enc === "identity") return raw;

  try {
    if (enc === "gzip" || enc === "x-gzip") {
      return zlibDecompress(raw, 31) ?? raw;
    }
    if (enc === "deflate") {
      return zlibDecompress(raw, -15) ?? raw;
    }
    if (enc === "br") {
      return brotliDecompress(raw) ?? raw;
    }
  } catch (_) {}
  return raw;
}

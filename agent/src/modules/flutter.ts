// @ts-nocheck
/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";
import Java from "frida-java-bridge";

let _channelsEnabled = false;
let _counter = 0;

function generateId(): string {
  return `flutter-${Date.now()}-${++_counter}`;
}

function isFlutter(): { flutter: boolean; cronet: boolean } {
  const flutter = Process.findModuleByName("libflutter.so") !== null;
  const cronet = Process.findModuleByName("libcronet.so") !== null;
  return { flutter, cronet };
}

function createCodecReader(bytes: number[]) {
  let offset = 0;

  function readByte(): number {
    return bytes[offset++];
  }

  function readU32(): number {
    const b0 = bytes[offset++];
    const b1 = bytes[offset++];
    const b2 = bytes[offset++];
    const b3 = bytes[offset++];
    return (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
  }

  function readSize(): number {
    const b = readByte();
    if (b < 254) return b;
    if (b === 254) {
      const lo = bytes[offset++];
      const hi = bytes[offset++];
      return (hi << 8) | lo;
    }
    return readU32();
  }

  function readAlignment(alignment: number): void {
    const mod = offset % alignment;
    if (mod !== 0) offset += alignment - mod;
  }

  function readUtf8(length: number): string {
    const slice = bytes.slice(offset, offset + length);
    offset += length;
    let str = "";
    for (let i = 0; i < slice.length; i++) {
      str += String.fromCharCode(slice[i]);
    }
    return str;
  }

  function readValue(): unknown {
    const type = readByte();
    switch (type) {
      case 0:
        return null;
      case 1:
        return true;
      case 2:
        return false;
      case 3: {
        const val = readU32();
        return val | 0;
      }
      case 4: {
        readAlignment(8);
        const lo = readU32();
        const hi = readU32();
        return hi * 0x100000000 + lo;
      }
      case 6: {
        readAlignment(8);
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        for (let i = 0; i < 8; i++) view.setUint8(i, bytes[offset++]);
        return view.getFloat64(0, true);
      }
      case 7: {
        const len = readSize();
        return readUtf8(len);
      }
      case 8: {
        const len = readSize();
        const arr = bytes.slice(offset, offset + len);
        offset += len;
        return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      case 9: {
        const len = readSize();
        const list: unknown[] = [];
        for (let i = 0; i < len; i++) list.push(readValue());
        return list;
      }
      case 10: {
        const len = readSize();
        const map: Record<string, unknown> = {};
        for (let i = 0; i < len; i++) {
          const key = readValue();
          const val = readValue();
          map[String(key)] = val;
        }
        return map;
      }
      default:
        return `<type_${type}>`;
    }
  }

  return {
    readByte,
    readSize,
    readUtf8,
    readValue,
    getOffset: () => offset,
    length: bytes.length,
  };
}

function decodeStandardMethodCodec(
  bytes: number[],
): { method: string; args: unknown } | null {
  try {
    const reader = createCodecReader(bytes);
    const methodType = reader.readByte();
    if (methodType !== 7) return null;
    const methodLen = reader.readSize();
    const method = reader.readUtf8(methodLen);

    let args: unknown = null;
    if (reader.getOffset() < reader.length) {
      args = reader.readValue();
    }

    return { method, args };
  } catch (_) {
    return null;
  }
}

function decodeStandardMessageCodec(bytes: number[]): unknown {
  try {
    const reader = createCodecReader(bytes);
    return reader.readValue();
  } catch (_) {
    return null;
  }
}

function readByteBuffer(buf: any): number[] | null {
  try {
    const limit = buf.limit();
    if (limit <= 0) return null;

    try {
      const arr = buf.array();
      const arrayOffset = buf.arrayOffset();
      const result: number[] = [];
      for (let i = 0; i < limit; i++) {
        result.push(arr[arrayOffset + i] & 0xff);
      }
      return result;
    } catch (_) {}

    const addressField = Java.use("java.nio.Buffer").class.getDeclaredField("address");
    addressField.setAccessible(true);
    const address = addressField.getLong(buf);
    if (address.toInt32() === 0) return null;
    const nativeBytes = Memory.readByteArray(ptr(address.toString()), limit);
    if (!nativeBytes) return null;
    const view = new Uint8Array(nativeBytes);
    const result: number[] = [];
    for (let i = 0; i < view.length; i++) {
      result.push(view[i]);
    }
    return result;
  } catch (_) {
    return null;
  }
}

function parsePigeonChannel(channel: string): string | null {
  if (!channel.startsWith("dev.flutter.pigeon.")) return null;
  const parts = channel.split(".");
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) {
    return parts[parts.length - 2] ?? null;
  }
  return last;
}

function decodeMessage(
  channel: string,
  buf: any,
): { method: string | null; data: string | null } {
  if (buf === null) return { method: parsePigeonChannel(channel), data: null };

  const bytes = readByteBuffer(buf);
  if (!bytes || bytes.length === 0) {
    return { method: parsePigeonChannel(channel), data: null };
  }

  const methodCodec = decodeStandardMethodCodec(bytes);
  if (methodCodec) {
    return {
      method: methodCodec.method,
      data: methodCodec.args != null ? JSON.stringify(methodCodec.args) : null,
    };
  }

  const pigeonMethod = parsePigeonChannel(channel);
  const msgCodec = decodeStandardMessageCodec(bytes);
  if (msgCodec != null) {
    return {
      method: pigeonMethod,
      data: JSON.stringify(msgCodec),
    };
  }

  const hex = bytes
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
  return { method: pigeonMethod, data: `hex:${hex}` };
}

function decodeReply(buf: any): string | null {
  if (buf === null) return null;

  const bytes = readByteBuffer(buf);
  if (!bytes || bytes.length === 0) return null;

  const methodCodec = decodeStandardMethodCodec(bytes);
  if (methodCodec) {
    return methodCodec.args != null ? JSON.stringify(methodCodec.args) : null;
  }

  const msgCodec = decodeStandardMessageCodec(bytes);
  if (msgCodec != null) return JSON.stringify(msgCodec);

  return `hex:${bytes.map((b: number) => b.toString(16).padStart(2, "0")).join("")}`;
}

function enableChannels(): { enabled: boolean } {
  if (_channelsEnabled) return { enabled: true };
  if (!Java.available) return { enabled: false };

  Java.perform(() => {
    try {
      const FlutterJNI = Java.use("io.flutter.embedding.engine.FlutterJNI");

      const hpmOverloads = FlutterJNI.handlePlatformMessage.overloads;
      for (const overload of hpmOverloads) {
        overload.implementation = function (...args: any[]) {
          try {
            const channel = args[0] as string;
            const message = args[1];
            const { method, data } = decodeMessage(channel, message);

            send({
              type: "flutter_channel",
              payload: {
                id: generateId(),
                channel,
                method,
                direction: "dart_to_native",
                arguments: data,
                result: null,
                timestamp: Date.now(),
              },
            });
          } catch (_) {}

          return overload.apply(this, args);
        };
      }
    } catch (_) {}

    try {
      const FlutterJNI = Java.use("io.flutter.embedding.engine.FlutterJNI");

      const iprcOverloads =
        FlutterJNI.invokePlatformMessageResponseCallback.overloads;
      for (const overload of iprcOverloads) {
        overload.implementation = function (...args: any[]) {
          try {
            const replyId = args[0] as number;
            const reply = args[1];

            send({
              type: "flutter_channel",
              payload: {
                id: generateId(),
                channel: `reply:${replyId}`,
                method: null,
                direction: "native_to_dart",
                arguments: null,
                result: decodeReply(reply),
                timestamp: Date.now(),
              },
            });
          } catch (_) {}

          return overload.apply(this, args);
        };
      }
    } catch (_) {}
  });

  _channelsEnabled = true;
  return { enabled: true };
}

function disableChannels(): { disabled: boolean } {
  return { disabled: false };
}

const flutter: AgentModule = {
  isFlutter,
  enableChannels,
  disableChannels,
};
export default flutter;

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

function decodeStandardMethodCodec(
  bytes: number[],
): { method: string; args: unknown } | null {
  try {
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

    const methodType = readByte();
    if (methodType !== 7) return null;
    const methodLen = readSize();
    const method = readUtf8(methodLen);

    let args: unknown = null;
    if (offset < bytes.length) {
      args = readValue();
    }

    return { method, args };
  } catch (_) {
    return null;
  }
}

function javaByteArrayToNumbers(javaArray: any): number[] {
  const len = javaArray.length;
  const result: number[] = [];
  for (let i = 0; i < len; i++) {
    result.push(javaArray[i] & 0xff);
  }
  return result;
}

function enableChannels(): { enabled: boolean } {
  if (_channelsEnabled) return { enabled: true };
  if (!Java.available) return { enabled: false };

  Java.perform(() => {
    try {
      const FlutterJNI = Java.use("io.flutter.embedding.engine.FlutterJNI");

      // handlePlatformMessage signature varies by Flutter version.
      // Try common overloads: (String, ByteBuffer, int) or (String, [B, int).
      const hpmOverloads = FlutterJNI.handlePlatformMessage.overloads;
      for (const overload of hpmOverloads) {
        overload.implementation = function (...args: any[]) {
          try {
            const channel = args[0] as string;
            const message = args[1];

            let decoded: { method: string; args: unknown } | null = null;
            let rawHex: string | null = null;

            if (message !== null) {
              try {
                const arr = message.array();
                const bytes = javaByteArrayToNumbers(arr);
                decoded = decodeStandardMethodCodec(bytes);
                if (!decoded) {
                  rawHex = bytes
                    .map((b: number) => b.toString(16).padStart(2, "0"))
                    .join("");
                }
              } catch (_) {
                // ByteBuffer.array() may fail for direct buffers
              }
            }

            send({
              type: "flutter_channel",
              payload: {
                id: generateId(),
                channel,
                method: decoded?.method ?? null,
                direction: "dart_to_native",
                arguments: decoded?.args
                  ? JSON.stringify(decoded.args)
                  : rawHex
                    ? `hex:${rawHex}`
                    : null,
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

            let decoded: { method: string; args: unknown } | null = null;
            let rawHex: string | null = null;

            if (reply !== null) {
              try {
                const arr = reply.array();
                const bytes = javaByteArrayToNumbers(arr);
                decoded = decodeStandardMethodCodec(bytes);
                if (!decoded) {
                  rawHex = bytes
                    .map((b: number) => b.toString(16).padStart(2, "0"))
                    .join("");
                }
              } catch (_) {
                // ByteBuffer.array() may fail for direct buffers
              }
            }

            send({
              type: "flutter_channel",
              payload: {
                id: generateId(),
                channel: `reply:${replyId}`,
                method: decoded?.method ?? null,
                direction: "native_to_dart",
                arguments: null,
                result: decoded?.args
                  ? JSON.stringify(decoded.args)
                  : rawHex
                    ? `hex:${rawHex}`
                    : null,
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

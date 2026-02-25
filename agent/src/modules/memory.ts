/// <reference types="npm:@types/frida-gum" />

import type { AgentModule } from "../types";

let _cancelled = false;
let _scanning = false;
let _counter = 0;

function generateId(): string {
  return `mem-${Date.now()}-${++_counter}`;
}

function isHexPattern(input: string): boolean {
  const tokens = input.trim().split(/\s+/);
  return tokens.every((t) => /^([0-9a-fA-F]{2}|\?\?)$/.test(t));
}

function stringToHexPattern(str: string): string {
  const bytes: string[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i).toString(16).padStart(2, "0"));
  }
  return bytes.join(" ");
}

function normalizePattern(input: string): string {
  const trimmed = input.trim();
  if (isHexPattern(trimmed)) return trimmed;
  return stringToHexPattern(trimmed);
}

function hexDumpBytes(ptr: NativePointer, size: number): string {
  const buf = ptr.readByteArray(size);
  if (buf === null) return "";
  const arr = new Uint8Array(buf);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function utf8Preview(ptr: NativePointer, size: number): string {
  const buf = ptr.readByteArray(size);
  if (buf === null) return "";
  const arr = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    out += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".";
  }
  return out;
}

function readContext(
  matchAddr: NativePointer,
  matchSize: number,
): { hexDump: string; utf8Preview: string } {
  const contextBefore = 16;
  const contextAfter = 16;
  const start = matchAddr.sub(contextBefore);
  const totalSize = contextBefore + matchSize + contextAfter;

  try {
    return {
      hexDump: hexDumpBytes(start, totalSize),
      utf8Preview: utf8Preview(start, totalSize),
    };
  } catch (_) {
    try {
      return {
        hexDump: hexDumpBytes(matchAddr, matchSize),
        utf8Preview: utf8Preview(matchAddr, matchSize),
      };
    } catch (_) {
      return { hexDump: "", utf8Preview: "" };
    }
  }
}

function scanRange(
  base: NativePointer,
  size: number,
  pattern: string,
): Promise<
  { address: string; matchSize: number; hexDump: string; utf8Preview: string }[]
> {
  return new Promise((resolve) => {
    const matches: {
      address: string;
      matchSize: number;
      hexDump: string;
      utf8Preview: string;
    }[] = [];
    Memory.scan(base, size, pattern, {
      onMatch(address, sz) {
        if (_cancelled) return "stop";
        const ctx = readContext(address, sz);
        matches.push({
          address: address.toString(),
          matchSize: sz,
          hexDump: ctx.hexDump,
          utf8Preview: ctx.utf8Preview,
        });
        send({
          type: "memoryScan",
          payload: {
            event: "match",
            id: generateId(),
            address: address.toString(),
            size: sz,
            hexDump: ctx.hexDump,
            utf8Preview: ctx.utf8Preview,
          },
        });
      },
      onError(_reason) {},
      onComplete() {
        resolve(matches);
      },
    });
  });
}

async function runScan(
  hexPattern: string,
  ranges: RangeDetails[],
): Promise<void> {
  const total = ranges.length;
  let matchCount = 0;

  for (let i = 0; i < ranges.length; i++) {
    if (_cancelled) break;

    send({
      type: "memoryScan",
      payload: {
        event: "progress",
        current: i + 1,
        total,
      },
    });

    try {
      const matches = await scanRange(
        ranges[i].base,
        ranges[i].size,
        hexPattern,
      );
      matchCount += matches.length;
    } catch (_) {}

    if (_cancelled) break;
  }

  _scanning = false;

  send({
    type: "memoryScan",
    payload: {
      event: "done",
      count: matchCount,
    },
  });
}

function scan(rawPattern: unknown): { started: boolean } {
  const pattern = String(rawPattern ?? "");
  if (!pattern) return { started: false };

  _cancelled = true;

  const hexPattern = normalizePattern(pattern);
  const ranges = Process.enumerateRanges("r--");

  _cancelled = false;
  _scanning = true;

  runScan(hexPattern, ranges);

  return { started: true };
}

function stopScan(): { stopped: boolean } {
  _cancelled = true;
  return { stopped: true };
}

function scanSync(
  rawPattern: unknown,
  rawMaxResults?: unknown,
): { address: string; size: number; hexDump: string; utf8Preview: string }[] {
  const pattern = String(rawPattern ?? "");
  if (!pattern) return [];
  const maxResults = typeof rawMaxResults === "number"
    ? rawMaxResults
    : undefined;
  const hexPattern = normalizePattern(pattern);
  const ranges = Process.enumerateRanges("r--");
  const limit = maxResults ?? 100;
  const results: {
    address: string;
    size: number;
    hexDump: string;
    utf8Preview: string;
  }[] = [];

  for (const range of ranges) {
    if (results.length >= limit) break;
    try {
      const matches = Memory.scanSync(range.base, range.size, hexPattern);
      for (const m of matches) {
        if (results.length >= limit) break;
        const ctx = readContext(m.address, m.size);
        results.push({
          address: m.address.toString(),
          size: m.size,
          hexDump: ctx.hexDump,
          utf8Preview: ctx.utf8Preview,
        });
      }
    } catch (_) {}
  }

  return results;
}

function dump(rawAddress: unknown, rawSize: unknown): string {
  const address = String(rawAddress ?? "0");
  const size = Number(rawSize) || 0;
  if (!size) return "";
  const ptr = new NativePointer(address);
  return hexDumpBytes(ptr, size);
}

function allocedRanges(): { base: string; size: number; protection: string }[] {
  return Process.enumerateRanges("r--").map((r) => ({
    base: r.base.toString(),
    size: r.size,
    protection: r.protection,
  }));
}

const memory: AgentModule = { scan, stopScan, scanSync, dump, allocedRanges };
export default memory;

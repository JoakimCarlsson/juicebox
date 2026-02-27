import type { DeviceState, JsonRpcResponse, SessionState } from "./types.ts";

export const sessions = new Map<string, SessionState>();
export const devices = new Map<string, DeviceState>();
let sessionCounter = 0;

export function generateSessionId(): string {
  return `s-${++sessionCounter}-${Date.now()}`;
}

export function ok(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function fail(
  id: number | string,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function broadcast(state: SessionState, line: string): void {
  if (state.subscribers.size === 0) {
    state.messageBuffer.push(line);
  } else {
    const encoded = new TextEncoder().encode(line);
    for (const sub of state.subscribers) {
      sub.write(encoded).catch(() => {
        state.subscribers.delete(sub);
      });
    }
  }
}

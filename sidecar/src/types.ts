import type frida from "frida";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink";
  size: number;
  permissions: string;
  modifiedAt: string;
}

export interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface UserScriptState {
  name: string;
  script: frida.Script;
  messages: unknown[];
  startedAt: number;
  done: boolean;
}

export interface SessionState {
  id: string;
  deviceId: string;
  identifier: string;
  pid: number;
  session: frida.Session;
  script: frida.Script;
  subscribers: Set<Deno.Conn>;
  messageBuffer: string[];
  userScripts: Map<string, UserScriptState>;
}

export interface DeviceState {
  id: string;
  device: frida.Device;
  platform: string;
}

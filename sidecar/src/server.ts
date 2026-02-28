import type { JsonRpcRequest, JsonRpcResponse } from "./types.ts";
import { fail, ok, sessions } from "./state.ts";
import {
  handleAttach,
  handleDetach,
  handleDetachApp,
  handleResumeApp,
  handleSpawnApp,
} from "./methods/session.ts";
import {
  handleConnectDevice,
  handleDisconnectDevice,
} from "./methods/device-connection.ts";
import {
  handleCompileScript,
  handleGetScriptOutput,
  handleRunScript,
  handleStopScript,
} from "./methods/scripts.ts";
import {
  handleGetAppIcon,
  handleGetDeviceInfo,
  handleListApps,
  handleListDevices,
  handleListProcesses,
} from "./methods/device.ts";
import {
  handleFindFiles,
  handleListFiles,
  handlePullDatabase,
  handleReadFile,
} from "./methods/files.ts";
import {
  handleAgentInterfaces,
  handleAgentInvoke,
  handleAgentRestore,
  handleAgentSnapshot,
} from "./methods/agent.ts";

export const SOCKET_PATH = Deno.env.get("JUICEBOX_SOCKET") ??
  "/tmp/juicebox.sock";

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    switch (req.method) {
      case "ping":
        return ok(req.id, "pong");

      case "listDevices":
        return await handleListDevices(req);

      case "listApps":
        return await handleListApps(req);

      case "listProcesses":
        return await handleListProcesses(req);

      case "getDeviceInfo":
        return await handleGetDeviceInfo(req);

      case "getAppIcon":
        return await handleGetAppIcon(req);

      case "connectDevice":
        return await handleConnectDevice(req);

      case "disconnectDevice":
        return await handleDisconnectDevice(req);

      case "spawnApp":
        return await handleSpawnApp(req);

      case "detachApp":
        return await handleDetachApp(req);

      case "attach":
        return await handleAttach(req);

      case "resumeApp":
        return await handleResumeApp(req);

      case "detach":
        return await handleDetach(req);

      case "compileScript":
        return await handleCompileScript(req);

      case "runScript":
        return await handleRunScript(req);

      case "getScriptOutput":
        return await handleGetScriptOutput(req);

      case "stopScript":
        return await handleStopScript(req);

      case "agentInvoke":
        return await handleAgentInvoke(req);

      case "agentInterfaces":
        return await handleAgentInterfaces(req);

      case "agentSnapshot":
        return await handleAgentSnapshot(req);

      case "agentRestore":
        return await handleAgentRestore(req);

      case "listFiles":
        return await handleListFiles(req);

      case "readFile":
        return await handleReadFile(req);

      case "findFiles":
        return await handleFindFiles(req);

      case "pullDatabase":
        return await handlePullDatabase(req);

      default:
        return fail(req.id, -32601, `unknown method: ${req.method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(req.id, -32000, message);
  }
}

async function handleSubscribe(
  conn: Deno.Conn,
  req: JsonRpcRequest,
): Promise<void> {
  const sessionId = req.params?.sessionId as string;
  if (!sessionId) {
    const res = fail(req.id, -32602, "missing param: sessionId");
    await conn.write(new TextEncoder().encode(JSON.stringify(res) + "\n"));
    conn.close();
    return;
  }

  const state = sessions.get(sessionId);
  if (!state) {
    const res = fail(req.id, -32602, "session not found");
    await conn.write(new TextEncoder().encode(JSON.stringify(res) + "\n"));
    conn.close();
    return;
  }

  const ack = ok(req.id, { subscribed: true });
  await conn.write(new TextEncoder().encode(JSON.stringify(ack) + "\n"));

  if (state.messageBuffer.length > 0) {
    for (const line of state.messageBuffer) {
      try {
        await conn.write(new TextEncoder().encode(line));
      } catch {
        break;
      }
    }
    state.messageBuffer.length = 0;
  }

  state.subscribers.add(conn);

  const buf = new Uint8Array(1);
  try {
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
    }
  } catch {}

  state.subscribers.delete(conn);
  try {
    conn.close();
  } catch {}
}

export async function handleConnection(conn: Deno.Conn): Promise<void> {
  try {
    const chunks: Uint8Array[] = [];
    const buf = new Uint8Array(65536);
    let n: number | null;
    while ((n = await conn.read(buf)) !== null) {
      chunks.push(buf.slice(0, n));
      if (buf[n - 1] === 0x0a || buf[n - 1] === 0x7d) break;
    }
    if (chunks.length === 0) return;

    const raw = new TextDecoder().decode(
      chunks.length === 1 ? chunks[0] : new Uint8Array(
        chunks.reduce((acc, c) => [...acc, ...c], [] as number[]),
      ),
    );
    const req: JsonRpcRequest = JSON.parse(raw);

    if (req.method === "subscribe") {
      await handleSubscribe(conn, req);
      return;
    }

    const res = await handleRequest(req);
    const encoded = new TextEncoder().encode(JSON.stringify(res) + "\n");
    await conn.write(encoded);
  } catch (err) {
    console.error("connection error:", err);
  } finally {
    try {
      conn.close();
    } catch {}
  }
}

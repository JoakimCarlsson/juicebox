import frida from "frida";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  SessionState,
} from "../types.ts";
import { broadcast, fail, generateSessionId, ok, sessions } from "../state.ts";
import { normalizePlatform } from "../utils.ts";
import { ensureFridaServer } from "../frida-server.ts";

const AGENT_PATH = resolve(
  import.meta.dirname!,
  "../../../agent/dist/agent.js",
);

export async function handleAttach(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const deviceId = req.params?.deviceId as string;
  const identifier = req.params?.identifier as string;
  if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
  if (!identifier) return fail(req.id, -32602, "missing param: identifier");

  const tempDevice = await frida.getDevice(deviceId);
  const sysParams = await tempDevice.querySystemParameters();
  if (normalizePlatform(sysParams.platform as string) === "android") {
    await ensureFridaServer(deviceId);
  }

  const device = await frida.getDevice(deviceId);

  const pid = await device.spawn(identifier);
  const session = await device.attach(pid);
  const agentSource = await Deno.readTextFile(AGENT_PATH);
  const script = await session.createScript(agentSource);

  const sessionId = generateSessionId();
  const state: SessionState = {
    id: sessionId,
    deviceId,
    identifier,
    pid,
    session,
    script,
    subscribers: new Set(),
    messageBuffer: [],
    userScripts: new Map(),
  };

  sessions.set(sessionId, state);

  script.message.connect((_message: frida.Message, _data: Buffer | null) => {
    const msg = _message as { type: string; payload?: unknown };
    if (msg.type === "send" && msg.payload) {
      broadcast(state, JSON.stringify(msg.payload) + "\n");
    } else if (msg.type === "error") {
      const description = (msg as any).description ?? String(msg);
      console.error(`[${sessionId}] agent error:`, description);
      broadcast(
        state,
        JSON.stringify({
          type: "log",
          payload: { level: "error", source: "agent", message: description },
        }) + "\n",
      );
    }
  });

  session.detached.connect(
    (reason: frida.SessionDetachReason, crash: frida.Crash | null) => {
      const line = JSON.stringify({
        type: "detached",
        reason,
        crash: crash ? { summary: crash.summary, report: crash.report } : null,
      }) + "\n";
      const encoded = new TextEncoder().encode(line);
      for (const sub of state.subscribers) {
        sub.write(encoded).catch(() => {});
        try {
          sub.close();
        } catch {}
      }
      state.subscribers.clear();
      for (const [, us] of state.userScripts) {
        try {
          us.script.unload();
        } catch {}
      }
      state.userScripts.clear();
      sessions.delete(sessionId);
      console.log(
        `session ${sessionId} detached: reason=${reason}${
          crash ? ` crash=${crash.summary}` : ""
        }`,
      );
    },
  );

  await script.load();

  function logAgentError(label: string, err: unknown): void {
    const description = err instanceof Error ? err.message : String(err);
    console.error(`[${sessionId}] ${label}:`, err);
    broadcast(
      state,
      JSON.stringify({
        type: "log",
        payload: {
          level: "error",
          source: "agent",
          message: `${label}: ${description}`,
        },
      }) + "\n",
    );
  }

  const evasionConfig = req.params?.evasion as
    | Record<string, boolean>
    | undefined;

  if (evasionConfig) {
    if (evasionConfig.frida_bypass !== false) {
      try {
        await script.exports.invoke("evasion", "bypassFrida", []);
      } catch (err) {
        logAgentError("frida bypass failed", err);
      }
    }

    if (evasionConfig.root_bypass !== false) {
      try {
        await script.exports.invoke("evasion", "bypassRoot", []);
      } catch (err) {
        logAgentError("root bypass failed", err);
      }
    }

    if (evasionConfig.emulator_bypass !== false) {
      try {
        await script.exports.invoke("evasion", "bypassEmulator", []);
      } catch (err) {
        logAgentError("emulator bypass failed", err);
      }
    }
  }

  try {
    await script.exports.invoke("ssl", "bypass", []);
  } catch (err) {
    logAgentError("ssl bypass failed", err);
  }

  try {
    await script.exports.invoke("crash", "enable", []);
  } catch (err) {
    logAgentError("crash handler setup failed", err);
  }

  await device.resume(pid);
  console.log(`attached to ${identifier} (pid ${pid}), session ${sessionId}`);

  return ok(req.id, { sessionId, pid });
}

export async function handleDetach(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");

  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");

  for (const [, us] of state.userScripts) {
    try {
      await us.script.unload();
    } catch {}
  }
  state.userScripts.clear();

  try {
    await state.script.unload();
  } catch {}
  try {
    await state.session.detach();
  } catch {}

  for (const sub of state.subscribers) {
    try {
      sub.close();
    } catch {}
  }

  sessions.delete(sessionId);
  console.log(`detached session ${sessionId}`);

  return ok(req.id, { success: true });
}

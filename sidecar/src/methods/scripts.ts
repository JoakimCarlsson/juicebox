import type frida from "frida";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import type { JsonRpcRequest, JsonRpcResponse, UserScriptState } from "../types.ts";
import { sessions, ok, fail } from "../state.ts";

const SIDECAR_ROOT = resolve(import.meta.dirname!, "../..");

export async function handleRunScript(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  const code = req.params?.code as string;
  const name = (req.params?.name as string) ?? `script_${Date.now()}`;
  const initialWaitMs = ((req.params?.initialWait as number) ?? 3) * 1000;
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
  if (!code) return fail(req.id, -32602, "missing param: code");

  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");

  const existing = state.userScripts.get(name);
  if (existing) {
    try { await existing.script.unload(); } catch {}
    state.userScripts.delete(name);
  }

  const tmpDir = resolve(SIDECAR_ROOT, ".tmp");
  await Deno.mkdir(tmpDir, { recursive: true });
  const tmpFile = `${tmpDir}/jb_script_${crypto.randomUUID()}.ts`;
  const outFile = tmpFile.replace(/\.ts$/, ".js");

  let userScript: frida.Script | null = null;

  try {
    await Deno.writeTextFile(tmpFile, code);

    const compilerBin = resolve(SIDECAR_ROOT, "node_modules/.bin/frida-compile");
    const compile = new Deno.Command(compilerBin, {
      args: [tmpFile, "-o", outFile],
      stdout: "piped",
      stderr: "piped",
      cwd: SIDECAR_ROOT,
    });
    const compileOut = await compile.output();
    if (compileOut.code !== 0) {
      const stderr = new TextDecoder().decode(compileOut.stderr).trim();
      const stdout = new TextDecoder().decode(compileOut.stdout).trim();
      const detail = [stderr, stdout].filter(Boolean).join("\n") || "unknown error";
      return fail(req.id, -32000, `compilation failed:\n${detail}`);
    }

    const compiledJS = await Deno.readTextFile(outFile);
    userScript = await state.session.createScript(compiledJS);

    const scriptState: UserScriptState = {
      name,
      script: userScript,
      messages: [],
      startedAt: Date.now(),
      done: false,
    };

    let resolveDone: (() => void) | null = null;
    const donePromise = new Promise<void>((r) => { resolveDone = r; });

    userScript.message.connect((_message: frida.Message, _data: Buffer | null) => {
      const msg = _message as { type: string; payload?: unknown };
      if (msg.type === "send" && msg.payload != null) {
        scriptState.messages.push(msg.payload);

        const line = JSON.stringify({ type: "script_output", payload: msg.payload }) + "\n";
        const encoded = new TextEncoder().encode(line);
        for (const sub of state.subscribers) {
          sub.write(encoded).catch(() => { state.subscribers.delete(sub); });
        }

        if (typeof msg.payload === "object" && msg.payload !== null && (msg.payload as Record<string, unknown>).__done === true) {
          scriptState.done = true;
          resolveDone?.();
        }
      } else if (msg.type === "error") {
        const description = (msg as Record<string, unknown>).description ?? String(msg);
        scriptState.messages.push({ error: description });

        const errLine = JSON.stringify({ type: "script_output", payload: { error: description } }) + "\n";
        const errEncoded = new TextEncoder().encode(errLine);
        for (const sub of state.subscribers) {
          sub.write(errEncoded).catch(() => { state.subscribers.delete(sub); });
        }
      }
    });

    await userScript.load();

    const timeout = new Promise<void>((r) => setTimeout(r, initialWaitMs));
    await Promise.race([donePromise, timeout]);

    if (scriptState.done) {
      try { await userScript.unload(); } catch {}
      return ok(req.id, { mode: "oneshot", messages: scriptState.messages });
    }

    state.userScripts.set(name, scriptState);
    return ok(req.id, {
      mode: "streaming",
      name,
      messagesCollected: scriptState.messages.length,
      messages: scriptState.messages.slice(0, 20),
    });
  } finally {
    if (userScript && !state.userScripts.has(name)) {
      try { await userScript.unload(); } catch {}
    }
    try { await Deno.remove(tmpFile); } catch {}
    try { await Deno.remove(outFile); } catch {}
  }
}

export async function handleGetScriptOutput(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  const name = req.params?.name as string;
  const since = (req.params?.since as number) ?? 0;
  const limit = (req.params?.limit as number) ?? 100;
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
  if (!name) return fail(req.id, -32602, "missing param: name");

  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");

  const scriptState = state.userScripts.get(name);
  if (!scriptState) return fail(req.id, -32602, `no running script named "${name}"`);

  const messages = scriptState.messages.slice(since, since + limit);
  return ok(req.id, {
    name,
    running: !scriptState.done,
    totalMessages: scriptState.messages.length,
    since,
    messages,
  });
}

export async function handleStopScript(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  const name = req.params?.name as string;
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
  if (!name) return fail(req.id, -32602, "missing param: name");

  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");

  const scriptState = state.userScripts.get(name);
  if (!scriptState) return fail(req.id, -32602, `no running script named "${name}"`);

  try { await scriptState.script.unload(); } catch {}
  state.userScripts.delete(name);

  return ok(req.id, {
    name,
    totalMessages: scriptState.messages.length,
    messages: scriptState.messages,
  });
}

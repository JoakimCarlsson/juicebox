import frida from "frida";
import { resolve } from "node:path";

const SOCKET_PATH = Deno.env.get("JUICEBOX_SOCKET") ?? "/tmp/juicebox.sock";
const AGENT_PATH = resolve(import.meta.dirname!, "../agent/dist/agent.js");
const BIN_DIR = resolve(import.meta.dirname!, "bin");
const DEVICE_SERVER_PATH = "/data/local/tmp/frida-server";

async function getFridaVersion(): Promise<string> {
  const pkgPath = resolve(
    import.meta.dirname!,
    "node_modules/.deno/frida@*/node_modules/frida/package.json",
  );
  const glob = new Deno.Command("sh", {
    args: ["-c", `cat ${pkgPath} 2>/dev/null || cat node_modules/frida/package.json`],
    stdout: "piped",
    stderr: "piped",
    cwd: import.meta.dirname!,
  });
  const out = await glob.output();
  const pkg = JSON.parse(new TextDecoder().decode(out.stdout));
  return pkg.version;
}

async function exec(cmd: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const p = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });
  const out = await p.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout).trim(),
    stderr: new TextDecoder().decode(out.stderr).trim(),
  };
}

function normalizePlatform(raw: string): string {
  if (raw === "linux") return "android";
  if (raw === "darwin") return "ios";
  return raw;
}

async function isFridaServerRunning(deviceId: string): Promise<boolean> {
  const { stdout } = await exec(["adb", "-s", deviceId, "shell", "ps -A | grep frida-server"]);
  return stdout.includes("frida-server");
}

async function ensureFridaServer(deviceId: string): Promise<void> {
  if (await isFridaServerRunning(deviceId)) return;

  console.log(`frida-server not running on ${deviceId}, installing...`);

  const { stdout: abi } = await exec(["adb", "-s", deviceId, "shell", "getprop ro.product.cpu.abi"]);
  const archMap: Record<string, string> = {
    "arm64-v8a": "arm64",
    "armeabi-v7a": "arm",
    "x86_64": "x86_64",
    "x86": "x86",
  };
  const arch = archMap[abi] ?? abi;
  const version = await getFridaVersion();
  const binName = `frida-server-${version}-android-${arch}`;
  const localBin = resolve(BIN_DIR, binName);

  try {
    await Deno.stat(localBin);
    console.log(`using cached ${binName}`);
  } catch {
    await Deno.mkdir(BIN_DIR, { recursive: true });

    const url = `https://github.com/frida/frida/releases/download/${version}/${binName}.xz`;
    console.log(`downloading ${url}`);

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`failed to download frida-server: ${resp.status} from ${url}`);

    const xzData = new Uint8Array(await resp.arrayBuffer());
    const tmpXz = `${localBin}.xz`;
    await Deno.writeFile(tmpXz, xzData);

    const unxz = await exec(["unxz", "-f", tmpXz]);
    if (unxz.code !== 0) throw new Error(`unxz failed: ${unxz.stderr}`);

    console.log(`cached ${binName} in sidecar/bin/`);
  }

  console.log("pushing frida-server to device...");
  const push = await exec(["adb", "-s", deviceId, "push", localBin, DEVICE_SERVER_PATH]);
  if (push.code !== 0) throw new Error(`adb push failed: ${push.stderr}`);

  await exec(["adb", "-s", deviceId, "shell", `chmod 755 ${DEVICE_SERVER_PATH}`]);

  await exec(["adb", "-s", deviceId, "root"]);
  await new Promise((r) => setTimeout(r, 1000));
  await exec(["adb", "-s", deviceId, "shell", "setenforce 0"]);

  console.log("starting frida-server...");
  new Deno.Command("adb", {
    args: ["-s", deviceId, "shell", `${DEVICE_SERVER_PATH} -D &`],
    stdout: "null",
    stderr: "null",
  }).spawn();

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isFridaServerRunning(deviceId)) {
      console.log("frida-server is running");
      return;
    }
  }
  throw new Error("frida-server failed to start");
}

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink";
  size: number;
  permissions: string;
  modifiedAt: string;
}

function parseLsOutput(output: string, basePath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("total")) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 7) continue;

    const permissions = parts[0];
    const size = parseInt(parts[4], 10) || 0;
    const date = parts[5];
    const time = parts[6];
    const rest = parts.slice(7).join(" ");
    if (!rest || rest === "." || rest === "..") continue;

    let type: "file" | "dir" | "symlink" = "file";
    if (permissions.startsWith("d")) type = "dir";
    else if (permissions.startsWith("l")) type = "symlink";

    const name = type === "symlink" ? rest.split(" -> ")[0] : rest;

    entries.push({
      name,
      path: `${normalizedBase}/${name}`,
      type,
      size,
      permissions,
      modifiedAt: `${date} ${time}`,
    });
  }

  return entries;
}

function detectMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    xml: "application/xml",
    json: "application/json",
    txt: "text/plain",
    log: "text/plain",
    html: "text/html",
    htm: "text/html",
    js: "application/javascript",
    ts: "application/typescript",
    css: "text/css",
    sh: "application/x-sh",
    yaml: "application/yaml",
    yml: "application/yaml",
    toml: "application/toml",
    ini: "text/plain",
    cfg: "text/plain",
    conf: "text/plain",
    properties: "text/plain",
    db: "application/x-sqlite3",
    sqlite: "application/x-sqlite3",
    sqlite3: "application/x-sqlite3",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    zip: "application/zip",
    so: "application/octet-stream",
    dex: "application/octet-stream",
  };
  return map[ext] ?? "application/octet-stream";
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface UserScriptState {
  name: string;
  script: frida.Script;
  messages: unknown[];
  startedAt: number;
  done: boolean;
}

interface SessionState {
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

const sessions = new Map<string, SessionState>();
let sessionCounter = 0;

function generateSessionId(): string {
  return `s-${++sessionCounter}-${Date.now()}`;
}

function ok(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(
  id: number | string,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleAttach(
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

  // re-acquire device handle after potential adb root
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
      const line = JSON.stringify(msg.payload) + "\n";
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
    } else if (msg.type === "error") {
      const description = (msg as any).description ?? String(msg);
      console.error(`[${sessionId}] agent error:`, description);
      const errLine = JSON.stringify({ type: "log", payload: { level: "error", source: "agent", message: description } }) + "\n";
      if (state.subscribers.size === 0) {
        state.messageBuffer.push(errLine);
      } else {
        const errEncoded = new TextEncoder().encode(errLine);
        for (const sub of state.subscribers) {
          sub.write(errEncoded).catch(() => {
            state.subscribers.delete(sub);
          });
        }
      }
    }
  });

  session.detached.connect((reason: frida.SessionDetachReason, crash: frida.Crash | null) => {
    const line = JSON.stringify({ type: "detached", reason, crash: crash ? { summary: crash.summary, report: crash.report } : null }) + "\n";
    const encoded = new TextEncoder().encode(line);
    for (const sub of state.subscribers) {
      sub.write(encoded).catch(() => {});
      try { sub.close(); } catch {}
    }
    state.subscribers.clear();
    for (const [, us] of state.userScripts) {
      try { us.script.unload(); } catch {}
    }
    state.userScripts.clear();
    sessions.delete(sessionId);
    console.log(`session ${sessionId} detached: reason=${reason}${crash ? ` crash=${crash.summary}` : ""}`);
  });

  await script.load();

  function logAgentError(label: string, err: unknown): void {
    const description = err instanceof Error ? err.message : String(err);
    console.error(`[${sessionId}] ${label}:`, err);
    const errLine = JSON.stringify({ type: "log", payload: { level: "error", source: "agent", message: `${label}: ${description}` } }) + "\n";
    if (state.subscribers.size === 0) {
      state.messageBuffer.push(errLine);
    } else {
      const errEncoded = new TextEncoder().encode(errLine);
      for (const sub of state.subscribers) {
        sub.write(errEncoded).catch(() => {
          state.subscribers.delete(sub);
        });
      }
    }
  }

  const evasionConfig = req.params?.evasion as Record<string, boolean> | undefined;

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

async function handleDetach(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");

  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");

  for (const [, us] of state.userScripts) {
    try { await us.script.unload(); } catch {}
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

async function handleRunScript(req: JsonRpcRequest): Promise<JsonRpcResponse> {
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

  const tmpDir = resolve(import.meta.dirname!, ".tmp");
  await Deno.mkdir(tmpDir, { recursive: true });
  const tmpFile = `${tmpDir}/jb_script_${crypto.randomUUID()}.ts`;
  const outFile = tmpFile.replace(/\.ts$/, ".js");

  let userScript: frida.Script | null = null;

  try {
    await Deno.writeTextFile(tmpFile, code);

    const compilerBin = resolve(import.meta.dirname!, "node_modules/.bin/frida-compile");
    const compile = new Deno.Command(compilerBin, {
      args: [tmpFile, "-o", outFile],
      stdout: "piped",
      stderr: "piped",
      cwd: import.meta.dirname!,
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

async function handleGetScriptOutput(req: JsonRpcRequest): Promise<JsonRpcResponse> {
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

async function handleStopScript(req: JsonRpcRequest): Promise<JsonRpcResponse> {
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

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    switch (req.method) {
      case "ping":
        return ok(req.id, "pong");

      case "listDevices": {
        const mgr = frida.getDeviceManager();
        const devices = await mgr.enumerateDevices();
        const usb = devices.filter((d) => d.type === "usb");
        const result = await Promise.all(
          usb.map(async (d) => {
            const params = await d.querySystemParameters();
            return {
              id: d.id,
              name: d.name,
              type: d.type,
              platform: normalizePlatform(params.platform as string),
            };
          }),
        );
        return ok(req.id, result);
      }

      case "listApps": {
        const deviceId = req.params?.deviceId as string;
        if (!deviceId)
          return fail(req.id, -32602, "missing param: deviceId");
        const device = await frida.getDevice(deviceId);
        const apps = await device.enumerateApplications();
        return ok(
          req.id,
          apps.map((a) => ({
            identifier: a.identifier,
            name: a.name,
            pid: a.pid,
          })),
        );
      }

      case "listProcesses": {
        const deviceId = req.params?.deviceId as string;
        if (!deviceId)
          return fail(req.id, -32602, "missing param: deviceId");
        const device = await frida.getDevice(deviceId);
        const processes = await device.enumerateProcesses();
        return ok(
          req.id,
          processes.map((p) => ({
            pid: p.pid,
            name: p.name,
          })),
        );
      }

      case "getDeviceInfo": {
        const deviceId = req.params?.deviceId as string;
        if (!deviceId)
          return fail(req.id, -32602, "missing param: deviceId");
        const device = await frida.getDevice(deviceId);
        const params = await device.querySystemParameters();
        return ok(req.id, {
          name: device.name,
          id: device.id,
          type: device.type,
          os: params.os,
          platform: normalizePlatform(params.platform as string),
          arch: params.arch,
          access: params.access,
        });
      }

      case "getAppIcon": {
        const deviceId = req.params?.deviceId as string;
        const identifier = req.params?.identifier as string;
        if (!deviceId)
          return fail(req.id, -32602, "missing param: deviceId");
        if (!identifier)
          return fail(req.id, -32602, "missing param: identifier");
        const device = await frida.getDevice(deviceId);
        const apps = await device.enumerateApplications({
          identifiers: [identifier],
          scope: "full",
        });
        if (apps.length === 0) return fail(req.id, -32602, "app not found");
        const icons = apps[0].parameters?.icons as
          | { format: string; image: Buffer }[]
          | undefined;
        if (!icons || icons.length === 0)
          return fail(req.id, -32602, "no icon available");
        const icon = icons[icons.length - 1];
        const b64 = Buffer.from(icon.image).toString("base64");
        return ok(req.id, { format: icon.format, data: b64 });
      }

      case "attach":
        return await handleAttach(req);

      case "detach":
        return await handleDetach(req);

      case "runScript":
        return await handleRunScript(req);

      case "getScriptOutput":
        return await handleGetScriptOutput(req);

      case "stopScript":
        return await handleStopScript(req);

      case "agentInvoke": {
        const sessionId = req.params?.sessionId as string;
        const namespace = req.params?.namespace as string;
        const method = req.params?.method as string;
        const args = (req.params?.args as unknown[]) ?? [];
        if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
        if (!namespace) return fail(req.id, -32602, "missing param: namespace");
        if (!method) return fail(req.id, -32602, "missing param: method");
        const state = sessions.get(sessionId);
        if (!state) return fail(req.id, -32602, "session not found");
        const result = await state.script.exports.invoke(namespace, method, args);
        return ok(req.id, result);
      }

      case "agentInterfaces": {
        const sessionId = req.params?.sessionId as string;
        if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
        const state = sessions.get(sessionId);
        if (!state) return fail(req.id, -32602, "session not found");
        const result = await state.script.exports.interfaces();
        return ok(req.id, result);
      }

      case "agentSnapshot": {
        const sessionId = req.params?.sessionId as string;
        if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
        const state = sessions.get(sessionId);
        if (!state) return fail(req.id, -32602, "session not found");
        const result = await state.script.exports.snapshot();
        return ok(req.id, result);
      }

      case "agentRestore": {
        const sessionId = req.params?.sessionId as string;
        const rules = req.params?.rules as unknown[];
        if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");
        if (!rules) return fail(req.id, -32602, "missing param: rules");
        const state = sessions.get(sessionId);
        if (!state) return fail(req.id, -32602, "session not found");
        await state.script.exports.restore(rules);
        return ok(req.id, { success: true });
      }

      case "listFiles": {
        const deviceId = req.params?.deviceId as string;
        const bundleId = req.params?.bundleId as string;
        const path = (req.params?.path as string) || `/data/data/${bundleId}`;
        if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
        if (!bundleId) return fail(req.id, -32602, "missing param: bundleId");

        const { stdout, stderr } = await exec([
          "adb", "-s", deviceId, "shell",
          `run-as ${bundleId} ls -la "${path}" 2>/dev/null || ls -la "${path}" 2>&1`,
        ]);

        if (!stdout && stderr) {
          return fail(req.id, -32000, `ls failed: ${stderr}`);
        }

        return ok(req.id, parseLsOutput(stdout, path));
      }

      case "readFile": {
        const deviceId = req.params?.deviceId as string;
        const bundleId = req.params?.bundleId as string;
        const path = req.params?.path as string;
        if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
        if (!bundleId) return fail(req.id, -32602, "missing param: bundleId");
        if (!path) return fail(req.id, -32602, "missing param: path");

        const sizeResult = await exec([
          "adb", "-s", deviceId, "shell",
          `run-as ${bundleId} stat -c %s "${path}" 2>/dev/null || stat -c %s "${path}" 2>/dev/null || echo 0`,
        ]);
        const fileSize = parseInt(sizeResult.stdout.trim(), 10) || 0;
        const MAX_SIZE = 5 * 1024 * 1024;
        if (fileSize > MAX_SIZE) {
          return fail(req.id, -32000, `file too large: ${fileSize} bytes (max ${MAX_SIZE})`);
        }

        const { stdout, stderr } = await exec([
          "adb", "-s", deviceId, "shell",
          `run-as ${bundleId} base64 "${path}" 2>/dev/null || base64 "${path}" 2>&1`,
        ]);

        if (!stdout && stderr) {
          return fail(req.id, -32000, `read failed: ${stderr}`);
        }

        const b64 = stdout.replace(/\s/g, "");
        const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

        let binary = false;
        const checkLen = Math.min(raw.length, 8192);
        for (let i = 0; i < checkLen; i++) {
          if (raw[i] === 0) { binary = true; break; }
        }

        if (binary) {
          return ok(req.id, {
            path,
            content: b64,
            encoding: "base64",
            mimeType: "application/octet-stream",
            size: raw.length,
          });
        }

        const text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
        return ok(req.id, {
          path,
          content: text,
          encoding: "utf-8",
          mimeType: detectMimeType(path),
          size: raw.length,
        });
      }

      case "findFiles": {
        const deviceId = req.params?.deviceId as string;
        const bundleId = req.params?.bundleId as string;
        const pattern = req.params?.pattern as string;
        const basePath = (req.params?.basePath as string) || `/data/data/${bundleId}`;
        if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
        if (!bundleId) return fail(req.id, -32602, "missing param: bundleId");
        if (!pattern) return fail(req.id, -32602, "missing param: pattern");

        const { stdout } = await exec([
          "adb", "-s", deviceId, "shell",
          `run-as ${bundleId} find "${basePath}" -name "${pattern}" 2>/dev/null || find "${basePath}" -name "${pattern}" 2>/dev/null`,
        ]);

        const paths = stdout.split("\n").map((p) => p.trim()).filter((p) => p.length > 0);
        return ok(req.id, paths);
      }

      case "pullDatabase": {
        const deviceId = req.params?.deviceId as string;
        const bundleId = req.params?.bundleId as string;
        const dbPath = req.params?.dbPath as string;
        if (!deviceId) return fail(req.id, -32602, "missing param: deviceId");
        if (!bundleId) return fail(req.id, -32602, "missing param: bundleId");
        if (!dbPath) return fail(req.id, -32602, "missing param: dbPath");

        const hash = Array.from(new TextEncoder().encode(dbPath))
          .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
        const remoteTmp = `/data/local/tmp/jb_${hash}.db`;
        const localTmp = `${Deno.env.get("TMPDIR") ?? "/tmp"}/jb_${hash}_${Date.now()}.db`;

        const cp = await exec([
          "adb", "-s", deviceId, "shell",
          `run-as ${bundleId} cat "${dbPath}" > "${remoteTmp}" 2>/dev/null && chmod 644 "${remoteTmp}" || cat "${dbPath}" > "${remoteTmp}" 2>/dev/null && chmod 644 "${remoteTmp}" || cp "${dbPath}" "${remoteTmp}" 2>/dev/null && chmod 644 "${remoteTmp}"`,
        ]);

        const checkTmp = await exec(["adb", "-s", deviceId, "shell", `ls "${remoteTmp}" 2>/dev/null && echo EXISTS || echo MISSING`]);
        if (!checkTmp.stdout.includes("EXISTS")) {
          return fail(req.id, -32000, `copy failed: could not copy ${dbPath} to ${remoteTmp} (tried run-as and root)`);
        }

        const pull = await exec(["adb", "-s", deviceId, "pull", remoteTmp, localTmp]);
        if (pull.code !== 0) {
          return fail(req.id, -32000, `adb pull failed: ${pull.stderr}`);
        }

        await exec(["adb", "-s", deviceId, "shell", `rm -f "${remoteTmp}"`]);

        const pullSidecar = async (suffix: string) => {
          const srcPath = dbPath + suffix;
          const rTmp = remoteTmp + suffix;
          const lTmp = localTmp + suffix;
          const scCp = await exec([
            "adb", "-s", deviceId, "shell",
            `run-as ${bundleId} cat "${srcPath}" > "${rTmp}" 2>/dev/null && chmod 644 "${rTmp}" && echo OK || cat "${srcPath}" > "${rTmp}" 2>/dev/null && chmod 644 "${rTmp}" && echo OK || echo SKIP`,
          ]);
          if (scCp.stdout.trim().includes("OK")) {
            await exec(["adb", "-s", deviceId, "pull", rTmp, lTmp]);
            await exec(["adb", "-s", deviceId, "shell", `rm -f "${rTmp}"`]);
          }
        };

        await pullSidecar("-wal");
        await pullSidecar("-shm");

        return ok(req.id, { localPath: localTmp });
      }

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

  // flush buffered messages from before subscriber connected
  if (state.messageBuffer.length > 0) {
    for (const line of state.messageBuffer) {
      try {
        await conn.write(new TextEncoder().encode(line));
      } catch { break; }
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

async function handleConnection(conn: Deno.Conn): Promise<void> {
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
      chunks.length === 1
        ? chunks[0]
        : new Uint8Array(
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

try {
  await Deno.remove(SOCKET_PATH);
} catch {
  // socket may not exist yet
}

const listener = Deno.listen({ transport: "unix", path: SOCKET_PATH });
console.log(`juicebox sidecar listening on ${SOCKET_PATH}`);

for await (const conn of listener) {
  handleConnection(conn);
}

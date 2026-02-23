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

interface SessionState {
  id: string;
  deviceId: string;
  identifier: string;
  pid: number;
  session: frida.Session;
  script: frida.Script;
  subscribers: Set<Deno.Conn>;
  messageBuffer: string[];
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

  session.detached.connect(() => {
    const line = JSON.stringify({ type: "detached" }) + "\n";
    const encoded = new TextEncoder().encode(line);
    for (const sub of state.subscribers) {
      try {
        sub.write(encoded);
      } catch {}
      try {
        sub.close();
      } catch {}
    }
    state.subscribers.clear();
    sessions.delete(sessionId);
    console.log(`session ${sessionId} detached`);
  });

  await script.load();

  try {
    await script.exports.invoke("ssl", "bypass", []);
  } catch (err) {
    const description = err instanceof Error ? err.message : String(err);
    console.error(`[${sessionId}] ssl bypass failed:`, err);
    const errLine = JSON.stringify({ type: "log", payload: { level: "error", source: "agent", message: `ssl bypass failed: ${description}` } }) + "\n";
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

  await device.resume(pid);
  console.log(`attached to ${identifier} (pid ${pid}), session ${sessionId}`);

  return ok(req.id, { sessionId, pid });
}

async function handleDetach(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const sessionId = req.params?.sessionId as string;
  if (!sessionId) return fail(req.id, -32602, "missing param: sessionId");

  const state = sessions.get(sessionId);
  if (!state) return fail(req.id, -32602, "session not found");

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

import frida from "frida";

const SOCKET_PATH = Deno.env.get("JUICEBOX_SOCKET") ?? "/tmp/juicebox.sock";

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

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const ok = (result: unknown): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id: req.id,
    result,
  });

  const fail = (code: number, message: string): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id: req.id,
    error: { code, message },
  });

  try {
    switch (req.method) {
      case "ping":
        return ok("pong");

      case "listDevices": {
        const mgr = frida.getDeviceManager();
        const devices = await mgr.enumerateDevices();
        return ok(
          devices
            .filter((d) => d.type === "usb")
            .map((d) => ({ id: d.id, name: d.name, type: d.type })),
        );
      }

      case "listApps": {
        const deviceId = req.params?.deviceId as string;
        if (!deviceId) return fail(-32602, "missing param: deviceId");
        const device = await frida.getDevice(deviceId);
        const apps = await device.enumerateApplications();
        return ok(
          apps.map((a) => ({
            identifier: a.identifier,
            name: a.name,
            pid: a.pid,
          })),
        );
      }

      case "getDeviceInfo": {
        const deviceId = req.params?.deviceId as string;
        if (!deviceId) return fail(-32602, "missing param: deviceId");
        const device = await frida.getDevice(deviceId);
        const params = await device.querySystemParameters();
        return ok({
          name: device.name,
          id: device.id,
          type: device.type,
          os: params.os,
          platform: params.platform,
          arch: params.arch,
          access: params.access,
        });
      }

      default:
        return fail(-32601, `unknown method: ${req.method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(-32000, message);
  }
}

async function handleConnection(conn: Deno.Conn): Promise<void> {
  const buf = new Uint8Array(65536);
  try {
    const n = await conn.read(buf);
    if (n === null) return;

    const raw = new TextDecoder().decode(buf.subarray(0, n));
    const req: JsonRpcRequest = JSON.parse(raw);
    const res = await handleRequest(req);
    const encoded = new TextEncoder().encode(JSON.stringify(res) + "\n");
    await conn.write(encoded);
  } catch (err) {
    console.error("connection error:", err);
  } finally {
    conn.close();
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

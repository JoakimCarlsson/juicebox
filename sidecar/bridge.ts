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

      case "getAppIcon": {
        const deviceId = req.params?.deviceId as string;
        const identifier = req.params?.identifier as string;
        if (!deviceId) return fail(-32602, "missing param: deviceId");
        if (!identifier) return fail(-32602, "missing param: identifier");
        const device = await frida.getDevice(deviceId);
        const apps = await device.enumerateApplications({
          identifiers: [identifier],
          scope: "full",
        });
        if (apps.length === 0) return fail(-32602, "app not found");
        const icons = apps[0].parameters?.icons as
          | { format: string; image: Buffer }[]
          | undefined;
        if (!icons || icons.length === 0)
          return fail(-32602, "no icon available");
        const icon = icons[icons.length - 1];
        const b64 = Buffer.from(icon.image).toString("base64");
        return ok({ format: icon.format, data: b64 });
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
        : new Uint8Array(chunks.reduce((acc, c) => [...acc, ...c], [] as number[])),
    );
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

const SOCKET_PATH = Deno.env.get("JUICEBOX_SOCKET") ?? "/tmp/juicebox.sock";

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

function handleRequest(req: JsonRpcRequest): JsonRpcResponse {
  switch (req.method) {
    case "ping":
      return { jsonrpc: "2.0", id: req.id, result: "pong" };
    default:
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: `unknown method: ${req.method}` },
      };
  }
}

async function handleConnection(conn: Deno.Conn): Promise<void> {
  const buf = new Uint8Array(4096);
  try {
    const n = await conn.read(buf);
    if (n === null) return;

    const raw = new TextDecoder().decode(buf.subarray(0, n));
    const req: JsonRpcRequest = JSON.parse(raw);
    const res = handleRequest(req);
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

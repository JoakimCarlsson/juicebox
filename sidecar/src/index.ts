import { SOCKET_PATH, handleConnection } from "./server.ts";

try {
  await Deno.remove(SOCKET_PATH);
} catch {}

const listener = Deno.listen({ transport: "unix", path: SOCKET_PATH });
console.log(`juicebox sidecar listening on ${SOCKET_PATH}`);

for await (const conn of listener) {
  handleConnection(conn);
}

# Juicebox

Runtime Android application instrumentation toolkit powered by [Frida](https://frida.re). Squeeze the internals out of Android apps through a web-based interface.

## Architecture

```
React UI  ←── HTTP/WS ──→  Go Server  ←── Unix Socket ──→  Deno Sidecar  ←── Frida ──→  Device
                               │
                            SQLite
```

- **Go backend** — REST API, WebSocket session management, SQLite persistence, serves the embedded React SPA
- **Deno sidecar** — Thin Frida bridge compiled to a single binary. Manages device connections, Frida sessions, and agent script loading. Communicates with Go over a Unix socket using JSON-RPC
- **React frontend** — Web-based UI for inspection, hooking, and real-time event streaming
- **Frida agent** — TypeScript injected into the target app process via `frida-java-bridge`

## License

[MIT](LICENSE)
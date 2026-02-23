# Juicebox

Runtime mobile application instrumentation toolkit powered by [Frida](https://frida.re).

**Platform support:** Android (via ADB). iOS is architecturally supported but not yet wired up.

## Features

- **Traffic interception** — MITM proxy with automatic CA cert install and device proxy config via ADB. Captures full request/response data, stored in SQLite
- **SSL unpinning** — Hooks native SSL libraries (BoringSSL, Flutter, Cronet, Conscrypt, libcurl) and Java TrustManager to bypass certificate pinning
- **Sessions** — Attach to any app by bundle ID, resume past sessions, view history. Cleans up device state on detach
- **Logcat** — Streams and stores device logs per session
- **AI analyst** — Embedded LLM chat with tool access to captured traffic and logs. Flags security issues automatically
- **Web UI** — Embedded React SPA with network inspector, logcat viewer, process list, and AI chat

## Architecture

```
React UI  ←── HTTP/WS ──→  Go Server  ←── Unix Socket ──→  Deno Sidecar  ←── Frida ──→  Device
                               │
                            SQLite
```

## Requirements

- Go 1.22+, Deno 2.x, Bun
- `adb` in `$PATH`
- Rooted Android device or emulator

## Getting Started

```sh
make install  # install deps
make dev      # dev mode with hot reload
make build    # production binary
```

Server runs at `http://localhost:8080`.

## License

[MIT](LICENSE)
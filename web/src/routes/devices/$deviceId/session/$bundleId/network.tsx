import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Search,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { useSessionSocket } from "@/hooks/useSessionSocket"
import type { HttpMessage } from "@/types/session"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/devices/$deviceId/session/$bundleId/network",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: NetworkPage,
})

// --- Utilities ---

function parseUrl(raw: string): { host: string; path: string } {
  try {
    const u = new URL(raw)
    return { host: u.host, path: u.pathname + u.search }
  } catch {
    return { host: raw, path: "" }
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === 0) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return "text-green-600 dark:text-green-400"
  if (code >= 300 && code < 400) return "text-yellow-600 dark:text-yellow-400"
  if (code >= 400) return "text-red-600 dark:text-red-400"
  return "text-muted-foreground"
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400"
    case "POST":
      return "bg-green-500/15 text-green-600 dark:text-green-400"
    case "PUT":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400"
    case "PATCH":
      return "bg-orange-500/15 text-orange-600 dark:text-orange-400"
    case "DELETE":
      return "bg-red-500/15 text-red-600 dark:text-red-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}

// --- Sub-components ---

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers)
  if (entries.length === 0) return null

  return (
    <div className="rounded border border-border overflow-hidden">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex border-b border-border last:border-0"
        >
          <span className="w-48 shrink-0 bg-muted/30 px-3 py-1.5 text-xs font-mono font-medium text-muted-foreground truncate">
            {key}
          </span>
          <span className="flex-1 px-3 py-1.5 text-xs font-mono break-all">
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}

function JsonRenderer({
  value,
  indent = 0,
}: {
  value: unknown
  indent?: number
}) {
  const pad = "  ".repeat(indent)
  const innerPad = "  ".repeat(indent + 1)

  if (value === null) return <span className="text-orange-500">null</span>
  if (typeof value === "boolean")
    return <span className="text-orange-500">{String(value)}</span>
  if (typeof value === "number")
    return <span className="text-blue-500">{value}</span>
  if (typeof value === "string")
    return (
      <span className="text-green-600 dark:text-green-400">
        &quot;{value}&quot;
      </span>
    )

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{"[]"}</span>
    return (
      <span>
        {"[\n"}
        {value.map((item, i) => (
          <span key={i}>
            {innerPad}
            <JsonRenderer value={item} indent={indent + 1} />
            {i < value.length - 1 ? "," : ""}
            {"\n"}
          </span>
        ))}
        {pad}
        {"]"}
      </span>
    )
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span>{"{}"}</span>
    return (
      <span>
        {"{\n"}
        {entries.map(([key, val], i) => (
          <span key={key}>
            {innerPad}
            <span className="text-purple-600 dark:text-purple-400">
              &quot;{key}&quot;
            </span>
            {": "}
            <JsonRenderer value={val} indent={indent + 1} />
            {i < entries.length - 1 ? "," : ""}
            {"\n"}
          </span>
        ))}
        {pad}
        {"}"}
      </span>
    )
  }

  return <span>{String(value)}</span>
}

const TEXT_TYPES = /text\/|json|xml|html|javascript|css|csv|svg|yaml|toml|plain|urlencoded/i

function b64ToBytes(b64: string): Uint8Array {
  const binStr = atob(b64)
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  return bytes
}

async function decompressBytes(
  bytes: Uint8Array,
  encoding: string,
): Promise<Uint8Array> {
  let format: string | null = null
  if (encoding === "gzip" || encoding === "x-gzip") format = "gzip"
  else if (encoding === "deflate") format = "deflate"
  if (!format) return bytes
  try {
    const ds = new DecompressionStream(format as "gzip" | "deflate")
    const writer = ds.writable.getWriter()
    writer.write(bytes)
    writer.close()
    const reader = ds.readable.getReader()
    const chunks: Uint8Array[] = []
    let totalLen = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalLen += value.length
    }
    const result = new Uint8Array(totalLen)
    let offset = 0
    for (const c of chunks) {
      result.set(c, offset)
      offset += c.length
    }
    return result
  } catch {
    return bytes
  }
}

function useDecodedBody(
  body: string,
  headers: Record<string, string>,
): { decoded: string | null; isImage: boolean; imageDataUri: string | null; loading: boolean } {
  const contentType = headers["content-type"] ?? headers["Content-Type"] ?? ""
  const contentEncoding = (headers["content-encoding"] ?? headers["Content-Encoding"] ?? "").trim().toLowerCase()
  const mimeType = contentType.split(";")[0].trim().toLowerCase()
  const isImage = mimeType.startsWith("image/")
  const isText = TEXT_TYPES.test(contentType)

  const [decoded, setDecoded] = useState<string | null>(null)
  const [imageDataUri, setImageDataUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = b64ToBytes(body)
        const bytes = await decompressBytes(raw, contentEncoding)

        if (cancelled) return

        if (isImage) {
          const b64 = btoa(String.fromCharCode(...bytes))
          setImageDataUri(`data:${mimeType};base64,${b64}`)
          setDecoded(null)
        } else if (isText || !contentType) {
          setDecoded(new TextDecoder("utf-8", { fatal: false }).decode(bytes))
          setImageDataUri(null)
        } else {
          setDecoded(null)
          setImageDataUri(null)
        }
      } catch {
        setDecoded(null)
        setImageDataUri(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [body, contentEncoding, isImage, isText, mimeType, contentType])

  return { decoded, isImage, imageDataUri, loading }
}

function BodyViewer({
  body,
  headers,
  size,
}: {
  body: string
  headers: Record<string, string>
  size?: number
}) {
  const contentType = headers["content-type"] ?? headers["Content-Type"] ?? ""
  const mimeType = contentType.split(";")[0].trim() || "unknown"
  const { decoded, isImage, imageDataUri, loading } = useDecodedBody(body, headers)

  if (loading) {
    return (
      <div className="rounded bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        Decoding...
      </div>
    )
  }

  if (isImage && imageDataUri) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {formatBytes(size ?? 0)}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {mimeType}
          </Badge>
        </div>
        <div className="rounded bg-muted/30 p-3 flex items-center justify-center">
          <img
            src={imageDataUri}
            alt="Response image"
            className="max-h-80 max-w-full object-contain rounded"
          />
        </div>
      </div>
    )
  }

  if (decoded !== null) {
    if (
      contentType.includes("json") ||
      decoded.trimStart().startsWith("{") ||
      decoded.trimStart().startsWith("[")
    ) {
      try {
        const parsed = JSON.parse(decoded)
        return (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {formatBytes(size ?? decoded.length)}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                JSON
              </Badge>
            </div>
            <pre className="rounded bg-muted/30 p-3 overflow-auto max-h-96 text-xs font-mono whitespace-pre">
              <JsonRenderer value={parsed} />
            </pre>
          </div>
        )
      } catch {
        // Fall through to raw
      }
    }

    return (
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {formatBytes(size ?? decoded.length)}
          </Badge>
        </div>
        <pre className="rounded bg-muted/30 p-3 overflow-auto max-h-96 text-xs font-mono whitespace-pre-wrap break-all">
          {decoded}
        </pre>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {formatBytes(size ?? 0)}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {mimeType}
        </Badge>
      </div>
      <div className="rounded bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        Binary data ({formatBytes(size ?? 0)})
      </div>
    </div>
  )
}

function CollapsibleSection({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        {title}
        {badge}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

function RequestDetail({ message }: { message: HttpMessage | null }) {
  if (!message) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a request to view details</p>
      </div>
    )
  }

  const hasReqHeaders = Object.keys(message.requestHeaders).length > 0
  const hasResHeaders = Object.keys(message.responseHeaders).length > 0

  return (
    <div className="h-full overflow-auto">
      {/* Request Section */}
      <CollapsibleSection title="REQUEST" badge={
        <Badge variant="secondary" className={cn("font-mono text-xs ml-1", methodColor(message.method))}>
          {message.method}
        </Badge>
      }>
        <div className="rounded bg-muted/50 px-3 py-2 font-mono text-xs break-all text-foreground">
          {message.url}
        </div>

        {hasReqHeaders && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              Headers
            </h4>
            <HeadersTable headers={message.requestHeaders} />
          </div>
        )}

        {message.requestBody && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              Body
            </h4>
            <BodyViewer
              body={message.requestBody}
              headers={message.requestHeaders}
              size={message.requestBodySize}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* Response Section */}
      <CollapsibleSection
        title="RESPONSE"
        badge={
          message.statusCode ? (
            <Badge variant="secondary" className={cn("font-mono text-xs ml-1", statusColor(message.statusCode))}>
              {message.statusCode}
            </Badge>
          ) : undefined
        }
      >
        <div className="flex items-center gap-3">
          <span className={cn("text-sm font-mono font-semibold", statusColor(message.statusCode))}>
            {message.statusCode || "—"}
          </span>
          {message.duration !== undefined && message.duration > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatDuration(message.duration)}
            </span>
          )}
          {(message.responseBodySize ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatBytes(message.responseBodySize ?? 0)}
            </span>
          )}
        </div>

        {hasResHeaders && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              Headers
            </h4>
            <HeadersTable headers={message.responseHeaders} />
          </div>
        )}

        {message.responseBody && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              Body
            </h4>
            <BodyViewer
              body={message.responseBody}
              headers={message.responseHeaders}
              size={message.responseBodySize}
            />
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

function RequestList({
  messages,
  selectedId,
  onSelect,
}: {
  messages: HttpMessage[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    isAtBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 30
  }, [])

  useEffect(() => {
    if (isAtBottom.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="h-full overflow-auto"
    >
      <table className="w-full">
        <thead className="sticky top-0 bg-background z-10">
          <tr className="border-b border-border">
            <th className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-16">
              Method
            </th>
            <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-14">
              Status
            </th>
            <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Host
            </th>
            <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Path
            </th>
          </tr>
        </thead>
        <tbody>
          {messages.map((msg) => {
            const { host, path } = parseUrl(msg.url)
            return (
              <tr
                key={msg.id}
                onClick={() => onSelect(msg.id)}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                  selectedId === msg.id && "bg-accent",
                )}
              >
                <td className="px-3 py-1.5">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "font-mono text-[10px] px-1.5 py-0",
                      methodColor(msg.method),
                    )}
                  >
                    {msg.method}
                  </Badge>
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={cn(
                      "text-xs font-mono font-medium",
                      statusColor(msg.statusCode),
                    )}
                  >
                    {msg.statusCode || "—"}
                  </span>
                </td>
                <td className="px-2 py-1.5 max-w-0">
                  <span className="block truncate text-xs font-mono text-foreground">
                    {host}
                  </span>
                </td>
                <td className="px-2 py-1.5 max-w-0">
                  <span className="block truncate text-xs font-mono text-muted-foreground">
                    {path}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// --- Main Page ---

function NetworkPage() {
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/session/$bundleId/network",
  })
  const { messages, connected, clear } = useSessionSocket(sessionId || null)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)

  const httpMessages = useMemo(() => {
    return messages
      .filter(
        (m): m is { type: "http"; payload: HttpMessage } =>
          m.type === "http" && !!m.payload,
      )
      .map((m) => m.payload as unknown as HttpMessage)
  }, [messages])

  const logMessages = useMemo(() => {
    return messages
      .filter((m) => m.type === "log" || m.type === "ready")
      .map((m) => {
        const payload = m.payload as Record<string, unknown> | undefined
        if (m.type === "ready") return `Agent ready (PID: ${payload?.pid})`
        return String(payload?.message ?? JSON.stringify(payload))
      })
  }, [messages])

  const filtered = useMemo(() => {
    if (!search.trim()) return httpMessages
    const q = search.toLowerCase()
    return httpMessages.filter(
      (m) =>
        m.url.toLowerCase().includes(q) ||
        m.method.toLowerCase().includes(q) ||
        String(m.statusCode).includes(q),
    )
  }, [httpMessages, search])

  const selectedMessage = useMemo(() => {
    if (!selectedId) return null
    return filtered.find((m) => m.id === selectedId) ?? null
  }, [filtered, selectedId])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
          <Trash2 className="mr-1.5 h-3 w-3" />
          Clear
        </Button>
        <Button
          variant={showLogs ? "secondary" : "ghost"}
          size="sm"
          className="h-8"
          onClick={() => setShowLogs(!showLogs)}
        >
          Logs ({logMessages.length})
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {connected ? (
            <>
              <Wifi className="h-3 w-3 text-green-500" />
              <span>Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-red-500" />
              <span>Disconnected</span>
            </>
          )}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Logs panel */}
      {showLogs && logMessages.length > 0 && (
        <div className="border-b border-border bg-muted/30 px-4 py-2 max-h-28 overflow-auto">
          {logMessages.map((msg, i) => (
            <div key={i} className="text-[11px] font-mono text-muted-foreground">
              {msg}
            </div>
          ))}
        </div>
      )}

      {/* Master-detail */}
      <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <Wifi className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {httpMessages.length === 0
                ? "Waiting for network requests..."
                : "No requests match your filter"}
            </p>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={40} minSize={20}>
              <RequestList
                messages={filtered}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={60} minSize={30}>
              <RequestDetail message={selectedMessage} />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}

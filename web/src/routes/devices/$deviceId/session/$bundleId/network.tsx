import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { Search, Trash2, Wifi, WifiOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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

function NetworkPage() {
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/session/$bundleId/network",
  })
  const { messages, connected, clear } = useSessionSocket(sessionId || null)
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const httpMessages = useMemo(() => {
    return messages
      .filter(
        (m): m is { type: "http"; payload: HttpMessage } =>
          m.type === "http" && !!m.payload,
      )
      .map((m) => m.payload as unknown as HttpMessage)
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by URL, method, or status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={clear}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Clear
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {connected ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-green-500" />
              Connected
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-red-500" />
              Disconnected
            </>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
            <Wifi className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {httpMessages.length === 0
                ? "Waiting for network requests..."
                : "No requests match your filter"}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border">
                <th className="px-6 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-20">
                  Method
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  URL
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-20">
                  Status
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground w-24">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((msg) => (
                <tr
                  key={msg.id}
                  onClick={() =>
                    setExpandedId(expandedId === msg.id ? null : msg.id)
                  }
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                    expandedId === msg.id && "bg-muted/30",
                  )}
                >
                  <td className="px-6 py-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-mono text-xs",
                        methodColor(msg.method),
                      )}
                    >
                      {msg.method}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 max-w-0">
                    <span className="block truncate text-sm text-foreground font-mono">
                      {msg.url}
                    </span>
                    {expandedId === msg.id && (
                      <div className="mt-2 space-y-2 pb-2">
                        {Object.keys(msg.requestHeaders).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Request Headers
                            </p>
                            <div className="rounded bg-muted/50 p-2 text-xs font-mono">
                              {Object.entries(msg.requestHeaders).map(
                                ([k, v]) => (
                                  <div key={k}>
                                    <span className="text-muted-foreground">
                                      {k}:
                                    </span>{" "}
                                    {v}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                        {Object.keys(msg.responseHeaders).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Response Headers
                            </p>
                            <div className="rounded bg-muted/50 p-2 text-xs font-mono">
                              {Object.entries(msg.responseHeaders).map(
                                ([k, v]) => (
                                  <div key={k}>
                                    <span className="text-muted-foreground">
                                      {k}:
                                    </span>{" "}
                                    {v}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "text-sm font-mono font-medium",
                        statusColor(msg.statusCode),
                      )}
                    >
                      {msg.statusCode || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

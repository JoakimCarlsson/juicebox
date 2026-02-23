import { useCallback, useState } from "react"
import { Send, X, Undo2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PendingRequest, InterceptDecision } from "@/types/session"
import { methodColor } from "./helpers"

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

export function PendingRequestEditor({
  pending,
  onDecision,
}: {
  pending: PendingRequest
  onDecision: (decision: InterceptDecision) => void
}) {
  if (pending.phase === "response") {
    return <ResponsePhaseEditor pending={pending} onDecision={onDecision} />
  }
  return <RequestPhaseEditor pending={pending} onDecision={onDecision} />
}

function RequestPhaseEditor({
  pending,
  onDecision,
}: {
  pending: PendingRequest
  onDecision: (decision: InterceptDecision) => void
}) {
  const [method, setMethod] = useState(pending.method)
  const [url, setUrl] = useState(pending.url)
  const [headers, setHeaders] = useState<[string, string][]>(() =>
    Object.entries(pending.headers),
  )
  const [body, setBody] = useState(pending.body ?? "")

  const hasChanges =
    method !== pending.method ||
    url !== pending.url ||
    body !== (pending.body ?? "") ||
    JSON.stringify(Object.fromEntries(headers)) !==
      JSON.stringify(pending.headers)

  const handleForward = useCallback(() => {
    if (hasChanges) {
      const headerMap: Record<string, string> = {}
      for (const [k, v] of headers) {
        if (k.trim()) headerMap[k.trim()] = v
      }
      onDecision({
        requestId: pending.id,
        action: "modify",
        method,
        url,
        headers: headerMap,
        body: body || undefined,
      })
    } else {
      onDecision({ requestId: pending.id, action: "forward" })
    }
  }, [pending.id, method, url, headers, body, hasChanges, onDecision])

  const handleForwardOriginal = useCallback(() => {
    onDecision({ requestId: pending.id, action: "forward" })
  }, [pending.id, onDecision])

  const handleDrop = useCallback(() => {
    onDecision({ requestId: pending.id, action: "drop" })
  }, [pending.id, onDecision])

  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, ["", ""]])
  }, [])

  const removeHeader = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateHeader = useCallback(
    (index: number, field: 0 | 1, value: string) => {
      setHeaders((prev) =>
        prev.map((entry, i) => {
          if (i !== index) return entry
          const updated: [string, string] = [...entry]
          updated[field] = value
          return updated
        }),
      )
    },
    [],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px]">
          PAUSED — REQUEST
        </Badge>
        <span className="text-xs text-muted-foreground font-mono truncate">
          {pending.id}
        </span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        <div className="flex items-center gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={cn(
              "h-8 rounded border border-border bg-background px-2 text-xs font-mono font-medium",
              methodColor(method),
            )}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 h-8 text-xs font-mono"
          />
        </div>

        <HeadersEditor
          headers={headers}
          onAdd={addHeader}
          onRemove={removeHeader}
          onUpdate={updateHeader}
        />

        {(pending.body || body) && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              Body
            </h4>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full min-h-[120px] rounded border border-border bg-background px-3 py-2 text-xs font-mono resize-y outline-none focus:ring-1 focus:ring-ring"
              spellCheck={false}
            />
          </div>
        )}
      </div>

      <ActionBar
        hasChanges={hasChanges}
        onForward={handleForward}
        onForwardOriginal={handleForwardOriginal}
        onDrop={handleDrop}
      />
    </div>
  )
}

function ResponsePhaseEditor({
  pending,
  onDecision,
}: {
  pending: PendingRequest
  onDecision: (decision: InterceptDecision) => void
}) {
  const [statusCode, setStatusCode] = useState(
    String(pending.statusCode ?? 200),
  )
  const [headers, setHeaders] = useState<[string, string][]>(() =>
    Object.entries(pending.responseHeaders ?? {}),
  )
  const [body, setBody] = useState(pending.responseBody ?? "")

  const hasChanges =
    statusCode !== String(pending.statusCode ?? 200) ||
    body !== (pending.responseBody ?? "") ||
    JSON.stringify(Object.fromEntries(headers)) !==
      JSON.stringify(pending.responseHeaders ?? {})

  const handleForward = useCallback(() => {
    if (hasChanges) {
      const headerMap: Record<string, string> = {}
      for (const [k, v] of headers) {
        if (k.trim()) headerMap[k.trim()] = v
      }
      const sc = parseInt(statusCode, 10)
      onDecision({
        requestId: pending.id,
        action: "modify",
        statusCode: isNaN(sc) ? undefined : sc,
        responseHeaders: headerMap,
        responseBody: body || undefined,
      })
    } else {
      onDecision({ requestId: pending.id, action: "forward" })
    }
  }, [pending.id, statusCode, headers, body, hasChanges, onDecision])

  const handleForwardOriginal = useCallback(() => {
    onDecision({ requestId: pending.id, action: "forward" })
  }, [pending.id, onDecision])

  const handleDrop = useCallback(() => {
    onDecision({ requestId: pending.id, action: "drop" })
  }, [pending.id, onDecision])

  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, ["", ""]])
  }, [])

  const removeHeader = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateHeader = useCallback(
    (index: number, field: 0 | 1, value: string) => {
      setHeaders((prev) =>
        prev.map((entry, i) => {
          if (i !== index) return entry
          const updated: [string, string] = [...entry]
          updated[field] = value
          return updated
        }),
      )
    },
    [],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px]">
          PAUSED — RESPONSE
        </Badge>
        <span className="text-xs text-muted-foreground font-mono truncate">
          {pending.id}
        </span>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <Badge
            variant="secondary"
            className={cn(
              "font-mono text-[10px] px-1.5 py-0",
              methodColor(pending.method),
            )}
          >
            {pending.method}
          </Badge>
          <span className="truncate">{pending.url}</span>
        </div>

        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
            Status Code
          </h4>
          <Input
            value={statusCode}
            onChange={(e) => setStatusCode(e.target.value)}
            className="w-32 h-8 text-xs font-mono"
            type="number"
          />
        </div>

        <HeadersEditor
          headers={headers}
          label="Response Headers"
          onAdd={addHeader}
          onRemove={removeHeader}
          onUpdate={updateHeader}
        />

        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
            Response Body
          </h4>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full min-h-[120px] rounded border border-border bg-background px-3 py-2 text-xs font-mono resize-y outline-none focus:ring-1 focus:ring-ring"
            spellCheck={false}
          />
        </div>
      </div>

      <ActionBar
        hasChanges={hasChanges}
        onForward={handleForward}
        onForwardOriginal={handleForwardOriginal}
        onDrop={handleDrop}
      />
    </div>
  )
}

function HeadersEditor({
  headers,
  label = "Headers",
  onAdd,
  onRemove,
  onUpdate,
}: {
  headers: [string, string][]
  label?: string
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: 0 | 1, value: string) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={onAdd}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
      <div className="rounded border border-border overflow-hidden">
        {headers.map(([key, value], i) => (
          <div
            key={i}
            className="flex items-center border-b border-border last:border-0"
          >
            <input
              value={key}
              onChange={(e) => onUpdate(i, 0, e.target.value)}
              placeholder="Header name"
              className="w-44 shrink-0 bg-muted/30 px-3 py-1.5 text-xs font-mono border-r border-border outline-none focus:bg-muted/50"
            />
            <input
              value={value}
              onChange={(e) => onUpdate(i, 1, e.target.value)}
              placeholder="Value"
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-background outline-none focus:bg-muted/20"
            />
            <button
              onClick={() => onRemove(i)}
              className="px-2 py-1.5 text-muted-foreground hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {headers.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No headers
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBar({
  hasChanges,
  onForward,
  onForwardOriginal,
  onDrop,
}: {
  hasChanges: boolean
  onForward: () => void
  onForwardOriginal: () => void
  onDrop: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
      <Button size="sm" className="h-8" onClick={onForward}>
        <Send className="mr-1.5 h-3 w-3" />
        {hasChanges ? "Forward Modified" : "Forward"}
      </Button>
      {hasChanges && (
        <Button
          variant="secondary"
          size="sm"
          className="h-8"
          onClick={onForwardOriginal}
        >
          <Undo2 className="mr-1.5 h-3 w-3" />
          Forward Original
        </Button>
      )}
      <Button
        variant="destructive"
        size="sm"
        className="h-8 ml-auto"
        onClick={onDrop}
      >
        <X className="mr-1.5 h-3 w-3" />
        Drop
      </Button>
    </div>
  )
}

import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Search,
  Trash2,
  Cpu,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSessionMessages } from "@/contexts/SessionMessageContext"
import { enableJNITracer } from "@/features/sessions/api"
import { NoSessionEmptyState } from "@/components/sessions/NoSessionEmptyState"
import type { JNIEvent } from "@/types/session"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/jni",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: JNIPage,
})

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    month: "short",
    day: "numeric",
  })
}

function shortClassName(name: string): string {
  const parts = name.split(".")
  return parts.length > 1 ? parts[parts.length - 1] : name
}

function JNIPage() {
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/jni",
  })
  const { messages } = useSessionMessages()
  const [search, setSearch] = useState("")
  const [clearIndex, setClearIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tracerEnabled, setTracerEnabled] = useState(false)
  const enabledRef = useRef(false)

  const clear = useCallback(
    () => setClearIndex(messages.length),
    [messages.length],
  )

  useEffect(() => {
    if (!sessionId || enabledRef.current) return
    enabledRef.current = true
    enableJNITracer(sessionId)
      .then(() => setTracerEnabled(true))
      .catch(() => {})
  }, [sessionId])

  const jniEvents = useMemo(() => {
    return messages
      .slice(clearIndex)
      .filter(
        (m): m is { type: "jni"; payload: JNIEvent } =>
          m.type === "jni" && !!m.payload,
      )
      .map((m) => m.payload as unknown as JNIEvent)
  }, [messages, clearIndex])

  const filtered = useMemo(() => {
    if (!search.trim()) return jniEvents
    const q = search.toLowerCase()
    return jniEvents.filter(
      (e) =>
        e.className.toLowerCase().includes(q) ||
        e.methodName.toLowerCase().includes(q) ||
        (e.library && e.library.toLowerCase().includes(q)),
    )
  }, [jniEvents, search])

  const selectedEvent = useMemo(() => {
    if (!selectedId) return null
    return filtered.find((e) => e.id === selectedId) ?? null
  }, [filtered, selectedId])

  if (!sessionId) {
    return <NoSessionEmptyState />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by class, method, or library..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
          <Trash2 className="mr-1.5 h-3 w-3" />
          Clear
        </Button>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          {!tracerEnabled && " (enabling tracer...)"}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <Cpu className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {jniEvents.length === 0
                ? "Waiting for JNI calls..."
                : "No events match your filter"}
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
              <EventList
                events={filtered}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            {selectedEvent && <EventDetail event={selectedEvent} />}
          </div>
        )}
      </div>
    </div>
  )
}

function EventList({
  events,
  selectedId,
  onSelect,
}: {
  events: JNIEvent[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="divide-y divide-border">
      {events.map((event) => {
        const isSelected = event.id === selectedId
        return (
          <button
            key={event.id}
            onClick={() => onSelect(event.id)}
            className={cn(
              "w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors",
              isSelected && "bg-muted/70",
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-muted-foreground truncate">
                  {shortClassName(event.className)}
                </span>
                <span className="text-muted-foreground/50">.</span>
                <span className="text-xs font-mono text-foreground truncate font-medium">
                  {event.methodName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {event.library && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 font-mono shrink-0"
                  >
                    {event.library}
                  </Badge>
                )}
                {event.signature && (
                  <span className="text-[10px] text-muted-foreground font-mono truncate">
                    {event.signature}
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {formatTimestamp(event.timestamp)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function EventDetail({ event }: { event: JNIEvent }) {
  const [expandedBt, setExpandedBt] = useState(false)

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2 max-h-[50%] overflow-auto">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono text-foreground font-medium">
          {event.className}.{event.methodName}
        </span>
        {event.library && (
          <Badge variant="outline" className="text-[10px] font-mono">
            {event.library}
          </Badge>
        )}
      </div>

      {event.signature && (
        <div className="flex gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 shrink-0 pt-0.5">
            Sig
          </span>
          <code className="text-xs font-mono text-foreground break-all bg-muted/50 rounded px-1.5 py-0.5 flex-1">
            {event.signature}
          </code>
        </div>
      )}

      {event.arguments.length > 0 && (
        <div className="flex gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 shrink-0 pt-0.5">
            Args
          </span>
          <div className="flex-1 space-y-0.5">
            {event.arguments.map((arg, i) => (
              <code
                key={i}
                className="block text-xs font-mono text-foreground bg-muted/50 rounded px-1.5 py-0.5 break-all"
              >
                [{i}] {arg}
              </code>
            ))}
          </div>
        </div>
      )}

      {event.returnValue && (
        <div className="flex gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 shrink-0 pt-0.5">
            Return
          </span>
          <CopyableCode value={event.returnValue} />
        </div>
      )}

      {event.backtrace.length > 0 && (
        <div>
          <button
            onClick={() => setExpandedBt(!expandedBt)}
            className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            {expandedBt ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
            Backtrace ({event.backtrace.length} frames)
          </button>
          {expandedBt && (
            <div className="mt-1 rounded border border-border bg-muted/30 px-2 py-1.5 max-h-40 overflow-auto">
              {event.backtrace.map((frame, i) => (
                <p
                  key={i}
                  className="text-[10px] font-mono text-foreground/80 leading-relaxed"
                >
                  {frame}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <div className="flex-1 flex items-start gap-1">
      <code className="text-xs font-mono text-foreground break-all bg-muted/50 rounded px-1.5 py-0.5 flex-1">
        {value}
      </code>
      <button onClick={handleCopy} className="p-0.5 hover:bg-muted rounded shrink-0 mt-0.5">
        {copied ? (
          <Check className="h-2.5 w-2.5 text-green-500" />
        ) : (
          <Copy className="h-2.5 w-2.5 text-muted-foreground" />
        )}
      </button>
    </div>
  )
}

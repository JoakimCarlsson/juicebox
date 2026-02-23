import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useCallback, useMemo, useState } from "react"
import { Search, Trash2, Wifi, Pause, FastForward } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { useSessionMessages } from "@/contexts/SessionMessageContext"
import { useIntercept } from "@/contexts/InterceptContext"
import type { HttpMessage } from "@/types/session"
import { RequestList } from "@/components/network/RequestList"
import { RequestDetail } from "@/components/network/RequestDetail"
import { PendingRequestEditor } from "@/components/network/PendingRequestEditor"
import { NoSessionEmptyState } from "@/components/sessions/NoSessionEmptyState"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/network",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: NetworkPage,
})

function NetworkPage() {
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/network",
  })
  const { messages } = useSessionMessages()
  const {
    enabled: interceptEnabled,
    pendingRequests,
    toggleIntercept,
    sendDecision,
    forwardAll,
  } = useIntercept()
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clearIndex, setClearIndex] = useState(0)

  const clear = useCallback(() => setClearIndex(messages.length), [messages.length])

  const httpMessages = useMemo(() => {
    return messages
      .slice(clearIndex)
      .filter(
        (m): m is { type: "http"; payload: HttpMessage } =>
          m.type === "http" && !!m.payload,
      )
      .map((m) => m.payload as unknown as HttpMessage)
  }, [messages, clearIndex])

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

  const pendingAsHttp = useMemo((): HttpMessage[] => {
    return pendingRequests.map((p) => ({
      id: p.id,
      method: p.method,
      url: p.url,
      requestHeaders: p.headers,
      requestBody: p.body,
      requestBodyEncoding: p.bodyEncoding,
      requestBodySize: 0,
      statusCode: 0,
      responseHeaders: {},
      timestamp: p.timestamp,
    }))
  }, [pendingRequests])

  const allMessages = useMemo(() => {
    return [...filtered, ...pendingAsHttp]
  }, [filtered, pendingAsHttp])

  const pendingIds = useMemo(
    () => new Set(pendingRequests.map((p) => p.id)),
    [pendingRequests],
  )

  const selectedMessage = useMemo(() => {
    if (!selectedId) return null
    return allMessages.find((m) => m.id === selectedId) ?? null
  }, [allMessages, selectedId])

  const selectedPending = useMemo(() => {
    if (!selectedId || !pendingIds.has(selectedId)) return null
    return pendingRequests.find((p) => p.id === selectedId) ?? null
  }, [selectedId, pendingIds, pendingRequests])

  if (!sessionId) {
    return <NoSessionEmptyState />
  }

  return (
    <div className="flex h-full flex-col">
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
        <div className="flex items-center gap-1.5">
          <Button
            variant={interceptEnabled ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-8",
              interceptEnabled &&
                "bg-amber-600 hover:bg-amber-700 text-white",
            )}
            onClick={() => toggleIntercept(!interceptEnabled)}
          >
            <Pause className="mr-1.5 h-3 w-3" />
            Intercept
          </Button>
          {pendingRequests.length > 0 && (
            <>
              <Badge variant="destructive" className="text-[10px] tabular-nums">
                {pendingRequests.length}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={forwardAll}
              >
                <FastForward className="mr-1.5 h-3 w-3" />
                Forward All
              </Button>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
          <Trash2 className="mr-1.5 h-3 w-3" />
          Clear
        </Button>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {allMessages.length} request{allMessages.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {allMessages.length === 0 ? (
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
                messages={allMessages}
                selectedId={selectedId}
                onSelect={setSelectedId}
                pendingIds={pendingIds}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={60} minSize={30}>
              {selectedPending ? (
                <PendingRequestEditor
                  pending={selectedPending}
                  onDecision={sendDecision}
                />
              ) : (
                <RequestDetail message={selectedMessage} />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}

import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useCallback, useMemo, useState } from "react"
import { Search, Trash2, Wifi } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { useSessionMessages } from "@/contexts/SessionMessageContext"
import type { HttpMessage } from "@/types/session"
import { RequestList } from "@/components/network/RequestList"
import { RequestDetail } from "@/components/network/RequestDetail"
import { NoSessionEmptyState } from "@/components/sessions/NoSessionEmptyState"

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

  const selectedMessage = useMemo(() => {
    if (!selectedId) return null
    return filtered.find((m) => m.id === selectedId) ?? null
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
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

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

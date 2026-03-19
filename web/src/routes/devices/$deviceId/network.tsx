import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Trash2, Wifi, Pause, FastForward, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useDeviceMessages } from '@/contexts/DeviceMessageContext'
import { useIntercept } from '@/contexts/InterceptContext'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'
import { NoAppAttachedState } from '@/components/devices/NoAppAttachedState'
import type { HttpMessage } from '@/types/session'
import { RequestList } from '@/components/network/RequestList'
import { RequestDetail } from '@/components/network/RequestDetail'
import { PendingRequestEditor } from '@/components/network/PendingRequestEditor'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/devices/$deviceId/network')({
  component: NetworkPage,
})

function NetworkPage() {
  const { selectedApp } = useAttachedApps()

  if (!selectedApp) {
    return <NoAppAttachedState feature="Network" />
  }

  return <NetworkPageInner sessionId={selectedApp.sessionId ?? ''} />
}

function NetworkPageInner({ sessionId }: { sessionId: string }) {
  const { messages, clearByType } = useDeviceMessages()
  const {
    enabled: interceptEnabled,
    pendingRequests,
    toggleIntercept,
    sendDecision,
    forwardAll,
  } = useIntercept()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const clear = useCallback(async () => {
    setClearing(true)
    try {
      await clearByType('http')
    } finally {
      setClearing(false)
    }
  }, [clearByType])

  const exportCapture = useCallback(
    (format: 'har' | 'burp') => {
      if (!sessionId) return
      const a = document.createElement('a')
      a.href = `/api/v1/sessions/${sessionId}/export?format=${format}`
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    },
    [sessionId]
  )

  const httpMessages = useMemo(() => {
    return messages
      .filter((m): m is { type: 'http'; payload: HttpMessage } => m.type === 'http' && !!m.payload)
      .map((m) => m.payload as unknown as HttpMessage)
  }, [messages])

  const filtered = useMemo(() => {
    if (!search.trim()) return httpMessages
    const q = search.toLowerCase()
    return httpMessages.filter(
      (m) =>
        m.url.toLowerCase().includes(q) ||
        m.method.toLowerCase().includes(q) ||
        String(m.statusCode).includes(q)
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
      statusCode: p.phase === 'response' ? (p.statusCode ?? 0) : 0,
      responseHeaders: p.phase === 'response' ? (p.responseHeaders ?? {}) : {},
      responseBody: p.phase === 'response' ? p.responseBody : undefined,
      responseBodyEncoding: p.phase === 'response' ? p.responseBodyEncoding : undefined,
      timestamp: p.timestamp,
    }))
  }, [pendingRequests])

  const allMessages = useMemo(() => {
    return [...filtered, ...pendingAsHttp]
  }, [filtered, pendingAsHttp])

  const pendingIds = useMemo(() => new Set(pendingRequests.map((p) => p.id)), [pendingRequests])

  const selectedMessage = useMemo(() => {
    if (!selectedId) return null
    return allMessages.find((m) => m.id === selectedId) ?? null
  }, [allMessages, selectedId])

  const prevPendingIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const prevIds = prevPendingIdsRef.current
    const newArrivals = pendingRequests.filter((p) => !prevIds.has(p.id))
    prevPendingIdsRef.current = pendingIds

    if (newArrivals.length > 0 && (!selectedId || !pendingIds.has(selectedId))) {
      setSelectedId(newArrivals[newArrivals.length - 1].id)
    }
  }, [pendingRequests, pendingIds, selectedId])

  const selectedPending = useMemo(() => {
    if (!selectedId || !pendingIds.has(selectedId)) return null
    return pendingRequests.find((p) => p.id === selectedId) ?? null
  }, [selectedId, pendingIds, pendingRequests])

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
            variant={interceptEnabled ? 'default' : 'ghost'}
            size="sm"
            className={cn('h-8', interceptEnabled && 'bg-amber-600 hover:bg-amber-700 text-white')}
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
              <Button variant="ghost" size="sm" className="h-8" onClick={forwardAll}>
                <FastForward className="mr-1.5 h-3 w-3" />
                Forward All
              </Button>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-8" onClick={clear} disabled={clearing}>
          <Trash2 className="mr-1.5 h-3 w-3" />
          {clearing ? 'Clearing...' : 'Clear'}
        </Button>
        {sessionId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8" disabled={allMessages.length === 0}>
                <Download className="mr-1.5 h-3 w-3" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportCapture('har')}>
                Export as HAR
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCapture('burp')}>
                Export as Burp XML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {allMessages.length} request{allMessages.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <Wifi className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {httpMessages.length === 0
                ? 'Waiting for network requests...'
                : 'No requests match your filter'}
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
                <PendingRequestEditor pending={selectedPending} onDecision={sendDecision} />
              ) : (
                <RequestDetail message={selectedMessage} sessionId={sessionId} />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}

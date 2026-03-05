import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { Search, Trash2, Smartphone, ArrowRight, ArrowLeft } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDeviceMessages } from '@/contexts/DeviceMessageContext'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'
import { NoAppAttachedState } from '@/components/devices/NoAppAttachedState'
import type { FlutterChannelEvent } from '@/types/session'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/devices/$deviceId/flutter')({
  component: FlutterPage,
})

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    month: 'short',
    day: 'numeric',
  })
}

function truncateStr(str: string | undefined | null, maxLen = 80): string {
  if (!str) return '-'
  if (str.length <= maxLen) return str
  return str.substring(0, maxLen) + '...'
}

const DIRECTION_COLORS: Record<string, string> = {
  dart_to_native: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  native_to_dart: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
}

const DIRECTION_LABELS: Record<string, string> = {
  dart_to_native: 'Dart \u2192 Native',
  native_to_dart: 'Native \u2192 Dart',
}

function FlutterPage() {
  const { selectedApp } = useAttachedApps()
  const { messages, clearByType } = useDeviceMessages()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const clear = useCallback(() => clearByType('flutter_channel'), [clearByType])

  const events = useMemo(() => {
    return messages
      .filter(
        (m): m is { type: 'flutter_channel'; payload: FlutterChannelEvent } =>
          m.type === 'flutter_channel' && !!m.payload
      )
      .map((m) => m.payload as unknown as FlutterChannelEvent)
  }, [messages])

  const filtered = useMemo(() => {
    if (!search.trim()) return events
    const q = search.toLowerCase()
    return events.filter(
      (e) =>
        e.channel.toLowerCase().includes(q) ||
        (e.method?.toLowerCase().includes(q) ?? false)
    )
  }, [events, search])

  const selectedEvent = useMemo(() => {
    if (!selectedId) return null
    return filtered.find((e) => e.id === selectedId) ?? null
  }, [filtered, selectedId])

  const { deviceId } = useParams({ strict: false })
  const navigate = useNavigate()

  if (!selectedApp) {
    return <NoAppAttachedState feature="Flutter Channels" />
  }

  if (selectedApp.isFlutter === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
        <Smartphone className="h-8 w-8 opacity-30 animate-pulse" />
        <p className="text-sm">Detecting Flutter...</p>
      </div>
    )
  }

  if (selectedApp.isFlutter === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-muted-foreground">
        <Smartphone className="h-8 w-8 opacity-30" />
        <p className="text-sm font-medium">Connect to a Flutter app</p>
        <p className="text-xs opacity-60">The attached app is not a Flutter app</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate({
              to: '/devices/$deviceId/apps',
              params: { deviceId: deviceId! },
            })
          }
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Go to Apps
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by channel or method..."
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
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <Smartphone className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {events.length === 0
                ? 'Waiting for Flutter platform channel events...'
                : 'No events match your filter'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-auto">
              <EventList events={filtered} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            {selectedEvent && <EventDetail event={selectedEvent} />}
          </>
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
  events: FlutterChannelEvent[]
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
              'w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors',
              isSelected && 'bg-muted/70'
            )}
          >
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 font-mono shrink-0 gap-1',
                DIRECTION_COLORS[event.direction] ?? 'bg-muted'
              )}
            >
              {event.direction === 'dart_to_native' ? (
                <ArrowRight className="h-2.5 w-2.5" />
              ) : (
                <ArrowLeft className="h-2.5 w-2.5" />
              )}
              {DIRECTION_LABELS[event.direction] ?? event.direction}
            </Badge>
            <span className="text-xs font-mono truncate text-foreground min-w-0 flex-1">
              {event.channel}
              {event.method && (
                <span className="text-muted-foreground">.{event.method}</span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {formatTimestamp(event.timestamp)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function EventDetail({ event }: { event: FlutterChannelEvent }) {
  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2 max-h-[50%] overflow-auto">
      <div className="flex items-center gap-2 mb-2">
        <Badge
          variant="outline"
          className={cn('text-[10px] font-mono', DIRECTION_COLORS[event.direction] ?? '')}
        >
          {DIRECTION_LABELS[event.direction] ?? event.direction}
        </Badge>
        <span className="text-xs font-mono text-foreground">{event.channel}</span>
        {event.method && (
          <span className="text-xs font-mono text-muted-foreground">.{event.method}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {event.arguments && (
          <DataBlock label="Arguments" value={event.arguments} />
        )}
        {event.result && (
          <DataBlock label="Result" value={event.result} />
        )}
      </div>
    </div>
  )
}

function DataBlock({ label, value }: { label: string; value: string }) {
  const formatted = useMemo(() => {
    if (value.startsWith('hex:')) return value
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }, [value])

  return (
    <div className="flex gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 shrink-0 pt-0.5">
        {label}
      </span>
      <pre className="text-xs font-mono text-foreground break-all bg-muted/50 rounded px-1.5 py-0.5 flex-1 whitespace-pre-wrap max-h-48 overflow-auto">
        {truncateStr(formatted, 2000)}
      </pre>
    </div>
  )
}

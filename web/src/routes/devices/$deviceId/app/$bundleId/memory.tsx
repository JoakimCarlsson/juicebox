import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Search, Square, Trash2, ChevronDown, Copy, Check, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useSessionMessages } from '@/contexts/SessionMessageContext'
import type { MemoryScanMatch, MemoryScanEvent } from '@/types/session'
import { startMemoryScan, stopMemoryScan } from '@/features/sessions/api'
import { NoSessionEmptyState } from '@/components/sessions/NoSessionEmptyState'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/devices/$deviceId/app/$bundleId/memory')({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? '',
  }),
  component: MemoryPage,
})

type PatternMode = 'string' | 'hex'

interface Preset {
  label: string
  pattern: string
  mode: PatternMode
}

const PRESETS: Preset[] = [
  { label: 'JWT (eyJ)', pattern: '65 79 4A', mode: 'hex' },
  { label: 'Bearer', pattern: 'Bearer ', mode: 'string' },
  { label: 'Authorization:', pattern: 'Authorization:', mode: 'string' },
  { label: 'Stripe (sk_live_)', pattern: 'sk_live_', mode: 'string' },
  { label: 'Stripe (sk_test_)', pattern: 'sk_test_', mode: 'string' },
  { label: 'AWS (AKIA)', pattern: 'AKIA', mode: 'string' },
  { label: 'GitHub (ghp_)', pattern: 'ghp_', mode: 'string' },
  { label: 'GitHub (gho_)', pattern: 'gho_', mode: 'string' },
  { label: 'password', pattern: 'password', mode: 'string' },
  { label: 'secret', pattern: 'secret', mode: 'string' },
  { label: 'api_key', pattern: 'api_key', mode: 'string' },
  { label: 'access_token', pattern: 'access_token', mode: 'string' },
]

function MemoryPage() {
  const { sessionId } = useSearch({
    from: '/devices/$deviceId/app/$bundleId/memory',
  })
  const { messages } = useSessionMessages()

  const [pattern, setPattern] = useState('')
  const [mode, setMode] = useState<PatternMode>('string')
  const [scanning, setScanning] = useState(false)
  const [clearIndex, setClearIndex] = useState(0)
  const [presetOpen, setPresetOpen] = useState(false)
  const presetRef = useRef<HTMLDivElement>(null)

  const scanEvents = useMemo(() => {
    return messages
      .slice(clearIndex)
      .filter(
        (m): m is { type: 'memoryScan'; payload: MemoryScanEvent } =>
          m.type === 'memoryScan' && !!m.payload
      )
      .map((m) => m.payload as unknown as MemoryScanEvent)
  }, [messages, clearIndex])

  const matches = useMemo(() => {
    return scanEvents.filter((e): e is MemoryScanMatch => e.event === 'match')
  }, [scanEvents])

  const progress = useMemo(() => {
    const progressEvents = scanEvents.filter((e) => e.event === 'progress')
    return progressEvents.length > 0 ? progressEvents[progressEvents.length - 1] : null
  }, [scanEvents])

  const isDone = useMemo(() => {
    return scanEvents.some((e) => e.event === 'done')
  }, [scanEvents])

  const doneEvent = useMemo(() => {
    return scanEvents.find((e) => e.event === 'done') ?? null
  }, [scanEvents])

  const isActive = scanning && !isDone

  const handleScan = useCallback(async () => {
    if (!sessionId || !pattern.trim()) return
    setClearIndex(messages.length)
    setScanning(true)
    try {
      await startMemoryScan(sessionId, pattern.trim())
    } catch {
      setScanning(false)
    }
  }, [sessionId, pattern, messages.length])

  const handleStop = useCallback(async () => {
    if (!sessionId) return
    try {
      await stopMemoryScan(sessionId)
    } catch {}
    setScanning(false)
  }, [sessionId])

  const handlePreset = useCallback((preset: Preset) => {
    setPattern(preset.pattern)
    setMode(preset.mode)
    setPresetOpen(false)
  }, [])

  const clear = useCallback(() => {
    setClearIndex(messages.length)
    setScanning(false)
  }, [messages.length])

  if (!sessionId) {
    return <NoSessionEmptyState />
  }

  const progressPct =
    progress && 'current' in progress && 'total' in progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <button
            onClick={() => setMode('string')}
            className={cn(
              'px-2 py-0.5 text-[10px] rounded transition-colors',
              mode === 'string'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            String
          </button>
          <button
            onClick={() => setMode('hex')}
            className={cn(
              'px-2 py-0.5 text-[10px] rounded font-mono transition-colors',
              mode === 'hex'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Hex
          </button>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={mode === 'hex' ? '65 79 4A ?? ?? ...' : 'eyJhbG...'}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isActive) handleScan()
            }}
            className={cn('pl-8 h-8 text-xs', mode === 'hex' && 'font-mono')}
          />
        </div>

        <div className="relative" ref={presetRef}>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setPresetOpen((v) => !v)}
          >
            Presets
            <ChevronDown className="h-3 w-3" />
          </Button>
          {presetOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPresetOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-md py-1">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors flex items-center justify-between"
                  >
                    <span>{preset.label}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                      {preset.mode}
                    </Badge>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {isActive ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleStop}
          >
            <Square className="h-3 w-3" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleScan}
            disabled={!pattern.trim()}
          >
            <Search className="h-3 w-3" />
            Scan
          </Button>
        )}

        <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
          <Trash2 className="mr-1.5 h-3 w-3" />
          Clear
        </Button>

        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {matches.length} match{matches.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {isActive && progress && 'current' in progress && 'total' in progress && (
        <div className="border-b border-border px-4 py-1.5 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {progress.current} / {progress.total} ranges ({progressPct}%)
          </span>
        </div>
      )}

      {isDone && doneEvent && 'count' in doneEvent && (
        <div className="border-b border-border px-4 py-1.5 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Scan complete
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {doneEvent.count} match{doneEvent.count !== 1 ? 'es' : ''} found
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <Cpu className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {isActive ? 'Scanning process memory...' : 'No memory scan results yet'}
            </p>
            <p className="text-xs opacity-60">Search for byte patterns in the live process heap</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {matches.map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MatchRow({ match }: { match: MemoryScanMatch }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(match.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [match.address])

  return (
    <div className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <button onClick={handleCopy} className="flex items-center gap-1 group">
          <code className="text-xs font-mono text-blue-600 dark:text-blue-400">
            {match.address}
          </code>
          {copied ? (
            <Check className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <Copy className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
          {match.size} byte{match.size !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="rounded border border-border bg-muted/30 p-2 font-mono text-[11px] leading-5">
        <div className="text-foreground/80 break-all select-all">{match.hexDump}</div>
        {match.utf8Preview && (
          <div className="text-muted-foreground mt-1 border-t border-border pt-1 break-all select-all">
            {match.utf8Preview}
          </div>
        )}
      </div>
    </div>
  )
}

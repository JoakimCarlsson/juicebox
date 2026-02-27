import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Trash2, FileText, ArrowDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useDeviceMessages } from '@/contexts/DeviceMessageContext'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'
import { NoAppAttachedState } from '@/components/devices/NoAppAttachedState'
import type { LogcatEntry } from '@/types/session'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/devices/$deviceId/logs')({
  component: LogsPage,
})

const LEVEL_CONFIG: Record<string, { color: string; bg: string }> = {
  V: { color: 'text-muted-foreground', bg: '' },
  D: { color: 'text-blue-600 dark:text-blue-400', bg: '' },
  I: { color: 'text-green-600 dark:text-green-400', bg: '' },
  W: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5' },
  E: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' },
  F: { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-500/20' },
}

const ALL_LEVELS = ['V', 'D', 'I', 'W', 'E', 'F'] as const
const MAX_ENTRIES = 10000

function LogsPage() {
  const { selectedApp } = useAttachedApps()

  if (!selectedApp) {
    return <NoAppAttachedState feature="Logs" />
  }

  return <LogsPageInner />
}

function LogsPageInner() {
  const { messages, clearByType } = useDeviceMessages()
  const [search, setSearch] = useState('')
  const [activeLevels, setActiveLevels] = useState<Set<string>>(new Set(['D', 'I', 'W', 'E', 'F']))
  const [clearing, setClearing] = useState(false)

  const clear = useCallback(async () => {
    setClearing(true)
    try {
      await clearByType('logcat')
    } finally {
      setClearing(false)
    }
  }, [clearByType])

  const logcatMessages = useMemo(() => {
    const all = messages
      .filter(
        (m): m is { type: 'logcat'; payload: LogcatEntry } => m.type === 'logcat' && !!m.payload
      )
      .map((m) => m.payload as unknown as LogcatEntry)
    return all.length > MAX_ENTRIES ? all.slice(all.length - MAX_ENTRIES) : all
  }, [messages])

  const filtered = useMemo(() => {
    return logcatMessages.filter((entry) => {
      if (!activeLevels.has(entry.level)) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return entry.tag.toLowerCase().includes(q) || entry.message.toLowerCase().includes(q)
      }
      return true
    })
  }, [logcatMessages, search, activeLevels])

  const toggleLevel = useCallback((level: string) => {
    setActiveLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) {
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }, [])

  const listRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    isAtBottom.current = atBottom
    setShowScrollButton(!atBottom)
  }, [])

  useEffect(() => {
    if (isAtBottom.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [filtered.length])

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
      isAtBottom.current = true
      setShowScrollButton(false)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-1">
          {ALL_LEVELS.map((level) => {
            const config = LEVEL_CONFIG[level]
            const isActive = activeLevels.has(level)
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors',
                  isActive
                    ? cn(config.color, 'bg-muted')
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                )}
              >
                {level}
              </button>
            )
          })}
        </div>

        <div className="w-px h-4 bg-border" />

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by tag or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <Button variant="ghost" size="sm" className="h-8" onClick={clear} disabled={clearing}>
          <Trash2 className="mr-1.5 h-3 w-3" />
          {clearing ? 'Clearing...' : 'Clear'}
        </Button>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} log{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0 relative">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <FileText className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {logcatMessages.length === 0
                ? 'Waiting for log output...'
                : 'No logs match your filter'}
            </p>
          </div>
        ) : (
          <>
            <div
              ref={listRef}
              onScroll={handleScroll}
              className="h-full overflow-auto font-mono text-xs"
            >
              <table className="w-full">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b border-border">
                    <th className="px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-36">
                      Time
                    </th>
                    <th className="px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-8">
                      Lvl
                    </th>
                    <th className="px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-12">
                      TID
                    </th>
                    <th className="px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-32">
                      Tag
                    </th>
                    <th className="px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const config = LEVEL_CONFIG[entry.level] ?? LEVEL_CONFIG.D
                    return (
                      <tr key={entry.id} className={cn('border-b border-border/50', config.bg)}>
                        <td className="px-2 py-0.5 text-muted-foreground whitespace-nowrap">
                          {entry.timestamp}
                        </td>
                        <td className={cn('px-2 py-0.5 font-bold', config.color)}>{entry.level}</td>
                        <td className="px-2 py-0.5 text-muted-foreground">{entry.tid}</td>
                        <td className="px-2 py-0.5 truncate max-w-[200px]">{entry.tag}</td>
                        <td className="px-2 py-0.5 break-all">{entry.message}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {showScrollButton && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-3 right-3 rounded-full bg-primary p-2 text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

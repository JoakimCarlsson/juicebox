import { useBottomPanel, type PanelTab } from '@/contexts/BottomPanelContext'
import { useEventLog, type EventLogEntry } from '@/contexts/EventLogContext'
import { useScriptOutput } from '@/contexts/ScriptOutputContext'
import { useSessionMessages } from '@/contexts/SessionMessageContext'
import type { ClipboardEvent, LogEntry } from '@/types/session'
import { enableClipboardMonitor } from '@/features/sessions/api'
import { Button } from '@/components/ui/button'
import { Terminal, AlertTriangle, Trash2, CheckCircle2, ScrollText, Clipboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useRef, useState } from 'react'

const tabs: { value: PanelTab; label: string; icon: React.ReactNode }[] = [
  {
    value: 'console',
    label: 'Console',
    icon: <Terminal className="mr-1.5 h-3 w-3" />,
  },
  {
    value: 'problems',
    label: 'Problems',
    icon: <AlertTriangle className="mr-1.5 h-3 w-3" />,
  },
  {
    value: 'output',
    label: 'Output',
    icon: <ScrollText className="mr-1.5 h-3 w-3" />,
  },
  {
    value: 'clipboard',
    label: 'Clipboard',
    icon: <Clipboard className="mr-1.5 h-3 w-3" />,
  },
]

function isLogEntry(payload: unknown): payload is LogEntry {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.level === 'string' && typeof p.source === 'string' && typeof p.message === 'string'
  )
}

function getProblemsCount(entries: EventLogEntry[]): number {
  return entries.filter((e) => e.envelope.type === 'agent-error' || e.envelope.type === 'crash')
    .length
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  const ms = d.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

export function BottomPanel() {
  const { activeTab, setActiveTab } = useBottomPanel()
  const { entries, clear } = useEventLog()
  const scriptOutput = useScriptOutput()
  const { messages } = useSessionMessages()
  const problemsCount = getProblemsCount(entries)

  const clipboardCount = useMemo(
    () => messages.filter((m) => m.type === 'clipboard').length,
    [messages]
  )

  const handleClear = () => {
    if (activeTab === 'output') {
      scriptOutput.clear()
    } else {
      clear()
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-t border-border px-2 h-9 shrink-0">
        <div className="flex items-center gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex items-center h-9 px-3 text-xs transition-colors',
                'border-b-2 border-transparent',
                'text-muted-foreground hover:text-foreground',
                activeTab === tab.value && 'border-foreground text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.value === 'problems' && problemsCount > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
                  {problemsCount}
                </span>
              )}
              {tab.value === 'output' && scriptOutput.entries.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                  {scriptOutput.entries.length}
                </span>
              )}
              {tab.value === 'clipboard' && clipboardCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                  {clipboardCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClear} title="Clear">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'console' && <ConsoleTab />}
        {activeTab === 'problems' && <ProblemsTab />}
        {activeTab === 'output' && <OutputTab />}
        {activeTab === 'clipboard' && <ClipboardTab />}
      </div>
    </div>
  )
}

function ConsoleTab() {
  const { entries } = useEventLog()
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  const logEntries = useMemo(
    () => entries.filter((e) => e.envelope.type === 'log' && isLogEntry(e.envelope.payload)),
    [entries]
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function handleScroll() {
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32
      autoScrollRef.current = atBottom
    }

    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logEntries])

  if (logEntries.length === 0) {
    return <div className="p-3 font-mono text-xs text-muted-foreground">No log entries.</div>
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="font-mono text-xs">
        {logEntries.map((entry) => {
          const payload = entry.envelope.payload as LogEntry
          return (
            <div
              key={entry.id}
              className={cn(
                'flex items-start gap-2 px-3 py-0.5 border-l-2',
                payload.level === 'error' &&
                  'bg-red-500/10 border-l-red-500 text-red-700 dark:text-red-300',
                payload.level === 'warn' &&
                  'bg-amber-500/10 border-l-amber-500 text-amber-700 dark:text-amber-300',
                payload.level === 'info' && 'border-l-transparent text-foreground'
              )}
            >
              <span className="shrink-0 text-muted-foreground">{formatTime(entry.timestamp)}</span>
              <span className="shrink-0 text-muted-foreground w-16 truncate">{payload.source}</span>
              <span className="break-all">{payload.message}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProblemsTab() {
  const { entries } = useEventLog()

  const problems = useMemo(
    () => entries.filter((e) => e.envelope.type === 'agent-error' || e.envelope.type === 'crash'),
    [entries]
  )

  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 font-mono text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        No problems detected.
      </div>
    )
  }

  return (
    <div className="font-mono text-xs">
      {problems.map((entry) => {
        const payload = entry.envelope.payload
        const source = isLogEntry(payload) ? payload.source : entry.envelope.type
        const message = isLogEntry(payload)
          ? payload.message
          : typeof payload === 'object' && payload
            ? JSON.stringify(payload)
            : String(payload)

        return (
          <div
            key={entry.id}
            className="flex items-start gap-2 px-3 py-0.5 border-l-2 bg-red-500/10 border-l-red-500 text-red-700 dark:text-red-300"
          >
            <span className="shrink-0 text-muted-foreground">{formatTime(entry.timestamp)}</span>
            <span className="shrink-0 text-muted-foreground w-16 truncate">{source}</span>
            <span className="break-all">{message}</span>
          </div>
        )
      })}
    </div>
  )
}

function OutputTab() {
  const { entries } = useScriptOutput()
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function handleScroll() {
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32
      autoScrollRef.current = atBottom
    }

    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="p-3 font-mono text-xs text-muted-foreground">
        Script output will appear here when you run a Frida script.
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="font-mono text-xs">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              'flex items-start gap-2 px-3 py-0.5 border-l-2',
              entry.isError
                ? 'bg-red-500/10 border-l-red-500 text-red-700 dark:text-red-300'
                : 'border-l-transparent text-foreground'
            )}
          >
            <span className="shrink-0 text-muted-foreground">{formatTime(entry.timestamp)}</span>
            <pre className="whitespace-pre-wrap break-all flex-1">
              {typeof entry.payload === 'string'
                ? entry.payload
                : JSON.stringify(entry.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClipboardTab() {
  const { sessionId, messages } = useSessionMessages()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const enabledRef = useRef(false)

  useEffect(() => {
    if (!sessionId || enabledRef.current) return
    enabledRef.current = true
    enableClipboardMonitor(sessionId).catch(() => {})
  }, [sessionId])

  const events = useMemo(
    () =>
      messages
        .filter(
          (m): m is { type: 'clipboard'; payload: ClipboardEvent } =>
            m.type === 'clipboard' && !!m.payload
        )
        .map((m) => m.payload as unknown as ClipboardEvent),
    [messages]
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function handleScroll() {
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32
      autoScrollRef.current = atBottom
    }

    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  if (!sessionId) {
    return (
      <div className="p-3 font-mono text-xs text-muted-foreground">
        Attach to an app to monitor clipboard.
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 h-full text-muted-foreground">
        <Clipboard className="h-5 w-5 opacity-30" />
        <span className="text-xs">Waiting for clipboard events...</span>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="font-mono text-xs">
        {events.map((evt) => {
          const isRead = evt.direction === 'read'
          const isExpanded = expandedId === evt.id
          return (
            <div
              key={evt.id}
              className={cn(
                'flex flex-col px-3 py-0.5 border-l-2 cursor-pointer hover:bg-muted/30',
                isRead ? 'border-l-green-500' : 'border-l-blue-500'
              )}
              onClick={() => setExpandedId(isExpanded ? null : evt.id)}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-muted-foreground">{formatTime(evt.timestamp)}</span>
                <span
                  className={cn(
                    'shrink-0 text-[10px] font-medium w-10',
                    isRead
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-blue-600 dark:text-blue-400'
                  )}
                >
                  {isRead ? 'READ' : 'WRITE'}
                </span>
                {evt.mimeType && evt.mimeType !== 'text/plain' && (
                  <span className="shrink-0 text-muted-foreground/60">{evt.mimeType}</span>
                )}
                <span className="flex-1 truncate text-foreground">{evt.content ?? '(empty)'}</span>
              </div>
              {isExpanded && evt.callerStack && (
                <pre className="ml-[5.5rem] mt-0.5 mb-1 text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {evt.callerStack}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

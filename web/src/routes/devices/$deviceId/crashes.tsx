import { createFileRoute, useParams } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronRight,
  Cpu,
  Coffee,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDeviceMessages } from '@/contexts/DeviceMessageContext'
import type { CrashEvent } from '@/types/session'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/devices/$deviceId/crashes')({
  component: CrashesPage,
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

function CrashesPage() {
  const { deviceId } = useParams({ from: '/devices/$deviceId/crashes' })
  const { messages } = useDeviceMessages()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [clearIndex, setClearIndex] = useState(0)

  const clear = useCallback(() => setClearIndex(messages.length), [messages.length])

  const crashes = useMemo(() => {
    return messages
      .slice(clearIndex)
      .filter((m): m is { type: 'crash'; payload: CrashEvent } => m.type === 'crash' && !!m.payload)
      .map((m) => m.payload as unknown as CrashEvent)
      .reverse()
  }, [messages, clearIndex])

  const exportCrashes = useCallback(() => {
    const data = JSON.stringify(crashes, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crashes-${deviceId}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [crashes, deviceId])

  const exportSingle = useCallback((crash: CrashEvent) => {
    const data = JSON.stringify(crash, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crash-${crash.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {crashes.length} crash{crashes.length !== 1 ? 'es' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
            <Trash2 className="mr-1.5 h-3 w-3" />
            Clear
          </Button>
          {crashes.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8" onClick={exportCrashes}>
              <Download className="mr-1.5 h-3 w-3" />
              Export All
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {crashes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <AlertTriangle className="h-8 w-8 opacity-30" />
            <p className="text-sm">No crashes detected yet</p>
            <p className="text-xs opacity-60">
              Native signals and Java exceptions will appear here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {crashes.map((crash) => {
              const isExpanded = expandedId === crash.id
              const isNative = crash.crashType === 'native'
              return (
                <div key={crash.id} className="group">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : crash.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors',
                      isExpanded && 'bg-muted/30'
                    )}
                  >
                    <div className="mt-0.5">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={isNative ? 'destructive' : 'secondary'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {isNative ? (
                            <Cpu className="mr-1 h-2.5 w-2.5" />
                          ) : (
                            <Coffee className="mr-1 h-2.5 w-2.5" />
                          )}
                          {isNative ? 'NATIVE' : 'JAVA'}
                        </Badge>
                        {crash.signal && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 font-mono text-red-600 dark:text-red-400"
                          >
                            {crash.signal}
                          </Badge>
                        )}
                        {crash.exceptionClass && (
                          <span className="text-xs font-mono text-red-600 dark:text-red-400 truncate">
                            {crash.exceptionClass}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                          {formatTimestamp(crash.timestamp)}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground truncate font-mono">
                        {isNative
                          ? (crash.backtrace?.[0] ?? `Crash at ${crash.address ?? 'unknown'}`)
                          : (crash.exceptionMessage ?? 'Uncaught exception')}
                      </p>
                    </div>
                  </button>

                  {isExpanded && <CrashDetail crash={crash} onExport={exportSingle} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function CrashDetail({
  crash,
  onExport,
}: {
  crash: CrashEvent
  onExport: (crash: CrashEvent) => void
}) {
  const isNative = crash.crashType === 'native'

  return (
    <div className="px-4 pb-4 pl-11 space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onExport(crash)}>
          <Download className="mr-1.5 h-3 w-3" />
          Export
        </Button>
      </div>

      {isNative && crash.address && (
        <DetailSection title="Crash Address">
          <code className="text-xs font-mono text-red-600 dark:text-red-400">{crash.address}</code>
        </DetailSection>
      )}

      {isNative && crash.registers && Object.keys(crash.registers).length > 0 && (
        <DetailSection title="Registers">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1">
            {Object.entries(crash.registers).map(([reg, val]) => (
              <div key={reg} className="flex items-baseline gap-2 font-mono text-xs">
                <span className="text-muted-foreground w-8 text-right shrink-0">{reg}</span>
                <span className="text-foreground truncate">{val}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {isNative && crash.backtrace && crash.backtrace.length > 0 && (
        <DetailSection title="Native Backtrace">
          <div className="space-y-0.5">
            {crash.backtrace.map((frame, i) => (
              <div key={i} className="flex gap-2 font-mono text-xs">
                <span className="text-muted-foreground w-6 text-right shrink-0">#{i}</span>
                <span className="text-foreground break-all">{frame}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {!isNative && crash.javaStackTrace && (
        <DetailSection title="Java Stack Trace">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground leading-5">
            {crash.javaStackTrace}
          </pre>
        </DetailSection>
      )}
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
        {title}
      </h4>
      <div className="rounded-md border border-border bg-muted/30 p-3">{children}</div>
    </div>
  )
}

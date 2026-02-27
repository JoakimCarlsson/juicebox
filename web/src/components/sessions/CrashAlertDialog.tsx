import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, RotateCcw, ArrowRight, Cpu, Coffee, Skull } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDeviceSocket } from '@/contexts/DeviceSocketContext'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'
import { attachApp } from '@/features/devices/api'
import type { CrashEvent, DeviceEnvelope } from '@/types/session'
import { cn } from '@/lib/utils'

interface CrashAlertDialogProps {
  deviceId: string
}

type AlertState =
  | { kind: 'closed' }
  | { kind: 'crash'; crash: CrashEvent; bundleId: string; detached: boolean }
  | { kind: 'detached'; bundleId: string }

export function CrashAlertDialog({ deviceId }: CrashAlertDialogProps) {
  const { subscribe } = useDeviceSocket()
  const { addApp, removeApp } = useAttachedApps()
  const navigate = useNavigate()
  const [state, setState] = useState<AlertState>({ kind: 'closed' })
  const [reattaching, setReattaching] = useState(false)
  const lastCrashTime = useRef(0)

  useEffect(() => {
    const unsub = subscribe(null, (envelope: DeviceEnvelope) => {
      if (envelope.type === 'crash') {
        const crash = envelope.payload as CrashEvent
        const bundleId = (envelope as { bundleId?: string }).bundleId ?? ''
        lastCrashTime.current = Date.now()
        setState({ kind: 'crash', crash, bundleId, detached: false })
      }

      if (envelope.type === 'detached') {
        const bundleId = (envelope as { bundleId?: string }).bundleId ?? ''
        const recentCrash = Date.now() - lastCrashTime.current < 5000
        if (bundleId) removeApp(bundleId)
        setState((prev) => {
          if (prev.kind === 'crash') {
            return { ...prev, detached: true }
          }
          if (!recentCrash) {
            return { kind: 'detached', bundleId }
          }
          return prev
        })
      }
    })

    return unsub
  }, [subscribe, removeApp])

  const bundleId =
    state.kind === 'crash' ? state.bundleId : state.kind === 'detached' ? state.bundleId : ''

  const handleReattach = useCallback(async () => {
    if (!bundleId) return
    setReattaching(true)
    try {
      const resp = await attachApp(deviceId, bundleId)
      addApp(bundleId, resp.sessionId)
      setState({ kind: 'closed' })
    } catch {
      setReattaching(false)
    }
  }, [deviceId, bundleId, addApp])

  const handleViewCrashes = useCallback(() => {
    setState({ kind: 'closed' })
    navigate({
      to: '/devices/$deviceId/crashes',
      params: { deviceId },
    })
  }, [deviceId, navigate])

  const handleDismiss = useCallback(() => {
    setState({ kind: 'closed' })
    setReattaching(false)
  }, [])

  if (state.kind === 'closed') return null

  const showReattach = state.kind === 'detached' || (state.kind === 'crash' && state.detached)
  const crash = state.kind === 'crash' ? state.crash : null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleDismiss()
      }}
    >
      <DialogContent showCloseButton={!reattaching} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                crash ? 'bg-red-500/10' : 'bg-amber-500/10'
              )}
            >
              {crash ? (
                <Skull className="h-5 w-5 text-red-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
            </div>
            <div>
              <DialogTitle>{crash ? 'App Crashed' : 'Session Lost'}</DialogTitle>
              <DialogDescription>
                {crash
                  ? 'The target app encountered a fatal error'
                  : 'The connection to the target app was lost'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {crash && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={crash.crashType === 'native' ? 'destructive' : 'secondary'}
                className="text-[10px] px-1.5 py-0"
              >
                {crash.crashType === 'native' ? (
                  <Cpu className="mr-1 h-2.5 w-2.5" />
                ) : (
                  <Coffee className="mr-1 h-2.5 w-2.5" />
                )}
                {crash.crashType === 'native' ? 'NATIVE' : 'JAVA'}
              </Badge>
              {crash.signal && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 font-mono border-red-500/30 text-red-600 dark:text-red-400"
                >
                  {crash.signal}
                </Badge>
              )}
              {crash.exceptionClass && (
                <span className="text-xs font-mono text-red-600 dark:text-red-400 truncate">
                  {crash.exceptionClass}
                </span>
              )}
            </div>

            {crash.exceptionMessage && (
              <p className="text-xs text-red-700 dark:text-red-300 font-mono break-all line-clamp-2">
                {crash.exceptionMessage}
              </p>
            )}

            {crash.crashType === 'native' && crash.backtrace && crash.backtrace.length > 0 && (
              <div className="text-[11px] font-mono text-muted-foreground space-y-0.5">
                {crash.backtrace.slice(0, 3).map((frame, i) => (
                  <div key={i} className="truncate">
                    <span className="text-muted-foreground/60">#{i}</span> {frame}
                  </div>
                ))}
                {crash.backtrace.length > 3 && (
                  <div className="text-muted-foreground/60">
                    ... {crash.backtrace.length - 3} more frames
                  </div>
                )}
              </div>
            )}

            {crash.crashType === 'java' && crash.javaStackTrace && (
              <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all line-clamp-4 leading-4">
                {crash.javaStackTrace}
              </pre>
            )}
          </div>
        )}

        {showReattach && (
          <p className="text-xs text-muted-foreground">
            The app process has terminated. You can reattach to restart the session.
          </p>
        )}

        <DialogFooter>
          {crash && (
            <Button variant="outline" size="sm" onClick={handleViewCrashes} disabled={reattaching}>
              <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              View in Crashes
            </Button>
          )}
          {showReattach && (
            <Button size="sm" onClick={handleReattach} disabled={reattaching}>
              <RotateCcw className={cn('mr-1.5 h-3.5 w-3.5', reattaching && 'animate-spin')} />
              {reattaching ? 'Reattaching...' : 'Reattach'}
            </Button>
          )}
          {!showReattach && (
            <Button variant="outline" size="sm" onClick={handleDismiss}>
              Dismiss
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

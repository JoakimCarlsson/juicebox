import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Play } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { appSessionsQueryOptions } from "@/features/sessions/queries"
import { attachApp, renameSession } from "@/features/sessions/api"
import { formatRelativeTime } from "@/lib/time"
import type { App } from "@/types/device"

interface SessionPickerDialogProps {
  app: App | null
  deviceId: string
  onClose: () => void
}

export function SessionPickerDialog({ app, deviceId, onClose }: SessionPickerDialogProps) {
  const navigate = useNavigate()
  const [attaching, setAttaching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")

  const { data, isLoading } = useQuery({
    ...appSessionsQueryOptions(deviceId, app?.identifier ?? ""),
    enabled: !!app,
  })

  const sessions = data?.sessions ?? []

  async function handleNewSession() {
    if (attaching || !app) return
    setAttaching(true)
    setError(null)
    try {
      const resp = await attachApp(deviceId, app.identifier)
      if (name.trim()) {
        await renameSession(resp.sessionId, name.trim())
      }
      onClose()
      setName("")
      await navigate({
        to: "/devices/$deviceId/app/$bundleId/home",
        params: { deviceId, bundleId: app.identifier },
        search: { sessionId: resp.sessionId },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach")
      setAttaching(false)
    }
  }

  async function handleRestore(sessionId: string) {
    if (attaching || !app) return
    setAttaching(true)
    setError(null)
    try {
      const resp = await attachApp(deviceId, app.identifier, sessionId)
      onClose()
      await navigate({
        to: "/devices/$deviceId/app/$bundleId/home",
        params: { deviceId, bundleId: app.identifier },
        search: { sessionId: resp.sessionId },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach")
      setAttaching(false)
    }
  }

  return (
    <Dialog
      open={!!app}
      onOpenChange={(open) => {
        if (!open && !attaching) {
          setName("")
          onClose()
        }
      }}
    >
      <DialogContent showCloseButton={!attaching}>
        {app && (
          <>
            <DialogHeader>
              <DialogTitle>{app.name}</DialogTitle>
              <DialogDescription className="font-mono">
                {app.identifier}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Session name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNewSession()
                }}
                disabled={attaching}
                className="h-9 text-sm"
              />
              <Button onClick={handleNewSession} disabled={attaching} className="shrink-0">
                <Play className="mr-1.5 h-3.5 w-3.5" />
                New Session
              </Button>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {sessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Past Sessions
                </p>
                <ScrollArea className="max-h-64">
                  <div className="space-y-px">
                    {sessions.map((session) => (
                      <Button
                        key={session.id}
                        variant="ghost"
                        onClick={() => handleRestore(session.id)}
                        disabled={attaching}
                        className="flex w-full items-center justify-between h-auto px-3 py-2.5"
                      >
                        <span className="text-sm text-foreground">
                          {session.name || "Untitled"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(session.startedAt)}
                        </span>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {isLoading && (
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

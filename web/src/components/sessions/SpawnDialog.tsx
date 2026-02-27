import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { spawnApp } from '@/features/devices/api'
import { renameSession } from '@/features/sessions/api'
import type { App } from '@/types/device'
import type { EvasionConfig } from '@/types/session'

interface SpawnDialogProps {
  app: App | null
  deviceId: string
  onClose: () => void
}

export function SpawnDialog({ app, deviceId, onClose }: SpawnDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [spawning, setSpawning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [evasion, setEvasion] = useState<EvasionConfig>({
    frida_bypass: true,
    root_bypass: true,
    emulator_bypass: true,
  })

  async function handleSpawn() {
    if (spawning || !app) return
    setSpawning(true)
    setError(null)
    try {
      const resp = await spawnApp(deviceId, app.identifier, evasion)
      if (name.trim()) {
        await renameSession(resp.sessionId, name.trim())
      }
      await queryClient.invalidateQueries({
        queryKey: ['devices', deviceId, 'sessions', app.identifier],
      })
      onClose()
      setName('')
      await navigate({
        to: '/devices/$deviceId/app/$bundleId/home',
        params: { deviceId, bundleId: app.identifier },
        search: { sessionId: resp.sessionId },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to spawn')
      setSpawning(false)
    }
  }

  return (
    <Dialog
      open={!!app}
      onOpenChange={(open) => {
        if (!open && !spawning) {
          setName('')
          setError(null)
          onClose()
        }
      }}
    >
      <DialogContent showCloseButton={!spawning}>
        {app && (
          <>
            <DialogHeader>
              <DialogTitle>{app.name}</DialogTitle>
              <DialogDescription className="font-mono">{app.identifier}</DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Session name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSpawn()
                }}
                disabled={spawning}
                className="h-9 text-sm"
              />
              <Button onClick={handleSpawn} disabled={spawning} className="shrink-0">
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Spawn
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Evasion
              </p>
              <div className="space-y-2">
                {(
                  [
                    { key: 'frida_bypass' as const, label: 'Frida bypass' },
                    { key: 'root_bypass' as const, label: 'Root bypass' },
                    { key: 'emulator_bypass' as const, label: 'Emulator bypass' },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{label}</span>
                    <Switch
                      checked={evasion[key] ?? true}
                      onCheckedChange={(v) => setEvasion((prev) => ({ ...prev, [key]: v }))}
                      disabled={spawning}
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

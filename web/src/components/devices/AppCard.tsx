import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Loader2, Play, X } from 'lucide-react'
import type { App } from '@/types/device'
import type { EvasionConfig } from '@/types/session'
import { cn } from '@/lib/utils'

const colors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
]

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const evasionToggles = [
  { key: 'frida_bypass' as const, label: 'Frida bypass' },
  { key: 'root_bypass' as const, label: 'Root bypass' },
  { key: 'emulator_bypass' as const, label: 'Emulator bypass' },
  { key: 'ssl_bypass' as const, label: 'SSL bypass' },
  { key: 'crash_handler' as const, label: 'Crash handler' },
] as const

const defaultEvasion: EvasionConfig = {
  frida_bypass: true,
  root_bypass: true,
  emulator_bypass: true,
  ssl_bypass: true,
  crash_handler: true,
}

interface AppCardProps {
  app: App
  deviceId: string
  isAttached: boolean
  isAttaching: boolean
  onAttach: (app: App, evasion: EvasionConfig) => void
  onDetach: (app: App) => void
}

export function AppCard({
  app,
  deviceId,
  isAttached,
  isAttaching,
  onAttach,
  onDetach,
}: AppCardProps) {
  const [imgError, setImgError] = useState(false)
  const [open, setOpen] = useState(false)
  const [evasion, setEvasion] = useState<EvasionConfig>(defaultEvasion)
  const initial = app.name.charAt(0).toUpperCase()
  const isRunning = app.pid > 0
  const iconUrl = `/api/v1/devices/${deviceId}/icon/${app.identifier}`

  function handleCardClick() {
    if (isAttaching) return
    if (isAttached) {
      onAttach(app, evasion)
      return
    }
    setOpen(true)
  }

  function handleAttach() {
    setOpen(false)
    onAttach(app, evasion)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          onClick={handleCardClick}
          className={cn(
            'group relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border bg-card p-4',
            'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
            isAttached ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border',
            isAttaching && 'opacity-70 pointer-events-none'
          )}
        >
          {isAttached && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDetach(app)
              }}
              className="absolute top-1.5 right-1.5 flex items-center justify-center h-5 w-5 rounded-full bg-muted/80 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors opacity-0 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          )}

          <div className="relative">
            {imgError ? (
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl text-lg font-semibold text-white',
                  hashColor(app.identifier)
                )}
              >
                {initial}
              </div>
            ) : (
              <img
                src={iconUrl}
                alt={app.name}
                className="h-12 w-12 rounded-xl"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            )}
            {isAttaching && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>

          <div className="flex w-full flex-col items-center gap-1 text-center">
            <span className="line-clamp-1 text-sm font-medium text-foreground">{app.name}</span>
            <span className="line-clamp-1 w-full text-xs text-muted-foreground">{app.identifier}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {isRunning && (
              <Badge
                variant="secondary"
                className="bg-green-500/15 text-green-600 dark:text-green-400 text-xs"
              >
                PID {app.pid}
              </Badge>
            )}
            {isAttached && (
              <Badge variant="secondary" className="bg-primary/15 text-primary text-xs">
                Attached
              </Badge>
            )}
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-56">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Evasion
          </p>
          <div className="space-y-2">
            {evasionToggles.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{label}</span>
                <Switch
                  checked={evasion[key] ?? true}
                  onCheckedChange={(v) => setEvasion((prev) => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
          </div>
          <Button onClick={handleAttach} className="w-full" size="sm">
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Attach
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

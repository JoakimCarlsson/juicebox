import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import type { App } from '@/types/device'
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

interface AppCardProps {
  app: App
  deviceId: string
  isAttached: boolean
  isAttaching: boolean
  onAttach: (app: App) => void
}

export function AppCard({ app, deviceId, isAttached, isAttaching, onAttach }: AppCardProps) {
  const [imgError, setImgError] = useState(false)
  const initial = app.name.charAt(0).toUpperCase()
  const isRunning = app.pid > 0
  const iconUrl = `/api/v1/devices/${deviceId}/icon/${app.identifier}`

  return (
    <div
      onClick={() => !isAttaching && onAttach(app)}
      className={cn(
        'group flex cursor-pointer flex-col items-center gap-2 rounded-lg border bg-card p-4',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        isAttached
          ? 'border-primary/50 ring-1 ring-primary/20'
          : 'border-border',
        isAttaching && 'opacity-70 pointer-events-none'
      )}
    >
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
          <Badge
            variant="secondary"
            className="bg-primary/15 text-primary text-xs"
          >
            Attached
          </Badge>
        )}
      </div>
    </div>
  )
}

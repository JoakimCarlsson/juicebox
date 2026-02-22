import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import type { App } from "@/types/device"
import { cn } from "@/lib/utils"

const colors = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500",
  "bg-lime-500", "bg-green-500", "bg-emerald-500", "bg-teal-500",
  "bg-cyan-500", "bg-sky-500", "bg-blue-500", "bg-indigo-500",
  "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500",
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
}

export function AppCard({ app, deviceId }: AppCardProps) {
  const [imgError, setImgError] = useState(false)
  const navigate = useNavigate()
  const initial = app.name.charAt(0).toUpperCase()
  const isRunning = app.pid > 0
  const iconUrl = `/api/v1/devices/${deviceId}/icon/${app.identifier}`

  function handleClick() {
    navigate({
      to: "/devices/$deviceId/app/$bundleId",
      params: { deviceId, bundleId: app.identifier },
      search: { sessionId: "", historicalSessionId: "" },
    })
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-border bg-card p-4",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      {imgError ? (
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl text-lg font-semibold text-white",
            hashColor(app.identifier),
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

      <div className="flex w-full flex-col items-center gap-1 text-center">
        <span className="line-clamp-1 text-sm font-medium text-foreground">
          {app.name}
        </span>
        <span className="line-clamp-1 w-full text-xs text-muted-foreground">
          {app.identifier}
        </span>
      </div>

      {isRunning && (
        <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400 text-xs">
          PID {app.pid}
        </Badge>
      )}
    </div>
  )
}

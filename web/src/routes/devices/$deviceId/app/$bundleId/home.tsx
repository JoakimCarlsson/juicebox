import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Play, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { appSessionsQueryOptions } from "@/features/sessions/queries"
import { attachApp } from "@/features/sessions/api"
import { formatRelativeTime } from "@/lib/time"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/home",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
    historicalSessionId: (search.historicalSessionId as string) ?? "",
  }),
  component: HomePage,
})

function HomePage() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/app/$bundleId/home",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/home",
  })
  const navigate = useNavigate()
  const { data } = useQuery(appSessionsQueryOptions(deviceId, bundleId))
  const [attaching, setAttaching] = useState(false)

  const sessions = data?.sessions ?? []
  const hasActiveSession = !!sessionId

  async function handleNewSession() {
    if (attaching) return
    setAttaching(true)
    try {
      const resp = await attachApp(deviceId, bundleId)
      await navigate({
        to: "/devices/$deviceId/app/$bundleId/network",
        params: { deviceId, bundleId },
        search: { sessionId: resp.sessionId, historicalSessionId: "" },
      })
    } catch (err) {
      console.error("Failed to attach:", err)
      setAttaching(false)
    }
  }

  async function handleRestore(oldSessionId: string) {
    if (attaching) return
    setAttaching(true)
    try {
      const resp = await attachApp(deviceId, bundleId)
      await navigate({
        to: "/devices/$deviceId/app/$bundleId/network",
        params: { deviceId, bundleId },
        search: { sessionId: resp.sessionId, historicalSessionId: oldSessionId },
      })
    } catch (err) {
      console.error("Failed to attach:", err)
      setAttaching(false)
    }
  }

  const cards = [
    ...(!hasActiveSession
      ? [
          {
            label: "New Session",
            description: "Attach and start capturing traffic",
            icon: Play,
            onClick: handleNewSession,
          },
        ]
      : []),
    ...sessions.map((session) => ({
      label: "Restore Session",
      description: formatRelativeTime(session.startedAt),
      icon: RotateCcw,
      onClick: () => handleRestore(session.id),
    })),
  ]

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-auto p-6">
      <div className="w-full max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card, i) => (
            <button
              key={`${card.label}-${i}`}
              onClick={card.onClick}
              disabled={attaching}
              className={cn(
                "flex items-center gap-3.5 rounded-lg border border-border bg-card px-4 py-3.5 text-left transition-colors",
                attaching
                  ? "cursor-not-allowed opacity-40"
                  : "cursor-pointer hover:bg-muted/50",
              )}
            >
              <card.icon className="h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{card.label}</div>
                <div className="text-xs text-muted-foreground truncate">{card.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

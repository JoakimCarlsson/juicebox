import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { History } from "lucide-react"
import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { sessionsQueryOptions } from "@/features/sessions/queries"
import { attachApp } from "@/features/sessions/api"
import { formatRelativeTime } from "@/lib/time"

export const Route = createFileRoute("/devices/$deviceId/sessions")({
  component: SessionsPage,
})

function SessionsPage() {
  const { deviceId } = useParams({ from: "/devices/$deviceId/sessions" })
  const navigate = useNavigate()
  const { data, isLoading } = useQuery(sessionsQueryOptions(deviceId))
  const [attaching, setAttaching] = useState<string | null>(null)

  const sessions = data?.sessions ?? []

  async function handleRestore(sessionId: string, bundleId: string) {
    if (attaching) return
    setAttaching(sessionId)
    try {
      const resp = await attachApp(deviceId, bundleId, sessionId)
      await navigate({
        to: "/devices/$deviceId/app/$bundleId/network",
        params: { deviceId, bundleId },
        search: { sessionId: resp.sessionId },
      })
    } catch (err) {
      console.error("Failed to restore session:", err)
      setAttaching(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
        <Tabs value="sessions">
          <TabsList>
            <TabsTrigger value="apps" asChild>
              <Link to="/devices/$deviceId/apps" params={{ deviceId }}>
                Apps
              </Link>
            </TabsTrigger>
            <TabsTrigger value="processes" asChild>
              <Link to="/devices/$deviceId/processes" params={{ deviceId }}>
                Processes
              </Link>
            </TabsTrigger>
            <TabsTrigger value="sessions" asChild>
              <Link to="/devices/$deviceId/sessions" params={{ deviceId }}>
                Sessions
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col overflow-auto p-6">
        {isLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <History className="h-8 w-8 opacity-30" />
            <p className="text-sm">No captured sessions yet</p>
            <p className="text-xs">Attach to an app to start capturing traffic</p>
          </div>
        ) : (
          <div className="space-y-px">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleRestore(session.id, session.bundleId)}
                disabled={!!attaching}
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    {session.name || session.bundleId}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {session.bundleId}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(session.startedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { History } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { sessionsQueryOptions } from "@/features/sessions/queries"

export const Route = createFileRoute("/devices/$deviceId/sessions")({
  component: SessionsPage,
})

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function SessionsPage() {
  const { deviceId } = useParams({ from: "/devices/$deviceId/sessions" })
  const navigate = useNavigate()
  const { data, isLoading } = useQuery(sessionsQueryOptions(deviceId))

  const sessions = data?.sessions ?? []

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
                onClick={() =>
                  navigate({
                    to: "/devices/$deviceId/session/$bundleId",
                    params: { deviceId, bundleId: session.bundleId },
                    search: { sessionId: session.id },
                  })
                }
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-mono text-foreground">
                  {session.bundleId}
                </span>
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

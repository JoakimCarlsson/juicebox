import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SessionStatusReporter } from "@/components/layout/SessionStatusReporter"
import { detachSession } from "@/features/sessions/api"
import { SessionMessageProvider } from "@/contexts/SessionMessageContext"
import { sessionsQueryOptions } from "@/features/sessions/queries"
import { ArrowLeft, Unplug, Globe, FileText, Code } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/devices/$deviceId/session/$bundleId",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: SessionLayout,
})

const tabs = [
  { value: "network", label: "Network", icon: Globe, enabled: true, to: "/devices/$deviceId/session/$bundleId/network" as const },
  { value: "logs", label: "Logs", icon: FileText, enabled: true, to: "/devices/$deviceId/session/$bundleId/logs" as const },
  { value: "hooks", label: "Hooks", icon: Code, enabled: false, to: "/devices/$deviceId/session/$bundleId/network" as const },
]

function SessionLayout() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/session/$bundleId",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/session/$bundleId",
  })
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = location.pathname.split("/").pop() || "network"
  const [detaching, setDetaching] = useState(false)

  const { data: sessionsData } = useQuery(sessionsQueryOptions(deviceId))
  const session = sessionsData?.sessions.find((s) => s.id === sessionId)
  const isEnded = session?.endedAt != null

  async function handleDetach() {
    if (!sessionId || detaching) return
    setDetaching(true)
    try {
      await detachSession(sessionId)
    } catch {}
    navigate({
      to: "/devices/$deviceId/apps",
      params: { deviceId },
    })
  }

  function handleBack() {
    navigate(
      isEnded
        ? { to: "/devices/$deviceId/sessions", params: { deviceId } }
        : { to: "/devices/$deviceId/apps", params: { deviceId } },
    )
  }

  return (
    <SessionMessageProvider sessionId={sessionId}>
    <div className="flex h-full flex-col">
      {!isEnded && <SessionStatusReporter sessionId={sessionId} bundleId={bundleId} />}

      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleBack}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-semibold text-foreground">
              {bundleId}
            </span>
            {isEnded ? (
              <Badge variant="secondary" className="text-xs">
                Ended
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="bg-green-500/15 text-green-600 dark:text-green-400 text-xs"
              >
                Attached
              </Badge>
            )}
          </div>
          {!isEnded && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDetach}
              disabled={detaching}
            >
              <Unplug className="mr-1.5 h-3.5 w-3.5" />
              Detach
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center border-b border-border px-2 h-9">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.value === activeTab
          return (
            <Link
              key={tab.value}
              to={tab.enabled ? tab.to : undefined!}
              params={{ deviceId, bundleId }}
              search={{ sessionId }}
              className={cn(
                "flex items-center h-9 px-3 text-xs transition-colors",
                "border-b-2 border-transparent",
                tab.enabled
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/50 cursor-default",
                isActive && "border-foreground text-foreground",
              )}
              onClick={(e) => {
                if (!tab.enabled) e.preventDefault()
              }}
            >
              <Icon className="mr-1.5 h-3 w-3" />
              {tab.label}
            </Link>
          )
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
    </SessionMessageProvider>
  )
}

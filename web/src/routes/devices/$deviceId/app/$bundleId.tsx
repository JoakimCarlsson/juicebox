import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { SessionStatusReporter } from "@/components/layout/SessionStatusReporter"
import { detachSession } from "@/features/sessions/api"
import { SessionMessageProvider } from "@/contexts/SessionMessageContext"
import { ArrowLeft, Unplug, Home, Globe, FileText, Code } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
    historicalSessionId: (search.historicalSessionId as string) ?? "",
  }),
  component: AppLayout,
})

const tabs = [
  { value: "home", label: "Home", icon: Home, enabled: true, to: "/devices/$deviceId/app/$bundleId/home" as const },
  { value: "network", label: "Network", icon: Globe, enabled: true, to: "/devices/$deviceId/app/$bundleId/network" as const },
  { value: "logs", label: "Logs", icon: FileText, enabled: true, to: "/devices/$deviceId/app/$bundleId/logs" as const },
  { value: "hooks", label: "Hooks", icon: Code, enabled: false, to: "/devices/$deviceId/app/$bundleId/network" as const },
]

function AppLayout() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/app/$bundleId",
  })
  const { sessionId, historicalSessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId",
  })
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = location.pathname.split("/").pop() || "home"
  const [detaching, setDetaching] = useState(false)

  async function handleDetach() {
    if (!sessionId || detaching) return
    setDetaching(true)
    try {
      await detachSession(sessionId)
    } catch {}
    setDetaching(false)
    navigate({
      to: "/devices/$deviceId/app/$bundleId/home",
      params: { deviceId, bundleId },
      search: { sessionId: "", historicalSessionId: "" },
    })
  }

  return (
    <SessionMessageProvider sessionId={sessionId} historicalSessionId={historicalSessionId}>
    <div className="flex h-full flex-col">
      {sessionId && <SessionStatusReporter sessionId={sessionId} bundleId={bundleId} />}

      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                navigate({
                  to: "/devices/$deviceId/apps",
                  params: { deviceId },
                })
              }
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-semibold text-foreground">
              {bundleId}
            </span>
          </div>
          {sessionId && (
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
              search={{ sessionId, historicalSessionId }}
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

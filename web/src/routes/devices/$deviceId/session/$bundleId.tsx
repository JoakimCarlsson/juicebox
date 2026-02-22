import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SessionStatusReporter } from "@/components/layout/SessionStatusReporter"
import { detachSession } from "@/features/sessions/api"
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
  { value: "network", label: "Network", icon: Globe, enabled: true },
  { value: "logs", label: "Logs", icon: FileText, enabled: false },
  { value: "hooks", label: "Hooks", icon: Code, enabled: false },
]

function SessionLayout() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/session/$bundleId",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/session/$bundleId",
  })
  const navigate = useNavigate()
  const [detaching, setDetaching] = useState(false)

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

  return (
    <div className="flex h-full flex-col">
      <SessionStatusReporter sessionId={sessionId} bundleId={bundleId} />

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
            <Badge
              variant="secondary"
              className="bg-green-500/15 text-green-600 dark:text-green-400 text-xs"
            >
              Attached
            </Badge>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDetach}
            disabled={detaching}
          >
            <Unplug className="mr-1.5 h-3.5 w-3.5" />
            Detach
          </Button>
        </div>
      </div>

      <div className="flex items-center border-b border-border px-2 h-9">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.value === "network"
          return (
            <Link
              key={tab.value}
              to={
                tab.enabled
                  ? `/devices/$deviceId/session/$bundleId/${tab.value}`
                  : undefined
              }
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
  )
}

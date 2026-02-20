import {
  createFileRoute,
  Link,
  Outlet,
  useMatchRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { detachSession } from "@/features/sessions/api"
import { ArrowLeft, Unplug } from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute(
  "/devices/$deviceId/session/$bundleId",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: SessionLayout,
})

function SessionLayout() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/session/$bundleId",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/session/$bundleId",
  })
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const [detaching, setDetaching] = useState(false)

  const isNetwork = matchRoute({
    to: "/devices/$deviceId/session/$bundleId/network",
    params: { deviceId, bundleId },
  })
  const activeTab = isNetwork ? "network" : "network"

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
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                navigate({
                  to: "/devices/$deviceId/apps",
                  params: { deviceId },
                })
              }
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {bundleId}
              </h1>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="bg-green-500/15 text-green-600 dark:text-green-400 text-xs"
                >
                  Attached
                </Badge>
              </div>
            </div>
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

        <div className="mt-3">
          <Tabs value={activeTab}>
            <TabsList>
              <TabsTrigger value="network" asChild>
                <Link
                  to="/devices/$deviceId/session/$bundleId/network"
                  params={{ deviceId, bundleId }}
                  search={{ sessionId }}
                >
                  Network
                </Link>
              </TabsTrigger>
              <TabsTrigger value="console" disabled>
                Console
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}

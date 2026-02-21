import { createFileRoute, Link, Outlet, useMatchRoute, useParams } from "@tanstack/react-router"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const Route = createFileRoute("/devices/$deviceId")({
  component: DeviceLayout,
})

function DeviceLayout() {
  const { deviceId } = useParams({ from: "/devices/$deviceId" })
  const matchRoute = useMatchRoute()
  const isProcesses = matchRoute({ to: "/devices/$deviceId/processes", params: { deviceId } })
  const activeTab = isProcesses ? "processes" : "apps"

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
        <Tabs value={activeTab}>
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
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}

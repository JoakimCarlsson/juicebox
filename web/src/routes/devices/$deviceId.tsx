import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { deviceInfoQueryOptions } from "@/features/devices/queries"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/devices/$deviceId")({
  component: DeviceLayout,
})

function DeviceLayout() {
  const { deviceId } = useParams({ from: "/devices/$deviceId" })
  const { data: info, isLoading } = useQuery(deviceInfoQueryOptions(deviceId))

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : info ? (
          <div>
            <h1 className="text-lg font-semibold text-foreground">{info.name}</h1>
            <p className="text-sm text-muted-foreground">
              {info.platform} &middot; {info.arch}
              {info.os && typeof info.os === "object" && "version" in info.os
                ? ` \u00B7 Android ${info.os.version}`
                : ""}
            </p>
          </div>
        ) : null}

        <div className="mt-3">
          <Tabs value="apps">
            <TabsList>
              <TabsTrigger value="apps" asChild>
                <Link to="/devices/$deviceId/apps" params={{ deviceId }}>
                  Apps
                </Link>
              </TabsTrigger>
              <TabsTrigger value="processes" disabled>
                Processes
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

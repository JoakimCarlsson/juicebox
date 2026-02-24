import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { DeviceSocketProvider } from "@/contexts/DeviceSocketContext"
import { EventLogProvider } from "@/contexts/EventLogContext"
import { BottomPanelProvider } from "@/contexts/BottomPanelContext"
import { ScriptOutputProvider } from "@/contexts/ScriptOutputContext"
import { StatusReporter } from "@/components/layout/StatusReporter"
import { deviceInfoQueryOptions } from "@/features/devices/queries"

export const Route = createFileRoute("/devices/$deviceId")({
  component: DeviceLayout,
})

function DeviceLayout() {
  const { deviceId } = Route.useParams()
  const { data: info } = useQuery(deviceInfoQueryOptions(deviceId))
  const deviceName = info?.name ?? deviceId

  return (
    <DeviceSocketProvider deviceId={deviceId}>
      <StatusReporter deviceId={deviceId} deviceName={deviceName} />
      <EventLogProvider>
        <ScriptOutputProvider>
          <BottomPanelProvider>
            <Outlet />
          </BottomPanelProvider>
        </ScriptOutputProvider>
      </EventLogProvider>
    </DeviceSocketProvider>
  )
}

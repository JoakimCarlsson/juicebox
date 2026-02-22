import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { DeviceSocketProvider } from "@/contexts/DeviceSocketContext"
import { EventLogProvider } from "@/contexts/EventLogContext"
import { BottomPanelProvider, useBottomPanel } from "@/contexts/BottomPanelContext"
import { StatusReporter } from "@/components/layout/StatusReporter"
import { BottomPanel } from "@/components/layout/BottomPanel"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
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
        <BottomPanelProvider>
          <DeviceLayoutInner />
        </BottomPanelProvider>
      </EventLogProvider>
    </DeviceSocketProvider>
  )
}

function DeviceLayoutInner() {
  const { panelRef } = useBottomPanel()

  return (
    <ResizablePanelGroup
      orientation="vertical"
      className="h-full"
    >
      <ResizablePanel defaultSize={75} minSize={30}>
        <div className="h-full overflow-auto">
          <Outlet />
        </div>
      </ResizablePanel>
      <ResizableHandle className="w-full h-px after:inset-x-0 after:-top-1 after:-bottom-1 after:inset-y-auto" />
      <ResizablePanel
        panelRef={panelRef}
        defaultSize={25}
        minSize={10}
        collapsible
        collapsedSize={0}
      >
        <BottomPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

import { createFileRoute, Outlet } from "@tanstack/react-router"
import { DeviceSocketProvider } from "@/contexts/DeviceSocketContext"

export const Route = createFileRoute("/devices/$deviceId")({
  component: DeviceLayout,
})

function DeviceLayout() {
  const { deviceId } = Route.useParams()
  return (
    <DeviceSocketProvider deviceId={deviceId}>
      <Outlet />
    </DeviceSocketProvider>
  )
}

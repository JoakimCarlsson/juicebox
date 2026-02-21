import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/devices/$deviceId")({
  component: DeviceLayout,
})

function DeviceLayout() {
  return <Outlet />
}

import { createFileRoute, Navigate, useParams } from "@tanstack/react-router"

export const Route = createFileRoute("/devices/$deviceId/")({
  component: DeviceIndex,
})

function DeviceIndex() {
  const { deviceId } = useParams({ from: "/devices/$deviceId/" })
  return <Navigate to="/devices/$deviceId/apps" params={{ deviceId }} />
}

import { createFileRoute, Navigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { devicesQueryOptions } from "@/features/devices/queries"
import { Smartphone } from "lucide-react"

export const Route = createFileRoute("/")({
  component: IndexPage,
})

function IndexPage() {
  const { data: devices, isLoading } = useQuery(devicesQueryOptions())

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading devices...</div>
      </div>
    )
  }

  if (devices && devices.length > 0) {
    return <Navigate to="/devices/$deviceId" params={{ deviceId: devices[0].id }} />
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <Smartphone className="h-12 w-12 text-muted-foreground/50" />
      <h2 className="text-xl font-semibold text-foreground">No devices connected</h2>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Connect an Android device or start an emulator to get started.
      </p>
    </div>
  )
}

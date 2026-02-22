import { useNavigate, useParams } from "@tanstack/react-router"
import { Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function NoSessionEmptyState() {
  const { deviceId, bundleId } = useParams({ strict: false })
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full text-muted-foreground">
      <p className="text-sm font-medium">No active session</p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            navigate({
              to: "/devices/$deviceId/app/$bundleId/home",
              params: { deviceId: deviceId!, bundleId: bundleId! },
              search: { sessionId: "", historicalSessionId: "" },
            })
          }
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          New Session
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate({
              to: "/devices/$deviceId/app/$bundleId/home",
              params: { deviceId: deviceId!, bundleId: bundleId! },
              search: { sessionId: "", historicalSessionId: "" },
            })
          }
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Restore Session
        </Button>
      </div>
    </div>
  )
}

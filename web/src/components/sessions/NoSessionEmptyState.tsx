import { useNavigate, useParams } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export function NoSessionEmptyState() {
  const { deviceId } = useParams({ strict: false })
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full text-muted-foreground">
      <p className="text-sm font-medium">No active session</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          navigate({
            to: "/devices/$deviceId/apps",
            params: { deviceId: deviceId! },
          })
        }
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Back to Apps
      </Button>
    </div>
  )
}

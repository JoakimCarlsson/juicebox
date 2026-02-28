import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Puzzle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NoAppAttachedState({ feature }: { feature: string }) {
  const { deviceId } = useParams({ strict: false })
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full text-muted-foreground">
      <Puzzle className="h-8 w-8 opacity-30" />
      <p className="text-sm font-medium">Attach to an app to use {feature}</p>
      <p className="text-xs opacity-60">Select an app from the Apps tab to attach Frida</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          navigate({
            to: '/devices/$deviceId/apps',
            params: { deviceId: deviceId! },
          })
        }
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Go to Apps
      </Button>
    </div>
  )
}

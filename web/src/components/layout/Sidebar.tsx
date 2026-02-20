import { Link, useParams } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { devicesQueryOptions } from "@/features/devices/queries"
import { cn } from "@/lib/utils"

export function Sidebar() {
  const { deviceId } = useParams({ strict: false })
  const queryClient = useQueryClient()
  const { data: devices, isLoading, isRefetching } = useQuery(devicesQueryOptions())

  return (
    <div className="flex h-screen w-60 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
          Juicebox
        </span>
      </div>

      <Separator />

      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Devices {devices ? `(${devices.length})` : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["devices"] })}
        >
          <RefreshCw
            className={cn("h-3 w-3", isRefetching && "animate-spin")}
          />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : devices?.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">
            No devices connected
          </div>
        ) : (
          <div className="space-y-1 py-1">
            {devices?.map((device) => (
              <Link
                key={device.id}
                to="/devices/$deviceId"
                params={{ deviceId: device.id }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  deviceId === device.id &&
                    "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                )}
              >
                <Smartphone className="h-4 w-4 shrink-0" />
                <span className="truncate">{device.name}</span>
              </Link>
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
    </div>
  )
}

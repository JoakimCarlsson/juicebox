import { useAppStatus } from "@/contexts/AppStatusContext"
import { cn } from "@/lib/utils"

export function StatusBar() {
  const { status } = useAppStatus()

  return (
    <div className="flex h-6 items-center border-t border-border bg-sidebar px-3 text-[11px] shrink-0 select-none gap-0">
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            status.connected
              ? "bg-green-500"
              : status.deviceId
                ? "bg-red-500"
                : "bg-muted-foreground/40",
          )}
        />
        <span className="text-muted-foreground">
          {status.connected
            ? "Connected"
            : status.deviceId
              ? "Disconnected"
              : "No device"}
        </span>
      </div>

      {status.deviceName && (
        <>
          <div className="mx-2 h-3 w-px bg-border" />
          <span className="text-muted-foreground">{status.deviceName}</span>
        </>
      )}

      {status.bundleId && (
        <>
          <div className="mx-2 h-3 w-px bg-border" />
          <span className="font-mono text-foreground">{status.bundleId}</span>
        </>
      )}

      <div className="ml-auto flex items-center gap-3" />
    </div>
  )
}

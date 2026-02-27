import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Smartphone, RefreshCw, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { devicesQueryOptions, deviceInfoQueryOptions } from '@/features/devices/queries'
import { connectDevice } from '@/features/devices/api'
import { cn } from '@/lib/utils'
import type { Device } from '@/types/device'

export const Route = createFileRoute('/')({
  component: DevicesPage,
})

function DeviceCard({ device }: { device: Device }) {
  const navigate = useNavigate()
  const { data: info } = useQuery(deviceInfoQueryOptions(device.id))
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const platformLabel =
    info?.platform === 'ios' ? 'iOS' : info?.platform === 'android' ? 'Android' : info?.platform
  const osVersion =
    info?.os && typeof info.os === 'object' && 'version' in info.os ? String(info.os.version) : null
  const subtitle = info
    ? [platformLabel, info.arch, osVersion].filter(Boolean).join(' \u00B7 ')
    : null

  async function handleConnect() {
    if (connecting) return
    setConnecting(true)
    setError(null)
    try {
      await connectDevice(device.id)
      await navigate({
        to: '/devices/$deviceId',
        params: { deviceId: device.id },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setConnecting(false)
    }
  }

  return (
    <div
      onClick={handleConnect}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-border bg-card p-6',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        connecting && 'pointer-events-none opacity-70'
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        {connecting ? (
          <Loader2 className="h-7 w-7 text-primary animate-spin" />
        ) : (
          <Smartphone className="h-7 w-7 text-primary" />
        )}
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-sm font-semibold text-foreground">{device.name}</span>
        {subtitle ? (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        ) : (
          <span className="text-xs text-muted-foreground capitalize">{device.type}</span>
        )}
      </div>

      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

function DevicesPage() {
  const queryClient = useQueryClient()
  const { data: devices, isLoading, isRefetching } = useQuery(devicesQueryOptions())

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight text-foreground">Juicebox</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['devices'] })}
          >
            <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
          </Button>
          <ThemeToggle />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : !devices || devices.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Smartphone className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">No devices connected</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Connect a device via USB or start an emulator to get started.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['devices'] })}
            >
              <RefreshCw className={cn('mr-2 h-3.5 w-3.5', isRefetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

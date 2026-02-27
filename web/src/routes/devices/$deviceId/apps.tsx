import { createFileRoute, Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Search, Unplug } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppCard } from '@/components/devices/AppCard'
import { SpawnDialog } from '@/components/sessions/SpawnDialog'
import { appsQueryOptions, deviceInfoQueryOptions } from '@/features/devices/queries'
import { disconnectDevice } from '@/features/devices/api'
import type { App } from '@/types/device'

export const Route = createFileRoute('/devices/$deviceId/apps')({
  component: AppsPage,
})

function AppsPage() {
  const { deviceId } = useParams({ from: '/devices/$deviceId/apps' })
  const navigate = useNavigate()
  const { data: apps, isLoading } = useQuery(appsQueryOptions(deviceId))
  const { data: info } = useQuery(deviceInfoQueryOptions(deviceId))
  const [search, setSearch] = useState('')
  const [selectedApp, setSelectedApp] = useState<App | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const filtered = useMemo(() => {
    if (!apps) return []
    if (!search.trim()) return apps
    const q = search.toLowerCase()
    return apps.filter(
      (app) => app.name.toLowerCase().includes(q) || app.identifier.toLowerCase().includes(q)
    )
  }, [apps, search])

  async function handleDisconnect() {
    if (disconnecting) return
    setDisconnecting(true)
    try {
      await disconnectDevice(deviceId)
    } catch {}
    await navigate({ to: '/' })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <Tabs value="apps">
            <TabsList>
              <TabsTrigger value="apps" asChild>
                <Link to="/devices/$deviceId/apps" params={{ deviceId }}>
                  Apps
                </Link>
              </TabsTrigger>
              <TabsTrigger value="processes" asChild>
                <Link to="/devices/$deviceId/processes" params={{ deviceId }}>
                  Processes
                </Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {info && <span className="text-sm text-muted-foreground">{info.name}</span>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-muted-foreground hover:text-destructive"
        >
          <Unplug className="mr-1.5 h-3.5 w-3.5" />
          Disconnect
        </Button>
      </div>

      <div className="flex flex-col gap-4 overflow-auto p-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search ? 'No apps match your search' : 'No apps found on this device'}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {filtered.map((app) => (
              <AppCard
                key={app.identifier}
                app={app}
                deviceId={deviceId}
                onSelect={setSelectedApp}
              />
            ))}
          </div>
        )}
      </div>

      <SpawnDialog app={selectedApp} deviceId={deviceId} onClose={() => setSelectedApp(null)} />
    </div>
  )
}

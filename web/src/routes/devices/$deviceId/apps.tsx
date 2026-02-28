import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AppCard } from '@/components/devices/AppCard'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'
import { attachApp } from '@/features/devices/api'
import { detachSession } from '@/features/sessions/api'
import { appsQueryOptions } from '@/features/devices/queries'
import type { App } from '@/types/device'

export const Route = createFileRoute('/devices/$deviceId/apps')({
  component: AppsPage,
})

function AppsPage() {
  const { deviceId } = useParams({ from: '/devices/$deviceId/apps' })
  const { data: apps, isLoading } = useQuery(appsQueryOptions(deviceId))
  const { apps: attachedApps, addApp, removeApp, selectApp } = useAttachedApps()
  const [search, setSearch] = useState('')
  const [attachingId, setAttachingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!apps) return []
    if (!search.trim()) return apps
    const q = search.toLowerCase()
    return apps.filter(
      (app) => app.name.toLowerCase().includes(q) || app.identifier.toLowerCase().includes(q)
    )
  }, [apps, search])

  const attachedSet = useMemo(() => new Set(attachedApps.map((a) => a.bundleId)), [attachedApps])

  const handleAttach = useCallback(
    async (app: App) => {
      if (attachedSet.has(app.identifier)) {
        selectApp(app.identifier)
        return
      }

      setAttachingId(app.identifier)
      try {
        const resp = await attachApp(deviceId, app.identifier)
        addApp(app.identifier, resp.sessionId)
      } catch {
      } finally {
        setAttachingId(null)
      }
    },
    [deviceId, attachedSet, addApp, selectApp]
  )

  const handleDetach = useCallback(
    async (app: App) => {
      const attached = attachedApps.find((a) => a.bundleId === app.identifier)
      if (!attached) return
      removeApp(app.identifier)
      try {
        await detachSession(attached.sessionId)
      } catch {}
    },
    [attachedApps, removeApp]
  )

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
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
              isAttached={attachedSet.has(app.identifier)}
              isAttaching={attachingId === app.identifier}
              onAttach={handleAttach}
              onDetach={handleDetach}
            />
          ))}
        </div>
      )}
    </div>
  )
}

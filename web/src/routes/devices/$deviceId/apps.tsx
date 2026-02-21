import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppCard } from "@/components/devices/AppCard"
import { appsQueryOptions } from "@/features/devices/queries"

export const Route = createFileRoute("/devices/$deviceId/apps")({
  component: AppsPage,
})

function AppsPage() {
  const { deviceId } = useParams({ from: "/devices/$deviceId/apps" })
  const { data: apps, isLoading } = useQuery(appsQueryOptions(deviceId))
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!apps) return []
    if (!search.trim()) return apps
    const q = search.toLowerCase()
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.identifier.toLowerCase().includes(q),
    )
  }, [apps, search])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
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
          {search ? "No apps match your search" : "No apps found on this device"}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {filtered.map((app) => (
            <AppCard key={app.identifier} app={app} deviceId={deviceId} />
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

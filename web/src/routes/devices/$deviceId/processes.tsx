import { createFileRoute, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { processesQueryOptions } from "@/features/devices/queries"

export const Route = createFileRoute("/devices/$deviceId/processes")({
  component: ProcessesPage,
})

function ProcessesPage() {
  const { deviceId } = useParams({ from: "/devices/$deviceId/processes" })
  const { data: processes, isLoading } = useQuery(processesQueryOptions(deviceId))
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!processes) return []
    if (!search.trim()) return processes
    const q = search.toLowerCase()
    return processes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.pid).includes(q),
    )
  }, [processes, search])

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search processes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {search ? "No processes match your search" : "No processes found on this device"}
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-24">
                  PID
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((proc) => (
                <tr
                  key={proc.pid}
                  className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {proc.pid}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-sm text-foreground">
                    {proc.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

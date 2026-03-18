import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { ClipboardCheck, Download, Plus, Search, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'
import { fetchDeviceFindings, clearDeviceFindings } from '@/features/devices/data-api'
import { createFinding, updateFinding, deleteFinding } from '@/features/sessions/api'
import { FindingsList } from '@/components/findings/FindingsList'
import { FindingDetail } from '@/components/findings/FindingDetail'
import { FindingDialog } from '@/components/findings/FindingDialog'
import type { Finding, FindingSeverity, FindingsResponse } from '@/types/session'

export const Route = createFileRoute('/devices/$deviceId/findings')({
  component: FindingsPage,
})

function FindingsPage() {
  const { deviceId } = useParams({ strict: false }) as { deviceId: string }
  const { selectedApp } = useAttachedApps()
  const sessionId = selectedApp?.sessionId ?? null
  const queryClient = useQueryClient()

  const { data } = useQuery<FindingsResponse>({
    queryKey: ['findings', deviceId],
    queryFn: () => fetchDeviceFindings(deviceId),
    refetchInterval: 10000,
  })

  const findings = data?.findings ?? []

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return findings
    const q = search.toLowerCase()
    return findings.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.severity.includes(q) ||
        f.description.toLowerCase().includes(q)
    )
  }, [findings, search])

  const selectedFinding = useMemo(() => {
    if (!selectedId) return null
    return filtered.find((f) => f.id === selectedId) ?? null
  }, [filtered, selectedId])

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['findings', deviceId] }),
    [queryClient, deviceId]
  )

  const createMutation = useMutation({
    mutationFn: (data: { title: string; severity: FindingSeverity; description: string }) =>
      createFinding(sessionId!, data),
    onSuccess: (created: Finding) => {
      invalidate()
      setSelectedId(created.id)
      setDialogOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: { title?: string; severity?: string; description?: string }
    }) => updateFinding(id, data),
    onSuccess: () => invalidate(),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteFinding,
    onSuccess: () => {
      invalidate()
      setSelectedId(null)
    },
  })

  const handleClear = useCallback(async () => {
    setClearing(true)
    try {
      await clearDeviceFindings(deviceId)
      invalidate()
      setSelectedId(null)
    } finally {
      setClearing(false)
    }
  }, [deviceId, invalidate])

  const handleExport = useCallback(() => {
    const a = document.createElement('a')
    a.href = `/api/v1/devices/${deviceId}/findings/export`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [deviceId])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter findings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        {sessionId && (
          <Button variant="default" size="sm" className="h-8" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3 w-3" />
            Add Finding
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={handleExport}
          disabled={findings.length === 0}
        >
          <Download className="mr-1.5 h-3 w-3" />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={handleClear}
          disabled={clearing || findings.length === 0}
        >
          <Trash2 className="mr-1.5 h-3 w-3" />
          {clearing ? 'Clearing...' : 'Clear'}
        </Button>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {findings.length} finding{findings.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {findings.length === 0 ? 'No findings yet' : 'No findings match your filter'}
            </p>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={40} minSize={20}>
              <FindingsList findings={filtered} selectedId={selectedId} onSelect={setSelectedId} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={60} minSize={30}>
              <FindingDetail
                finding={selectedFinding}
                sessionId={sessionId}
                onUpdate={(id, data) => updateMutation.mutate({ id, data })}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {sessionId && (
        <FindingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          sessionId={sessionId}
          onSubmit={(data) => createMutation.mutate(data)}
        />
      )}
    </div>
  )
}

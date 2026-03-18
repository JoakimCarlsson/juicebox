import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'
import type { Finding } from '@/types/session'
import { severityColor } from '@/components/findings/FindingsList'
import { FindingDialog } from '@/components/findings/FindingDialog'

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

interface FindingDetailProps {
  finding: Finding | null
  sessionId: string | null
  onUpdate: (id: string, data: { title?: string; severity?: string; description?: string }) => void
  onDelete: (id: string) => void
}

export function FindingDetail({ finding, sessionId, onUpdate, onDelete }: FindingDetailProps) {
  const [editing, setEditing] = useState(false)

  if (!finding) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a finding to view details
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Badge variant="outline" className={severityColor(finding.severity)}>
          {finding.severity}
        </Badge>
        <h2 className="text-sm font-semibold flex-1 truncate">{finding.title}</h2>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(finding.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {finding.description && (
          <div className="text-sm whitespace-pre-wrap">{finding.description}</div>
        )}

        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <div>Created: {formatDateTime(finding.createdAt)}</div>
          {finding.updatedAt !== finding.createdAt && (
            <div>Updated: {formatDateTime(finding.updatedAt)}</div>
          )}
        </div>
      </div>

      {sessionId && (
        <FindingDialog
          open={editing}
          onOpenChange={setEditing}
          sessionId={sessionId}
          finding={finding}
          onSubmit={(data) => {
            onUpdate(finding.id, data)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Finding, FindingSeverity } from '@/types/session'
import { cn } from '@/lib/utils'

const SEVERITIES: { value: FindingSeverity; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'bg-red-500 border-red-600' },
  { value: 'high', label: 'High', color: 'bg-orange-500 border-orange-600' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-500 border-amber-600' },
  { value: 'low', label: 'Low', color: 'bg-blue-500 border-blue-600' },
  { value: 'info', label: 'Info', color: 'bg-slate-400 border-slate-500' },
]

interface FindingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  finding?: Finding
  defaultTitle?: string
  onSubmit: (data: { title: string; severity: FindingSeverity; description: string }) => void
}

export function FindingDialog({
  open,
  onOpenChange,
  finding,
  defaultTitle,
  onSubmit,
}: FindingDialogProps) {
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<FindingSeverity>('medium')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(finding?.title ?? defaultTitle ?? '')
      setSeverity(finding?.severity ?? 'medium')
      setDescription(finding?.description ?? '')
    }
  }, [open, finding, defaultTitle])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!title.trim()) return
      onSubmit({ title: title.trim(), severity, description: description.trim() })
    },
    [title, severity, description, onSubmit]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{finding ? 'Edit Finding' : 'Add Finding'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Hardcoded API key in SharedPreferences"
                className="text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Severity</label>
              <div className="flex gap-1.5">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSeverity(s.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors border',
                      severity === s.value
                        ? 'border-foreground/30 bg-muted font-medium'
                        : 'border-transparent hover:bg-muted/50 text-muted-foreground'
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', s.color)} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what was found and why it matters..."
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              {finding ? 'Save' : 'Add Finding'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

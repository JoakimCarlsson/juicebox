import { Badge } from '@/components/ui/badge'
import type { Finding } from '@/types/session'
import { cn } from '@/lib/utils'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  info: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
}

export function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

interface FindingsListProps {
  findings: Finding[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function FindingsList({ findings, selectedId, onSelect }: FindingsListProps) {
  return (
    <div className="h-full overflow-auto">
      {findings.map((finding) => {
        const isSelected = finding.id === selectedId
        return (
          <button
            key={finding.id}
            onClick={() => onSelect(finding.id)}
            className={cn(
              'w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-border transition-colors hover:bg-muted/50',
              isSelected && 'bg-accent'
            )}
          >
            <Badge
              variant="outline"
              className={cn('shrink-0 text-[10px]', severityColor(finding.severity))}
            >
              {finding.severity}
            </Badge>
            <span className="text-xs truncate flex-1">{finding.title}</span>
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {formatTime(finding.createdAt)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

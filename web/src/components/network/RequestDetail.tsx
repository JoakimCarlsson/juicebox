import { useState, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Terminal,
  Code,
  FileJson,
  Flag,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { generateCurl, generateFetch, generatePythonRequests, generateHarEntry } from '@/lib/export'
import type { HttpMessage } from '@/types/session'
import { FindingDialog } from '@/components/findings/FindingDialog'
import { BodyViewer } from './BodyViewer'
import { formatBytes, formatDuration, statusColor, methodColor } from './helpers'

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers)
  if (entries.length === 0) return null

  return (
    <div className="rounded border border-border overflow-hidden">
      {entries.map(([key, value]) => (
        <div key={key} className="flex border-b border-border last:border-0">
          <span className="w-48 shrink-0 bg-muted/30 px-3 py-1.5 text-xs font-mono font-medium text-muted-foreground truncate">
            {key}
          </span>
          <span className="flex-1 px-3 py-1.5 text-xs font-mono break-all">{value}</span>
        </div>
      ))}
    </div>
  )
}

function CollapsibleSection({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        {title}
        {badge}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

function CopyAsDropdown({ message }: { message: HttpMessage }) {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)

  const handleCopy = useCallback(
    (label: string, generator: (m: HttpMessage) => string) => {
      navigator.clipboard.writeText(generator(message))
      setCopiedLabel(label)
      setTimeout(() => setCopiedLabel(null), 1500)
    },
    [message]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
          {copiedLabel ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copiedLabel ? `Copied as ${copiedLabel}` : 'Copy as...'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleCopy('cURL', generateCurl)}>
          <Terminal className="h-3.5 w-3.5 mr-2" />
          Copy as cURL
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCopy('fetch', generateFetch)}>
          <Code className="h-3.5 w-3.5 mr-2" />
          Copy as fetch
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCopy('Python', generatePythonRequests)}>
          <Code className="h-3.5 w-3.5 mr-2" />
          Copy as Python requests
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleCopy('HAR', generateHarEntry)}>
          <FileJson className="h-3.5 w-3.5 mr-2" />
          Export as HAR entry
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RequestDetail({
  message,
  sessionId,
  onFindingCreated,
}: {
  message: HttpMessage | null
  sessionId?: string | null
  onFindingCreated?: () => void
}) {
  const [findingOpen, setFindingOpen] = useState(false)

  if (!message) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a request to view details</p>
      </div>
    )
  }

  const hasReqHeaders = Object.keys(message.requestHeaders).length > 0
  const hasResHeaders = Object.keys(message.responseHeaders).length > 0

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center justify-end gap-1 px-4 py-1.5 border-b border-border sticky top-0 bg-background z-10">
        {sessionId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setFindingOpen(true)}
          >
            <Flag className="h-3 w-3" />
            Add Finding
          </Button>
        )}
        <CopyAsDropdown message={message} />
      </div>
      {sessionId && (
        <FindingDialog
          open={findingOpen}
          onOpenChange={setFindingOpen}
          sessionId={sessionId}
          defaultTitle={`${message.method} ${new URL(message.url).pathname}`}
          onSubmit={async (data) => {
            const { createFinding } = await import('@/features/sessions/api')
            await createFinding(sessionId, data)
            setFindingOpen(false)
            onFindingCreated?.()
          }}
        />
      )}

      <CollapsibleSection
        title="REQUEST"
        badge={
          <Badge
            variant="secondary"
            className={cn('font-mono text-xs ml-1', methodColor(message.method))}
          >
            {message.method}
          </Badge>
        }
      >
        <div className="rounded bg-muted/50 px-3 py-2 font-mono text-xs break-all text-foreground">
          {message.url}
        </div>

        {hasReqHeaders && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Headers</h4>
            <HeadersTable headers={message.requestHeaders} />
          </div>
        )}

        {message.requestBody && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Body</h4>
            <BodyViewer
              body={message.requestBody}
              headers={message.requestHeaders}
              size={message.requestBodySize}
              bodyEncoding={message.requestBodyEncoding}
            />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="RESPONSE"
        badge={
          message.statusCode ? (
            <Badge
              variant="secondary"
              className={cn('font-mono text-xs ml-1', statusColor(message.statusCode))}
            >
              {message.statusCode}
            </Badge>
          ) : undefined
        }
      >
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-mono font-semibold', statusColor(message.statusCode))}>
            {message.statusCode || '\u2014'}
          </span>
          {message.duration !== undefined && message.duration > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatDuration(message.duration)}
            </span>
          )}
          {(message.responseBodySize ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatBytes(message.responseBodySize ?? 0)}
            </span>
          )}
        </div>

        {hasResHeaders && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Headers</h4>
            <HeadersTable headers={message.responseHeaders} />
          </div>
        )}

        {message.responseBody && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Body</h4>
            <BodyViewer
              body={message.responseBody}
              headers={message.responseHeaders}
              size={message.responseBodySize}
              bodyEncoding={message.responseBodyEncoding}
            />
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

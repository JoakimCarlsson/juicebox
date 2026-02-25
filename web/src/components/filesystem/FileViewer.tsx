import { useQuery } from '@tanstack/react-query'
import { readFileQueryOptions } from '@/features/filesystem/queries'
import { downloadFile } from '@/features/filesystem/api'
import { DatabaseViewer } from './DatabaseViewer'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Download, FileText, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const DB_EXTENSIONS = new Set(['db', 'sqlite', 'sqlite3'])

interface FileViewerProps {
  sessionId: string
  path: string
}

const TEXT_MIME_PREFIXES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/yaml',
  'application/toml',
  'application/x-sh',
]

function isTextMime(mime: string) {
  return TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))
}

function syntaxClass(mimeType: string, path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'xml' || mimeType.includes('xml')) return 'language-xml'
  if (ext === 'json' || mimeType.includes('json')) return 'language-json'
  if (ext === 'sh' || mimeType.includes('x-sh')) return 'language-bash'
  if (ext === 'js' || ext === 'ts') return 'language-javascript'
  if (ext === 'yaml' || ext === 'yml') return 'language-yaml'
  if (ext === 'properties' || ext === 'ini' || ext === 'cfg' || ext === 'conf')
    return 'language-ini'
  return ''
}

export function FileViewer({ sessionId, path }: FileViewerProps) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (DB_EXTENSIONS.has(ext)) {
    return <DatabaseViewer sessionId={sessionId} dbPath={path} />
  }
  return <TextFileViewer sessionId={sessionId} path={path} />
}

function TextFileViewer({ sessionId, path }: FileViewerProps) {
  const { data, isLoading, error } = useQuery(readFileQueryOptions(sessionId, path))

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground p-8">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      </div>
    )
  }

  if (!data) return null

  if (data.encoding === 'base64' || !isTextMime(data.mimeType)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full text-muted-foreground">
        <FileText className="h-8 w-8 opacity-30" />
        <p className="text-sm">Binary file</p>
        <p className="text-xs text-muted-foreground/60">
          {data.mimeType} &middot; {formatSize(data.size)}
        </p>
        <Button variant="outline" size="sm" onClick={() => downloadFile(sessionId, path)}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-muted/30 shrink-0">
        <span className="text-xs text-muted-foreground font-mono truncate">{path}</span>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-[10px] text-muted-foreground/60">
            {data.mimeType} &middot; {formatSize(data.size)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => downloadFile(sessionId, path)}
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <pre
          className={cn(
            'p-4 text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all',
            syntaxClass(data.mimeType, path)
          )}
        >
          {data.content}
        </pre>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

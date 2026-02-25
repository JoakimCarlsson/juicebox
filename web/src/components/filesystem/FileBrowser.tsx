import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileTree } from './FileTree'
import { FileViewer } from './FileViewer'
import { findFilesQueryOptions } from '@/features/filesystem/queries'
import type { FileEntry } from '@/features/filesystem/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, X, FolderOpen, FileText, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileBrowserProps {
  sessionId: string
  bundleId: string
}

export function FileBrowser({ sessionId, bundleId }: FileBrowserProps) {
  const rootPath = `/data/data/${bundleId}`
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [searchRefreshKey, setSearchRefreshKey] = useState(0)

  const handleSelect = useCallback((entry: FileEntry) => {
    setSelectedFile(entry)
  }, [])

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      setActiveSearch(searchQuery.trim())
      setSearchRefreshKey((k) => k + 1)
    }
  }, [searchQuery])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setActiveSearch('')
  }, [])

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col w-72 shrink-0 border-r border-border overflow-hidden">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch()
                }}
                className="pl-7 h-7 text-xs"
              />
            </div>
            {activeSearch ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={clearSearch}
              >
                <X className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleSearch}
                disabled={!searchQuery.trim()}
              >
                <Search className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        <div className="px-3 py-1.5 border-b border-border shrink-0">
          <p className="text-[10px] font-mono text-muted-foreground/70 truncate">{rootPath}</p>
        </div>

        <div className="flex-1 overflow-auto">
          {activeSearch ? (
            <SearchResults
              key={searchRefreshKey}
              sessionId={sessionId}
              pattern={activeSearch}
              basePath={rootPath}
              selectedPath={selectedFile?.path ?? null}
              onSelect={handleSelect}
            />
          ) : (
            <FileTree
              sessionId={sessionId}
              rootPath={rootPath}
              selectedPath={selectedFile?.path ?? null}
              onSelect={handleSelect}
            />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <FileViewer sessionId={sessionId} path={selectedFile.path} />
        ) : (
          <EmptyViewer rootPath={rootPath} />
        )}
      </div>
    </div>
  )
}

function EmptyViewer({ rootPath }: { rootPath: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
      <FolderOpen className="h-8 w-8 opacity-20" />
      <p className="text-sm">Select a file to view its contents</p>
      <p className="text-xs text-muted-foreground/50 font-mono">{rootPath}</p>
    </div>
  )
}

function SearchResults({
  sessionId,
  pattern,
  basePath,
  selectedPath,
  onSelect,
}: {
  sessionId: string
  pattern: string
  basePath: string
  selectedPath: string | null
  onSelect: (entry: FileEntry) => void
}) {
  const { data, isLoading, error, refetch } = useQuery(
    findFilesQueryOptions(sessionId, pattern, basePath)
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5 p-3">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3.5 w-40 ml-2" />
        <Skeleton className="h-3.5 w-52" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-xs text-destructive">{(error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Retry
        </Button>
      </div>
    )
  }

  if (!data?.paths.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 p-4 text-muted-foreground">
        <p className="text-xs">
          No files matching <span className="font-mono">{pattern}</span>
        </p>
      </div>
    )
  }

  return (
    <div className="py-1">
      <div className="px-3 py-1">
        <span className="text-[10px] text-muted-foreground">
          {data.paths.length} result{data.paths.length !== 1 ? 's' : ''}
        </span>
      </div>
      {data.paths.map((filePath) => {
        const name = filePath.split('/').pop() ?? filePath
        const dir = filePath.slice(0, filePath.lastIndexOf('/'))
        const isSelected = selectedPath === filePath
        return (
          <div
            key={filePath}
            role="button"
            tabIndex={0}
            onClick={() =>
              onSelect({
                name,
                path: filePath,
                type: 'file',
                size: 0,
                permissions: '',
                modifiedAt: '',
              })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ')
                onSelect({
                  name,
                  path: filePath,
                  type: 'file',
                  size: 0,
                  permissions: '',
                  modifiedAt: '',
                })
            }}
            className={cn(
              'flex flex-col px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors',
              isSelected && 'bg-muted'
            )}
          >
            <div className="flex items-center gap-1.5">
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="text-xs font-mono truncate">{name}</span>
            </div>
            <span className="text-[10px] text-muted-foreground/60 font-mono truncate ml-4.5">
              {dir}
            </span>
          </div>
        )
      })}
    </div>
  )
}

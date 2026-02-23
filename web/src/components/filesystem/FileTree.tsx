import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { listFilesQueryOptions } from "@/features/filesystem/queries"
import type { FileEntry } from "@/features/filesystem/api"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  Database,
  ChevronRight,
  AlertCircle,
  Link,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FileTreeProps {
  sessionId: string
  rootPath: string
  selectedPath: string | null
  onSelect: (entry: FileEntry) => void
}

interface TreeNodeProps {
  sessionId: string
  entry: FileEntry
  depth: number
  selectedPath: string | null
  onSelect: (entry: FileEntry) => void
}

function fileIcon(entry: FileEntry) {
  if (entry.type === "dir") return null
  if (entry.type === "symlink") return <Link className="h-3 w-3 shrink-0 text-muted-foreground" />
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? ""
  if (["db", "sqlite", "sqlite3"].includes(ext)) return <Database className="h-3 w-3 shrink-0 text-amber-500" />
  if (["xml", "json", "txt", "log", "properties", "ini", "cfg", "conf"].includes(ext)) return <FileText className="h-3 w-3 shrink-0 text-blue-400" />
  return <File className="h-3 w-3 shrink-0 text-muted-foreground" />
}

function formatSize(bytes: number): string {
  if (bytes === 0) return ""
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`
}

function TreeNode({ sessionId, entry, depth, selectedPath, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const isSelected = selectedPath === entry.path
  const isDir = entry.type === "dir"

  const { data, isLoading } = useQuery({
    ...listFilesQueryOptions(sessionId, entry.path),
    enabled: isDir && expanded,
  })

  const handleClick = useCallback(() => {
    if (isDir) {
      setExpanded((prev) => !prev)
    } else {
      onSelect(entry)
    }
  }, [isDir, entry, onSelect])

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick() }}
        className={cn(
          "flex items-center gap-1.5 px-2 py-0.5 cursor-pointer select-none",
          "text-xs hover:bg-muted/50 transition-colors",
          isSelected && !isDir && "bg-muted text-foreground",
          !isSelected && "text-foreground/80",
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {isDir ? (
          <>
            <ChevronRight
              className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
            />
            {expanded
              ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            }
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            {fileIcon(entry)}
          </>
        )}
        <span className="truncate flex-1 min-w-0">{entry.name}</span>
        {!isDir && entry.size > 0 && (
          <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-1">{formatSize(entry.size)}</span>
        )}
      </div>

      {isDir && expanded && (
        <div>
          {isLoading && (
            <div className="flex flex-col gap-1 py-1" style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          )}
          {data?.entries.map((child) => (
            <TreeNode
              key={child.path}
              sessionId={sessionId}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
          {data?.entries.length === 0 && (
            <div
              className="text-[10px] text-muted-foreground/50 py-0.5 italic"
              style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}
            >
              empty
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function FileTree({ sessionId, rootPath, selectedPath, onSelect }: FileTreeProps) {
  const { data, isLoading, error } = useQuery(listFilesQueryOptions(sessionId, rootPath))

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5 p-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32 ml-4" />
        <Skeleton className="h-4 w-36 ml-4" />
        <Skeleton className="h-4 w-28 ml-4" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-xs text-destructive text-center">{(error as Error).message}</p>
      </div>
    )
  }

  if (!data?.entries.length) {
    return (
      <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
        No files found
      </div>
    )
  }

  return (
    <div className="py-1">
      {data.entries.map((entry) => (
        <TreeNode
          key={entry.path}
          sessionId={sessionId}
          entry={entry}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

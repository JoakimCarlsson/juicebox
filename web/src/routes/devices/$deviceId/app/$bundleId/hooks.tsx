import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import {
  Play,
  Loader2,
  Trash2,
  FilePlus,
  FileCode,
  Save,
  Pencil,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { useDeviceSocket } from '@/contexts/DeviceSocketContext'
import { useScriptOutput } from '@/contexts/ScriptOutputContext'
import { useBottomPanel } from '@/contexts/BottomPanelContext'
import {
  fetchScriptFiles,
  upsertScriptFile,
  deleteScriptFile,
  runScriptByName,
} from '@/features/sessions/api'
import type { ScriptFile } from '@/features/sessions/api'
import { NoSessionEmptyState } from '@/components/sessions/NoSessionEmptyState'

export const Route = createFileRoute('/devices/$deviceId/app/$bundleId/hooks')({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? '',
  }),
  component: HooksPage,
})

// ---------------------------------------------------------------------------
// Tree data types
// ---------------------------------------------------------------------------

interface TreeNode {
  id: string
  name: string
  fullPath: string
  fileId?: string
  children?: TreeNode[]
}

function buildTree(files: ScriptFile[]): TreeNode[] {
  const root: TreeNode[] = []
  const folders = new Map<string, TreeNode>()

  function ensureFolder(path: string): TreeNode[] {
    if (!path) return root
    if (folders.has(path)) return folders.get(path)!.children!
    const parts = path.split('/')
    const parent = ensureFolder(parts.slice(0, -1).join('/'))
    const node: TreeNode = {
      id: `folder:${path}`,
      name: parts[parts.length - 1],
      fullPath: path,
      children: [],
    }
    folders.set(path, node)
    parent.push(node)
    return node.children!
  }

  for (const f of files) {
    const parts = f.name.split('/')
    const parent = ensureFolder(parts.slice(0, -1).join('/'))
    parent.push({
      id: f.id,
      name: parts[parts.length - 1],
      fullPath: f.name,
      fileId: f.id,
    })
  }

  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.children && !b.children) return -1
      if (!a.children && b.children) return 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((n) => n.children && sort(n.children))
  }
  sort(root)
  return root
}

// ---------------------------------------------------------------------------
// Inline rename input
// ---------------------------------------------------------------------------

function InlineInput({
  defaultValue,
  onCommit,
  onCancel,
}: {
  defaultValue: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    requestAnimationFrame(() => {
      el.focus()
      const dot = defaultValue.lastIndexOf('.')
      if (dot > 0) el.setSelectionRange(0, dot)
      else el.select()
    })
  }, [defaultValue])

  return (
    <input
      ref={ref}
      defaultValue={defaultValue}
      onBlur={() => onCancel()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(e.currentTarget.value)
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-5 w-full bg-muted/50 border border-primary/50 font-mono text-[11px] px-1 outline-none rounded-sm"
    />
  )
}

// ---------------------------------------------------------------------------
// Single tree node row
// ---------------------------------------------------------------------------

function TreeNodeRow({
  node,
  depth,
  selectedId,
  editingId,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onCreateFile,
  onCreateFolder,
  onRequestDelete,
  onRequestDeleteFolder,
  openFolders,
  toggleFolder,
}: {
  node: TreeNode
  depth: number
  selectedId: string | undefined
  editingId: string | null
  onSelect: (node: TreeNode) => void
  onStartEdit: (id: string) => void
  onCommitEdit: (id: string, value: string) => void
  onCancelEdit: () => void
  onCreateFile: (parentPath: string) => void
  onCreateFolder: (parentPath: string) => void
  onRequestDelete: (fileId: string, fullPath: string) => void
  onRequestDeleteFolder: (folderPath: string) => void
  openFolders: Set<string>
  toggleFolder: (id: string) => void
}) {
  const isFolder = !!node.children
  const isOpen = isFolder && openFolders.has(node.id)
  const isSelected = node.id === selectedId
  const isEditing = node.id === editingId

  const contextParent = isFolder
    ? node.fullPath
    : node.fullPath.includes('/')
      ? node.fullPath.split('/').slice(0, -1).join('/')
      : ''

  const row = (
    <div
      className={cn(
        'flex items-center gap-1.5 pr-2 h-7 cursor-pointer text-xs select-none',
        'hover:bg-muted/50',
        isSelected && !isEditing && 'bg-muted'
      )}
      style={{ paddingLeft: depth * 12 }}
      onClick={() => {
        if (isFolder) toggleFolder(node.id)
        else onSelect(node)
      }}
      onDoubleClick={() => {
        if (!isFolder) onStartEdit(node.id)
      }}
    >
      {isFolder ? (
        <>
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </>
      ) : (
        <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-[18px]" />
      )}
      {isEditing ? (
        <InlineInput
          defaultValue={node.name}
          onCommit={(v) => onCommitEdit(node.id, v)}
          onCancel={onCancelEdit}
        />
      ) : (
        <span className="truncate flex-1 font-mono text-[11px]">{node.name}</span>
      )}
    </div>
  )

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem className="gap-2 text-xs" onClick={() => onCreateFile(contextParent)}>
            <FilePlus className="h-3.5 w-3.5" />
            New File
          </ContextMenuItem>
          <ContextMenuItem className="gap-2 text-xs" onClick={() => onCreateFolder(contextParent)}>
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </ContextMenuItem>
          {!isFolder && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem className="gap-2 text-xs" onClick={() => onStartEdit(node.id)}>
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </ContextMenuItem>
              {node.fileId && (
                <ContextMenuItem
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                  onClick={() => onRequestDelete(node.fileId!, node.fullPath)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </ContextMenuItem>
              )}
            </>
          )}
          {isFolder && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem className="gap-2 text-xs" onClick={() => onStartEdit(node.id)}>
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </ContextMenuItem>
              <ContextMenuItem
                className="gap-2 text-xs text-destructive focus:text-destructive"
                onClick={() => onRequestDeleteFolder(node.fullPath)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Folder
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {isFolder &&
        isOpen &&
        node.children!.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            editingId={editingId}
            onSelect={onSelect}
            onStartEdit={onStartEdit}
            onCommitEdit={onCommitEdit}
            onCancelEdit={onCancelEdit}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onRequestDelete={onRequestDelete}
            onRequestDeleteFolder={onRequestDeleteFolder}
            openFolders={openFolders}
            toggleFolder={toggleFolder}
          />
        ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// New-node input (appears at the top of a folder / root when creating)
// ---------------------------------------------------------------------------

function NewNodeInput({
  depth,
  isFolder,
  onCommit,
  onCancel,
}: {
  depth: number
  isFolder: boolean
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 pr-2 h-7" style={{ paddingLeft: depth * 12 }}>
      {isFolder ? (
        <>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </>
      ) : (
        <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-[18px]" />
      )}
      <InlineInput defaultValue="" onCommit={onCommit} onCancel={onCancel} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// File tree panel
// ---------------------------------------------------------------------------

function FileTree({
  files,
  selectedId,
  onSelectFile,
  sessionId,
  onFilesChanged,
}: {
  files: ScriptFile[]
  selectedId: string | undefined
  onSelectFile: (name: string) => void
  sessionId: string
  onFilesChanged: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set())
  const [creating, setCreating] = useState<{
    parentPath: string
    type: 'file' | 'folder'
  } | null>(null)
  const [virtualFolders, setVirtualFolders] = useState<
    { id: string; parentPath: string; name: string }[]
  >([])

  const tree = useMemo(() => {
    const base = buildTree(files)

    for (const vf of virtualFolders) {
      const node: TreeNode = {
        id: vf.id,
        name: vf.name,
        fullPath: vf.parentPath ? `${vf.parentPath}/${vf.name}` : vf.name,
        children: [],
      }
      const insertInto = (nodes: TreeNode[], parentPath: string): boolean => {
        if (!parentPath) {
          nodes.push(node)
          return true
        }
        for (const n of nodes) {
          if (n.fullPath === parentPath && n.children) {
            n.children.push(node)
            return true
          }
          if (n.children && insertInto(n.children, parentPath)) return true
        }
        return false
      }
      if (!insertInto(base, vf.parentPath)) base.push(node)
    }

    return base
  }, [files, virtualFolders])

  const [prevTree, setPrevTree] = useState<TreeNode[]>([])
  if (tree !== prevTree) {
    setPrevTree(tree)
    const ids = new Set<string>()
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children) {
          ids.add(n.id)
          walk(n.children)
        }
      }
    }
    walk(tree)
    setOpenFolders((prev) => {
      const merged = new Set(prev)
      for (const id of ids) merged.add(id)
      return merged
    })
  }

  const [prevFiles, setPrevFiles] = useState(files)
  if (files !== prevFiles) {
    setPrevFiles(files)
    setVirtualFolders((prev) => {
      const next = prev.filter((vf) => {
        const path = vf.parentPath ? `${vf.parentPath}/${vf.name}` : vf.name
        return !files.some((f) => f.name.startsWith(path + '/'))
      })
      return next.length === prev.length ? prev : next
    })
  }

  const toggleFolder = useCallback((id: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const startCreate = useCallback((parentPath: string, type: 'file' | 'folder') => {
    setCreating({ parentPath, type })
    if (parentPath) {
      setOpenFolders((prev) => {
        const next = new Set(prev)
        next.add(`folder:${parentPath}`)
        return next
      })
    }
  }, [])

  const commitCreate = useCallback(
    async (value: string) => {
      setCreating(null)
      if (!value.trim()) return
      const name = value.trim()
      const parentPath = creating?.parentPath ?? ''
      const fullPath = parentPath ? `${parentPath}/${name}` : name

      if (creating?.type === 'folder') {
        setVirtualFolders((prev) => [
          ...prev,
          {
            id: `vfolder:${Date.now()}`,
            parentPath,
            name,
          },
        ])
      } else {
        await upsertScriptFile(sessionId, fullPath, '')
        onFilesChanged()
      }
    },
    [creating, sessionId, onFilesChanged]
  )

  const cancelCreate = useCallback(() => setCreating(null), [])

  const commitEdit = useCallback(
    async (id: string, value: string) => {
      setEditingId(null)
      if (!value.trim()) return
      const name = value.trim()

      // Renaming a folder is done by renaming all files inside it
      if (id.startsWith('folder:')) {
        const oldPath = id.slice('folder:'.length)
        const affected = files.filter((f) => f.name === oldPath || f.name.startsWith(oldPath + '/'))
        const parts = oldPath.split('/')
        parts[parts.length - 1] = name
        const newPath = parts.join('/')
        for (const f of affected) {
          const newName = newPath + f.name.slice(oldPath.length)
          await upsertScriptFile(sessionId, newName, f.content)
          await deleteScriptFile(sessionId, f.id)
        }
        onFilesChanged()
        return
      }

      // Renaming a virtual folder
      if (id.startsWith('vfolder:')) {
        setVirtualFolders((prev) => prev.map((vf) => (vf.id === id ? { ...vf, name } : vf)))
        return
      }

      // Renaming a regular file
      const file = files.find((f) => f.id === id)
      if (!file) return
      const parts = file.name.split('/')
      parts[parts.length - 1] = name
      const newFullPath = parts.join('/')
      if (newFullPath === file.name) return
      await upsertScriptFile(sessionId, newFullPath, file.content)
      await deleteScriptFile(sessionId, file.id)
      onFilesChanged()
    },
    [files, sessionId, onFilesChanged]
  )

  const cancelEdit = useCallback(() => setEditingId(null), [])

  const [deletingFile, setDeletingFile] = useState<{
    id: string
    name: string
  } | null>(null)
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null)

  const onRequestDelete = (fileId: string, fullPath: string) =>
    setDeletingFile({ id: fileId, name: fullPath })
  const onRequestDeleteFolder = (folderPath: string) => setDeletingFolder(folderPath)

  const confirmDelete = async () => {
    if (!deletingFile) return
    await deleteScriptFile(sessionId, deletingFile.id)
    onFilesChanged()
    setDeletingFile(null)
  }

  const confirmDeleteFolder = async () => {
    if (!deletingFolder) return
    const affected = files.filter(
      (f) => f.name.startsWith(deletingFolder + '/') || f.name === deletingFolder
    )
    for (const f of affected) {
      await deleteScriptFile(sessionId, f.id)
    }
    onFilesChanged()
    setDeletingFolder(null)
  }

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Scripts
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => startCreate('', 'file')}
            title="New File"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => startCreate('', 'folder')}
            title="New Folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 overflow-auto">
            {/* Root-level create input */}
            {creating && !creating.parentPath && (
              <NewNodeInput
                depth={1}
                isFolder={creating.type === 'folder'}
                onCommit={commitCreate}
                onCancel={cancelCreate}
              />
            )}
            {tree.map((node) => (
              <TreeNodeRow
                key={node.id}
                node={node}
                depth={1}
                selectedId={selectedId}
                editingId={editingId}
                onSelect={(n) => onSelectFile(n.fullPath)}
                onStartEdit={setEditingId}
                onCommitEdit={commitEdit}
                onCancelEdit={cancelEdit}
                onCreateFile={(p) => startCreate(p, 'file')}
                onCreateFolder={(p) => startCreate(p, 'folder')}
                onRequestDelete={onRequestDelete}
                onRequestDeleteFolder={onRequestDeleteFolder}
                openFolders={openFolders}
                toggleFolder={toggleFolder}
              />
            ))}
            {/* Creating inside an open folder — rendered after the folder's TreeNodeRow */}
            {creating &&
              creating.parentPath &&
              (() => {
                const findDepth = (nodes: TreeNode[], d: number): number | null => {
                  for (const n of nodes) {
                    if (n.fullPath === creating.parentPath) return d + 1
                    if (n.children) {
                      const found = findDepth(n.children, d + 1)
                      if (found !== null) return found
                    }
                  }
                  return null
                }
                const d = findDepth(tree, 1)
                if (d === null) return null
                return (
                  <NewNodeInput
                    key="__creating_nested__"
                    depth={d}
                    isFolder={creating.type === 'folder'}
                    onCommit={commitCreate}
                    onCancel={cancelCreate}
                  />
                )
              })()}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem className="gap-2 text-xs" onClick={() => startCreate('', 'file')}>
            <FilePlus className="h-3.5 w-3.5" />
            New File
          </ContextMenuItem>
          <ContextMenuItem className="gap-2 text-xs" onClick={() => startCreate('', 'folder')}>
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete file confirmation */}
      <Dialog
        open={!!deletingFile}
        onOpenChange={(open) => {
          if (!open) setDeletingFile(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete script</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-mono font-medium text-foreground">{deletingFile?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingFile(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete folder confirmation */}
      <Dialog
        open={!!deletingFolder}
        onOpenChange={(open) => {
          if (!open) setDeletingFolder(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the folder{' '}
              <span className="font-mono font-medium text-foreground">{deletingFolder}</span> and
              all files inside it? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingFolder(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteFolder}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HooksPage() {
  const { sessionId } = useSearch({
    from: '/devices/$deviceId/app/$bundleId/hooks',
  })
  const { subscribe } = useDeviceSocket()
  const scriptOutput = useScriptOutput()
  const bottomPanel = useBottomPanel()

  const [files, setFiles] = useState<ScriptFile[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [dirty, setDirty] = useState(false)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  const editorRef = useRef<
    Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0] | null
  >(null)
  const activeFileRef = useRef(activeFile)
  const codeRef = useRef(code)

  useEffect(() => {
    activeFileRef.current = activeFile
  }, [activeFile])

  useEffect(() => {
    codeRef.current = code
  }, [code])

  const loadFiles = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetchScriptFiles(sessionId)
      setFiles(res.files ?? [])
    } catch {}
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    fetchScriptFiles(sessionId)
      .then((res) => setFiles(res.files ?? []))
      .catch(() => {})
  }, [sessionId])

  // WebSocket: live file writes & script output
  useEffect(() => {
    if (!sessionId) return
    return subscribe(null, (envelope) => {
      if (envelope.sessionId !== sessionId) return
      if (envelope.type === 'file_write') {
        loadFiles()
        const data = envelope.payload as { name?: string }
        if (data?.name && data.name === activeFileRef.current) {
          fetchScriptFiles(sessionId)
            .then((res) => {
              const f = (res.files ?? []).find((f) => f.name === activeFileRef.current)
              if (f) {
                setCode(f.content)
                setDirty(false)
              }
            })
            .catch(() => {})
        }
      }
      if (envelope.type === 'script_output') {
        scriptOutput.addEntry(
          envelope.payload,
          typeof envelope.payload === 'object' &&
            envelope.payload !== null &&
            'error' in envelope.payload
        )
      }
    })
  }, [subscribe, sessionId, loadFiles, scriptOutput])

  const selectedFileId = useMemo(
    () => files.find((f) => f.name === activeFile)?.id,
    [files, activeFile]
  )

  const openFile = useCallback(
    (name: string) => {
      const f = files.find((f) => f.name === name)
      if (f) {
        setActiveFile(f.name)
        setCode(f.content)
        setDirty(false)
      }
    },
    [files]
  )

  const handleSave = useCallback(async () => {
    if (!sessionId || !activeFileRef.current || saving) return
    setSaving(true)
    try {
      await upsertScriptFile(sessionId, activeFileRef.current, codeRef.current)
      setDirty(false)
      await loadFiles()
    } catch {}
    setSaving(false)
  }, [sessionId, saving, loadFiles])

  const handleRun = useCallback(async () => {
    if (!sessionId || !activeFileRef.current || running) return
    if (dirty) {
      await upsertScriptFile(sessionId, activeFileRef.current, codeRef.current)
      setDirty(false)
      await loadFiles()
    }
    setRunning(true)
    scriptOutput.clear()
    bottomPanel.open('output')
    try {
      const result = await runScriptByName(sessionId, activeFileRef.current)
      if (result.error) {
        scriptOutput.addEntry({ error: result.error }, true)
      }
      if (result.output && result.output.length > 0) {
        scriptOutput.addEntries(result.output.map((o) => ({ payload: o })))
      }
    } catch (err) {
      scriptOutput.addEntry(
        {
          error: err instanceof Error ? err.message : String(err),
        },
        true
      )
    } finally {
      setRunning(false)
    }
  }, [sessionId, running, dirty, loadFiles, scriptOutput, bottomPanel])

  const handleEditorMount = useCallback(
    (
      editor: Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0],
      monaco: Monaco
    ) => {
      editorRef.current = editor
      editor.addAction({
        id: 'save-script',
        label: 'Save Script',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => handleSave(),
      })
      editor.addAction({
        id: 'run-script',
        label: 'Run Script',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => handleRun(),
      })
    },
    [handleSave, handleRun]
  )

  // When a file is deleted, clear editor if it was active
  const handleFilesChanged = useCallback(async () => {
    await loadFiles()
    // Reload active file content in case it was renamed
    if (activeFileRef.current) {
      try {
        const res = await fetchScriptFiles(sessionId)
        const f = (res.files ?? []).find((f) => f.name === activeFileRef.current)
        if (f) {
          setCode(f.content)
          setDirty(false)
        } else {
          setActiveFile(null)
          setCode('')
          setDirty(false)
        }
      } catch {}
    }
  }, [sessionId, loadFiles])

  if (!sessionId) {
    return <NoSessionEmptyState />
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={20} minSize={12}>
        <FileTree
          files={files}
          selectedId={selectedFileId}
          onSelectFile={openFile}
          sessionId={sessionId}
          onFilesChanged={handleFilesChanged}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={80} minSize={40}>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            {activeFile ? (
              <>
                <span className="text-xs font-mono text-muted-foreground">{activeFile}</span>
                {dirty && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                    unsaved
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5"
                    onClick={handleSave}
                    disabled={!dirty || saving}
                  >
                    <Save className="h-3 w-3" />
                    Save
                  </Button>
                  <Button size="sm" className="h-7 gap-1.5" onClick={handleRun} disabled={running}>
                    {running ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    {running ? 'Running...' : 'Run'}
                  </Button>
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Select or create a script</span>
            )}
          </div>

          <div className="flex-1 min-h-0">
            {activeFile ? (
              <Editor
                height="100%"
                defaultLanguage="typescript"
                value={code}
                onChange={(v) => {
                  setCode(v ?? '')
                  setDirty(true)
                }}
                onMount={handleEditorMount}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                  automaticLayout: true,
                  tabSize: 2,
                  readOnly: !activeFile,
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a script from the sidebar or create a new one
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

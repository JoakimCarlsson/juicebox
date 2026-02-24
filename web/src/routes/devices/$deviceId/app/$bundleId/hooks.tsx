import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Editor, { type Monaco } from "@monaco-editor/react"
import { Play, Loader2, Trash2, ChevronDown, ChevronRight, Clock, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useDeviceSocket } from "@/contexts/DeviceSocketContext"
import { runScript, fetchScriptHistory } from "@/features/sessions/api"
import type { ScriptHistoryItem } from "@/features/sessions/api"
import { NoSessionEmptyState } from "@/components/sessions/NoSessionEmptyState"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/hooks",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: HooksPage,
})

const DEFAULT_SCRIPT = `Java.perform(() => {
  send({ status: "ready" });
  send({ __done: true });
});
`

interface OutputEntry {
  timestamp: number
  payload: unknown
  isError?: boolean
}

function HooksPage() {
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/hooks",
  })
  const { subscribe } = useDeviceSocket()

  const [code, setCode] = useState(DEFAULT_SCRIPT)
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<OutputEntry[]>([])
  const [history, setHistory] = useState<ScriptHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const outputEndRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Parameters<NonNullable<Parameters<typeof Editor>[0]["onMount"]>>[0] | null>(null)

  useEffect(() => {
    if (!sessionId) return
    fetchScriptHistory(sessionId)
      .then((res) => setHistory(res.scripts ?? []))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    const unsub = subscribe(null, (envelope) => {
      if (envelope.sessionId !== sessionId) return

      if (envelope.type === "script_output") {
        const payload = envelope.payload
        setOutput((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            payload,
            isError: typeof payload === "object" && payload !== null && "error" in payload,
          },
        ])
      }

      if (envelope.type === "script_run") {
        const data = envelope.payload as { code?: string; source?: string }
        if (data?.source === "ai" && data.code) {
          setCode(data.code)
        }
      }
    })

    return unsub
  }, [subscribe, sessionId])

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [output])

  const handleRun = useCallback(async () => {
    if (!sessionId || running || !code.trim()) return
    setRunning(true)
    setOutput([])

    try {
      const result = await runScript(sessionId, code)
      if (result.error) {
        setOutput((prev) => [
          ...prev,
          { timestamp: Date.now(), payload: { error: result.error }, isError: true },
        ])
      }
      setHistory((prev) => [
        {
          id: result.id,
          code: result.code,
          output: result.output ?? [],
          status: result.status,
          timestamp: result.timestamp,
        },
        ...prev,
      ])
    } catch (err) {
      setOutput((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          payload: { error: err instanceof Error ? err.message : String(err) },
          isError: true,
        },
      ])
    } finally {
      setRunning(false)
    }
  }, [sessionId, running, code])

  const handleEditorMount = useCallback(
    (editor: Parameters<NonNullable<Parameters<typeof Editor>[0]["onMount"]>>[0], monaco: Monaco) => {
      editorRef.current = editor
      editor.addAction({
        id: "run-script",
        label: "Run Script",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => handleRun(),
      })
    },
    [handleRun],
  )

  const loadFromHistory = useCallback((item: ScriptHistoryItem) => {
    setCode(item.code)
    setShowHistory(false)
  }, [])

  if (!sessionId) {
    return <NoSessionEmptyState />
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button
            size="sm"
            className="h-7 gap-1.5"
            onClick={handleRun}
            disabled={running || !code.trim()}
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {running ? "Running..." : "Run"}
          </Button>
          <span className="text-[10px] text-muted-foreground">Ctrl+Enter</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setOutput([])}
            >
              <Trash2 className="mr-1.5 h-3 w-3" />
              Clear
            </Button>
            <Button
              variant={showHistory ? "secondary" : "ghost"}
              size="sm"
              className="h-7"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="mr-1.5 h-3 w-3" />
              History
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              defaultLanguage="typescript"
              value={code}
              onChange={(v) => setCode(v ?? "")}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                padding: { top: 8 },
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>

          <div className="border-t border-border flex flex-col" style={{ height: "35%" }}>
            <div className="flex items-center px-4 py-1.5 border-b border-border">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Output
              </span>
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                {output.length}
              </Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1 font-mono text-xs">
                {output.length === 0 ? (
                  <div className="flex items-center justify-center h-16 text-muted-foreground text-[11px]">
                    Script output will appear here
                  </div>
                ) : (
                  output.map((entry, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2 rounded px-2 py-1",
                        entry.isError
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted/50",
                      )}
                    >
                      <span className="text-muted-foreground shrink-0 tabular-nums text-[10px] leading-5">
                        {new Date(entry.timestamp).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          fractionalSecondDigits: 3,
                        })}
                      </span>
                      <pre className="whitespace-pre-wrap break-all flex-1 leading-5">
                        {typeof entry.payload === "string"
                          ? entry.payload
                          : JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
                <div ref={outputEndRef} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="w-72 border-l border-border flex flex-col">
          <div className="flex items-center px-3 py-2 border-b border-border">
            <Clock className="h-3 w-3 text-muted-foreground mr-1.5" />
            <span className="text-xs font-medium">Script History</span>
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              {history.length}
            </Badge>
          </div>
          <ScrollArea className="flex-1">
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">
                No scripts run yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {history.map((item) => {
                  const isExpanded = expandedHistoryId === item.id
                  return (
                    <div key={item.id}>
                      <button
                        onClick={() =>
                          setExpandedHistoryId(isExpanded ? null : item.id)
                        }
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-xs font-mono truncate flex-1">
                            {item.code.split("\n")[0].slice(0, 40)}
                          </span>
                          <Badge
                            variant={item.status === "error" ? "destructive" : "secondary"}
                            className="text-[9px] px-1 py-0 shrink-0"
                          >
                            {item.status}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 ml-4.5">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-2 space-y-2">
                          <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                            {item.code}
                          </pre>
                          {item.output && item.output.length > 0 && (
                            <pre className="text-[11px] font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-auto">
                              {JSON.stringify(item.output, null, 2)}
                            </pre>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] w-full"
                            onClick={() => loadFromHistory(item)}
                          >
                            Load in Editor
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

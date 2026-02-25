import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { queryOptions } from '@tanstack/react-query'
import { getTables, executeQuery, exportCsv } from '@/features/sqlite/api'
import type { DatabaseTable, QueryResponse } from '@/features/sqlite/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Database, Play, Download, AlertCircle, Table, Key, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DatabaseViewerProps {
  sessionId: string
  dbPath: string
}

function tablesQueryOptions(sessionId: string, dbPath: string) {
  return queryOptions({
    queryKey: ['sessions', sessionId, 'sqlite', 'tables', dbPath],
    queryFn: () => getTables(sessionId, dbPath),
    enabled: !!sessionId && !!dbPath,
    staleTime: 30_000,
  })
}

export function DatabaseViewer({ sessionId, dbPath }: DatabaseViewerProps) {
  const { data, isLoading, error } = useQuery(tablesQueryOptions(sessionId, dbPath))
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [sql, setSql] = useState('')
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const didInitialQuery = useRef(false)

  const firstTableName = data?.tables?.[0]?.name ?? null
  const effectiveTable = selectedTable ?? firstTableName
  const displaySql = sql || (effectiveTable ? `SELECT * FROM "${effectiveTable}" LIMIT 100` : '')

  const mutation = useMutation({
    mutationFn: (sqlStr: string) => executeQuery(sessionId, dbPath, sqlStr),
    onSuccess: (result) => {
      setQueryResult(result)
      setQueryError(null)
    },
    onError: (err: Error) => {
      setQueryError(err.message)
      setQueryResult(null)
    },
  })

  const handleTableClick = useCallback(
    (tableName: string) => {
      setSelectedTable(tableName)
      const q = `SELECT * FROM "${tableName}" LIMIT 100`
      setSql(q)
      mutation.mutate(q)
    },
    [mutation]
  )

  const handleExecute = useCallback(() => {
    if (displaySql.trim()) {
      mutation.mutate(displaySql.trim())
    }
  }, [displaySql, mutation])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleExecute()
      }
    },
    [handleExecute]
  )

  const handleExport = useCallback(() => {
    if (displaySql.trim()) {
      exportCsv(sessionId, dbPath, displaySql.trim())
    }
  }, [sessionId, dbPath, displaySql])

  useEffect(() => {
    if (effectiveTable && !didInitialQuery.current) {
      didInitialQuery.current = true
      mutation.mutate(`SELECT * FROM "${effectiveTable}" LIMIT 100`)
    }
  }, [effectiveTable, mutation])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-muted-foreground font-mono truncate">{dbPath}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-4">
          {data.tables.length} table{data.tables.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto shrink-0">
        {data.tables.map((table) => (
          <button
            key={table.name}
            onClick={() => handleTableClick(table.name)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-mono whitespace-nowrap transition-colors',
              effectiveTable === table.name
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Table className="h-3 w-3" />
            {table.name}
          </button>
        ))}
      </div>

      {effectiveTable && <SchemaBar table={data.tables.find((t) => t.name === effectiveTable)} />}

      <div className="flex flex-col border-b border-border shrink-0">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={displaySql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="SELECT * FROM ..."
            rows={3}
            className={cn(
              'w-full px-4 py-2 text-xs font-mono bg-background text-foreground',
              'resize-none outline-none placeholder:text-muted-foreground/50',
              'border-none focus:ring-0'
            )}
            spellCheck={false}
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/20 border-t border-border">
          <Button
            variant="default"
            size="sm"
            className="h-6 text-xs px-2.5"
            onClick={handleExecute}
            disabled={!displaySql.trim() || mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Play className="mr-1 h-3 w-3" />
            )}
            Run
          </Button>
          <span className="text-[10px] text-muted-foreground/50">Ctrl+Enter</span>
          <div className="flex-1" />
          {queryResult && queryResult.rows.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={handleExport}>
              <Download className="mr-1 h-3 w-3" />
              CSV
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {mutation.isPending && (
          <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Running query...</span>
          </div>
        )}

        {queryError && !mutation.isPending && (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-xs text-destructive font-mono">{queryError}</p>
          </div>
        )}

        {queryResult && !mutation.isPending && <QueryResultsTable result={queryResult} />}

        {!queryResult && !queryError && !mutation.isPending && (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <Database className="h-6 w-6 opacity-20" />
            <p className="text-xs">Select a table or run a query</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SchemaBar({ table }: { table: DatabaseTable | undefined }) {
  if (!table) return null

  return (
    <div className="flex items-center gap-1.5 px-4 py-1 border-b border-border bg-muted/10 overflow-x-auto shrink-0">
      {table.columns.map((col) => (
        <Badge
          key={col.name}
          variant="outline"
          className="text-[10px] font-mono gap-1 px-1.5 py-0 h-5 shrink-0"
        >
          {col.pk && <Key className="h-2.5 w-2.5 text-amber-500" />}
          <span className="text-foreground/80">{col.name}</span>
          <span className="text-muted-foreground/50">{col.type || 'ANY'}</span>
        </Badge>
      ))}
    </div>
  )
}

function QueryResultsTable({ result }: { result: QueryResponse }) {
  if (result.rowsAffected !== undefined && result.rowsAffected > 0) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
        {result.rowsAffected} row{result.rowsAffected !== 1 ? 's' : ''} affected
      </div>
    )
  }

  if (result.rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
        No results
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="border-b border-border">
              <th className="px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-10">
                #
              </th>
              {result.columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-2 py-0.5 text-[10px] text-muted-foreground/50 font-mono">
                  {i + 1}
                </td>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="px-2 py-0.5 text-xs font-mono max-w-xs truncate"
                    title={cell == null ? 'NULL' : String(cell)}
                  >
                    {cell == null ? (
                      <span className="text-muted-foreground/40 italic">NULL</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center px-4 py-1 border-t border-border bg-muted/20 shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {result.rowCount} row{result.rowCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

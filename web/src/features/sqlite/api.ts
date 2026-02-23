export interface DatabaseColumn {
  name: string
  type: string
  notNull: boolean
  pk: boolean
}

export interface DatabaseTable {
  name: string
  columns: DatabaseColumn[]
}

export interface TablesResponse {
  dbPath: string
  tables: DatabaseTable[]
}

export interface QueryResponse {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  rowsAffected?: number
}

export async function getTables(sessionId: string, dbPath: string): Promise<TablesResponse> {
  const res = await fetch(
    `/api/v1/sessions/${sessionId}/sqlite/tables?dbPath=${encodeURIComponent(dbPath)}`,
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to get tables")
  }
  return res.json()
}

export async function executeQuery(
  sessionId: string,
  dbPath: string,
  sql: string,
  readOnly = true,
): Promise<QueryResponse> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/sqlite/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dbPath, sql, readOnly }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to execute query")
  }
  return res.json()
}

export function exportCsv(sessionId: string, dbPath: string, sql: string): void {
  const params = new URLSearchParams({ dbPath, sql })
  const url = `/api/v1/sessions/${sessionId}/sqlite/export?${params}`
  const a = document.createElement("a")
  a.href = url
  a.download = "export.csv"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

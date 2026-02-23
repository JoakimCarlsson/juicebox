export interface FileEntry {
  name: string
  path: string
  type: "file" | "dir" | "symlink"
  size: number
  permissions: string
  modifiedAt: string
}

export interface FileContent {
  path: string
  content: string
  encoding: "utf-8" | "base64"
  mimeType: string
  size: number
}

export interface ListResponse {
  path: string
  entries: FileEntry[]
}

export interface FindResponse {
  pattern: string
  basePath: string
  paths: string[]
}

export async function listFiles(sessionId: string, path: string): Promise<ListResponse> {
  const res = await fetch(
    `/api/v1/sessions/${sessionId}/fs/ls?path=${encodeURIComponent(path)}`,
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to list files")
  }
  return res.json()
}

export async function readFile(sessionId: string, path: string): Promise<FileContent> {
  const res = await fetch(
    `/api/v1/sessions/${sessionId}/fs/read?path=${encodeURIComponent(path)}`,
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to read file")
  }
  return res.json()
}

export async function downloadFile(sessionId: string, path: string): Promise<void> {
  const url = `/api/v1/sessions/${sessionId}/fs/read?path=${encodeURIComponent(path)}`
  const a = document.createElement("a")
  a.href = url
  a.download = path.split("/").pop() ?? "download"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function findFiles(sessionId: string, pattern: string, basePath?: string): Promise<FindResponse> {
  const params = new URLSearchParams({ pattern })
  if (basePath) params.set("basePath", basePath)
  const res = await fetch(`/api/v1/sessions/${sessionId}/fs/find?${params}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to find files")
  }
  return res.json()
}

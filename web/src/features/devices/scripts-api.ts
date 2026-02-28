export interface ScriptFile {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface ScriptRunResult {
  id: string
  fileId: string
  fileName: string
  output: unknown[]
  status: string
  timestamp: number
  error?: string
}

export async function fetchDeviceScripts(deviceId: string): Promise<{ files: ScriptFile[] }> {
  const res = await fetch(`/api/v1/devices/${deviceId}/scripts`)
  if (!res.ok) throw new Error('Failed to fetch scripts')
  return res.json()
}

export async function upsertDeviceScript(
  deviceId: string,
  name: string,
  content: string
): Promise<ScriptFile> {
  const res = await fetch(`/api/v1/devices/${deviceId}/scripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to save script')
  }
  return res.json()
}

export async function deleteDeviceScript(deviceId: string, scriptId: string): Promise<void> {
  const res = await fetch(`/api/v1/devices/${deviceId}/scripts/${scriptId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete script')
}

export async function runScriptByName(sessionId: string, name: string): Promise<ScriptRunResult> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/scripts/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to run script')
  }
  return res.json()
}

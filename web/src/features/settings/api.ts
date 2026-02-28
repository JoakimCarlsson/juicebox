export interface AvailableModel {
  id: string
  name: string
  provider: string
}

export async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch('/api/v1/settings')
  if (!res.ok) throw new Error('Failed to fetch settings')
  return res.json()
}

export async function updateSettings(
  data: Record<string, string>
): Promise<Record<string, string>> {
  const res = await fetch('/api/v1/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update settings')
  return res.json()
}

export async function fetchAvailableModels(): Promise<AvailableModel[]> {
  const res = await fetch('/api/v1/settings/models')
  if (!res.ok) throw new Error('Failed to fetch models')
  const data = await res.json()
  return data.models
}

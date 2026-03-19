export async function fetchDeviceMessages(deviceId: string, limit = 500, offset = 0) {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/data/messages?limit=${limit}&offset=${offset}`
  )
  if (!res.ok) throw new Error('Failed to fetch device messages')
  return res.json()
}

export async function fetchDeviceLogs(deviceId: string, limit = 5000, offset = 0) {
  const res = await fetch(`/api/v1/devices/${deviceId}/data/logs?limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch device logs')
  return res.json()
}

export async function fetchDeviceCrashes(deviceId: string, limit = 500, offset = 0) {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/data/crashes?limit=${limit}&offset=${offset}`
  )
  if (!res.ok) throw new Error('Failed to fetch device crashes')
  return res.json()
}

export async function fetchDeviceCrypto(deviceId: string, limit = 500, offset = 0) {
  const res = await fetch(`/api/v1/devices/${deviceId}/data/crypto?limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch device crypto')
  return res.json()
}

export async function fetchDeviceClipboard(deviceId: string, limit = 500, offset = 0) {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/data/clipboard?limit=${limit}&offset=${offset}`
  )
  if (!res.ok) throw new Error('Failed to fetch device clipboard')
  return res.json()
}

async function clearData(deviceId: string, type: string) {
  const res = await fetch(`/api/v1/devices/${deviceId}/data/${type}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to clear ${type}`)
}

export const clearDeviceMessages = (id: string) => clearData(id, 'messages')
export const clearDeviceLogs = (id: string) => clearData(id, 'logs')
export const clearDeviceCrashes = (id: string) => clearData(id, 'crashes')
export const clearDeviceCrypto = (id: string) => clearData(id, 'crypto')
export const clearDeviceClipboard = (id: string) => clearData(id, 'clipboard')
export const clearDeviceFlutterChannels = (id: string) => clearData(id, 'flutter-channels')
export const clearDeviceFindings = (id: string) => clearData(id, 'findings')

export async function fetchDeviceFlutterChannels(deviceId: string, limit = 500, offset = 0) {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/data/flutter-channels?limit=${limit}&offset=${offset}`
  )
  if (!res.ok) throw new Error('Failed to fetch flutter channels')
  return res.json()
}

export async function fetchDeviceFindings(deviceId: string) {
  const res = await fetch(`/api/v1/devices/${deviceId}/data/findings`)
  if (!res.ok) throw new Error('Failed to fetch findings')
  return res.json()
}

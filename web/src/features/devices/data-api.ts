export async function fetchDeviceMessages(deviceId: string, limit = 500, offset = 0) {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/data/messages?limit=${limit}&offset=${offset}`
  )
  if (!res.ok) throw new Error('Failed to fetch device messages')
  return res.json()
}

export async function fetchDeviceLogs(deviceId: string, limit = 5000, offset = 0) {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/data/logs?limit=${limit}&offset=${offset}`
  )
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
  const res = await fetch(
    `/api/v1/devices/${deviceId}/data/crypto?limit=${limit}&offset=${offset}`
  )
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

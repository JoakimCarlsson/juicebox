import type {
  App,
  ConnectDeviceResponse,
  Device,
  DeviceInfo,
  Process,
  SpawnResponse,
} from '@/types/device'
import type { EvasionConfig } from '@/types/session'

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch('/api/v1/devices')
  if (!res.ok) throw new Error('Failed to fetch devices')
  const data = await res.json()
  return data.devices
}

export async function fetchApps(deviceId: string): Promise<App[]> {
  const res = await fetch(`/api/v1/devices/${deviceId}/apps`)
  if (!res.ok) throw new Error('Failed to fetch apps')
  const data = await res.json()
  return data.apps
}

export async function fetchProcesses(deviceId: string): Promise<Process[]> {
  const res = await fetch(`/api/v1/devices/${deviceId}/processes`)
  if (!res.ok) throw new Error('Failed to fetch processes')
  const data = await res.json()
  return data.processes
}

export async function fetchDeviceInfo(deviceId: string): Promise<DeviceInfo> {
  const res = await fetch(`/api/v1/devices/${deviceId}/info`)
  if (!res.ok) throw new Error('Failed to fetch device info')
  return res.json()
}

export async function connectDevice(deviceId: string): Promise<ConnectDeviceResponse> {
  const res = await fetch(`/api/v1/devices/${deviceId}/connect`, {
    method: 'POST',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to connect device')
  }
  return res.json()
}

export async function disconnectDevice(deviceId: string): Promise<void> {
  const res = await fetch(`/api/v1/devices/${deviceId}/disconnect`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to disconnect device')
  }
}

export async function spawnApp(
  deviceId: string,
  bundleId: string,
  evasion?: EvasionConfig
): Promise<SpawnResponse> {
  const res = await fetch(`/api/v1/devices/${deviceId}/spawn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bundleId, evasion }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to spawn app')
  }
  return res.json()
}

export async function attachApp(
  deviceId: string,
  bundleId: string,
  sessionId?: string,
  evasion?: EvasionConfig
): Promise<SpawnResponse> {
  const res = await fetch(`/api/v1/devices/${deviceId}/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bundleId, sessionId, evasion }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to attach to app')
  }
  return res.json()
}

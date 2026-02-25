import type { App, Device, DeviceInfo, Process } from '@/types/device'

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

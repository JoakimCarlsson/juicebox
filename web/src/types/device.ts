export interface Device {
  id: string
  name: string
  type: string
  platform: string
}

export interface App {
  identifier: string
  name: string
  pid: number
}

export interface Process {
  pid: number
  name: string
}

export interface DeviceInfo {
  name: string
  id: string
  type: string
  os: Record<string, unknown>
  platform: string
  arch: string
  access: string
}

export interface ConnectDeviceResponse {
  deviceId: string
  platform: string
  capabilities: string[]
  proxyPort: number
}

export interface SpawnResponse {
  sessionId: string
  pid: number
  capabilities: string[]
}

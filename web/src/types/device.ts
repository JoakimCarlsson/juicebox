export interface Device {
  id: string
  name: string
  type: string
}

export interface App {
  identifier: string
  name: string
  pid: number
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

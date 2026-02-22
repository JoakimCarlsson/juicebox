export interface AttachResponse {
  sessionId: string
  pid: number
}

export interface HttpMessage {
  id: string
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody?: string | null
  requestBodyEncoding?: string
  requestBodySize?: number
  statusCode: number
  responseHeaders: Record<string, string>
  responseBody?: string | null
  responseBodyEncoding?: string
  responseBodySize?: number
  duration?: number
  timestamp: number
}

export interface AgentMessage {
  type: string
  payload?: unknown
}

export interface DeviceEnvelope {
  type: string
  sessionId?: string
  payload?: unknown
}

export interface LogEntry {
  level: "info" | "warn" | "error"
  source: string
  message: string
}

export interface LogcatEntry {
  id: string
  timestamp: string
  pid: number
  tid: number
  level: "V" | "D" | "I" | "W" | "E" | "F"
  tag: string
  message: string
}

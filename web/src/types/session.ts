export interface AttachResponse {
  sessionId: string
  pid: number
  capabilities: string[]
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

export interface SessionSummary {
  id: string
  deviceId: string
  bundleId: string
  pid: number
  name: string
  platform: string
  startedAt: number
  endedAt: number | null
  httpCount: number
  logcatCount: number
  capabilities: string[]
}

export interface SessionsResponse {
  sessions: SessionSummary[]
  total: number
}

export interface MessagesResponse {
  messages: HttpMessage[]
  total: number
}

export interface LogsResponse {
  entries: LogcatEntry[]
  total: number
}

export interface InterceptRule {
  id: string
  enabled: boolean
  host?: string
  pathPattern?: string
  method?: string
  contentType?: string
}

export interface PendingRequest {
  id: string
  phase: "request" | "response"
  method: string
  url: string
  headers: Record<string, string>
  body?: string | null
  bodyEncoding?: string
  timestamp: number
  statusCode?: number
  responseHeaders?: Record<string, string>
  responseBody?: string | null
  responseBodyEncoding?: string
}

export interface InterceptState {
  enabled: boolean
  rules: InterceptRule[]
  pendingCount: number
}

export interface InterceptDecision {
  requestId: string
  action: "forward" | "modify" | "drop"
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
  statusCode?: number
  responseHeaders?: Record<string, string>
  responseBody?: string
}

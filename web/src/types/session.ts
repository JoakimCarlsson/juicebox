export interface AttachResponse {
  sessionId: string
  pid: number
}

export interface HttpMessage {
  id: string
  method: string
  url: string
  requestHeaders: Record<string, string>
  statusCode: number
  responseHeaders: Record<string, string>
  timestamp: number
}

export interface AgentMessage {
  type: string
  payload?: unknown
}

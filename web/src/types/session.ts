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
  requestBodySize?: number
  statusCode: number
  responseHeaders: Record<string, string>
  responseBody?: string | null
  responseBodySize?: number
  duration?: number
  timestamp: number
}

export interface AgentMessage {
  type: string
  payload?: unknown
}

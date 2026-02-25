export interface ChatStatusResponse {
  configured: boolean
}

export interface ChatHistoryPart {
  type: 'text' | 'tool_call'
  content?: string
  id?: string
  name?: string
  status?: string
  result?: string
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  parts?: ChatHistoryPart[]
}

export interface ChatHistoryResponse {
  messages: ChatHistoryMessage[]
}

export type SSEEvent =
  | { type: 'content'; data: { delta: string } }
  | { type: 'tool_start'; data: { name: string; id: string } }
  | { type: 'tool_end'; data: { name: string; id: string; result: string } }
  | { type: 'edit_applied'; data: { success: boolean } }
  | { type: 'edit_failed'; data: { error: string } }
  | { type: 'done'; data: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; data: { message: string } }

export async function fetchChatStatus(sessionId: string): Promise<ChatStatusResponse> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/chat/status`)
  if (!res.ok) throw new Error('Failed to fetch chat status')
  return res.json()
}

export async function fetchChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/chat/history`)
  if (!res.ok) throw new Error('Failed to fetch chat history')
  return res.json()
}

export function streamChat(
  sessionId: string,
  message: string,
  onEvent: (event: SSEEvent) => void
): AbortController {
  const controller = new AbortController()

  fetch(`/api/v1/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        onEvent({
          type: 'error',
          data: { message: err.error || 'Request failed' },
        })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6))
              onEvent({ type: currentEvent, data } as SSEEvent)
            } catch {
              // skip malformed data
            }
            currentEvent = ''
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onEvent({
          type: 'error',
          data: { message: err.message || 'Connection failed' },
        })
      }
    })

  return controller
}

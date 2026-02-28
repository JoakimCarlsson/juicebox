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

export async function fetchChatStatus(deviceId: string): Promise<ChatStatusResponse> {
  const res = await fetch(`/api/v1/devices/${deviceId}/chat/status`)
  if (!res.ok) throw new Error('Failed to fetch chat status')
  return res.json()
}

export async function fetchChatHistory(
  deviceId: string,
  conversationId: string
): Promise<ChatHistoryResponse> {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/chat/history?conversationId=${encodeURIComponent(conversationId)}`
  )
  if (!res.ok) throw new Error('Failed to fetch chat history')
  return res.json()
}

export interface Conversation {
  id: string
  device_id: string
  title: string
  model: string
  created_at: number
  updated_at: number
}

export async function fetchConversations(
  deviceId: string
): Promise<Conversation[]> {
  const res = await fetch(`/api/v1/devices/${deviceId}/conversations`)
  if (!res.ok) throw new Error('Failed to fetch conversations')
  const data = await res.json()
  return data.conversations
}

export async function createConversation(
  deviceId: string,
  model: string
): Promise<Conversation> {
  const res = await fetch(`/api/v1/devices/${deviceId}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
  if (!res.ok) throw new Error('Failed to create conversation')
  return res.json()
}

export async function renameConversation(
  conversationId: string,
  title: string
): Promise<Conversation> {
  const res = await fetch(`/api/v1/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('Failed to rename conversation')
  return res.json()
}

export async function updateConversationModel(
  conversationId: string,
  model: string
): Promise<Conversation> {
  const res = await fetch(`/api/v1/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
  if (!res.ok) throw new Error('Failed to update conversation model')
  return res.json()
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`/api/v1/conversations/${conversationId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete conversation')
}

export function streamChat(
  deviceId: string,
  message: string,
  bundleId: string | undefined,
  model: string,
  conversationId: string,
  onEvent: (event: SSEEvent) => void
): AbortController {
  const controller = new AbortController()

  fetch(`/api/v1/devices/${deviceId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      model,
      conversationId,
      ...(bundleId ? { bundleId } : {}),
    }),
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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import {
  fetchChatStatus,
  fetchChatHistory,
  streamChat,
  type SSEEvent,
} from "@/features/chat/api"

export interface ToolCallInfo {
  name: string
  id: string
  status: "running" | "done"
  result?: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: ToolCallInfo[]
  isStreaming?: boolean
}

interface ChatPanelContextValue {
  isOpen: boolean
  messages: ChatMessage[]
  isStreaming: boolean
  configured: boolean | null
  provider: string
  panelRef: React.RefObject<PanelImperativeHandle | null>
  toggle: () => void
  sendMessage: (text: string) => void
  clearChat: () => void
}

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null)

let messageCounter = 0
function nextId() {
  return `msg-${++messageCounter}`
}

export function ChatPanelProvider({
  sessionId,
  children,
}: {
  sessionId: string
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [provider, setProvider] = useState("")
  const panelRef = useRef<PanelImperativeHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!sessionId) return
    fetchChatStatus(sessionId)
      .then((status) => {
        setConfigured(status.configured)
        setProvider(status.provider)
      })
      .catch(() => setConfigured(false))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || configured !== true) return
    fetchChatHistory(sessionId)
      .then((history) => {
        if (history.messages.length > 0) {
          setMessages(
            history.messages.map((m) => ({
              id: nextId(),
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          )
        }
      })
      .catch(() => {})
  }, [sessionId, configured])

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        panelRef.current?.collapse()
      } else {
        panelRef.current?.expand()
      }
      return !prev
    })
  }, [])

  const sendMessage = useCallback(
    (text: string) => {
      if (!sessionId || isStreaming || !text.trim()) return

      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        content: text.trim(),
      }
      const assistantId = nextId()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)

      const controller = streamChat(sessionId, text.trim(), (event: SSEEvent) => {
        switch (event.type) {
          case "content":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + event.data.delta }
                  : m,
              ),
            )
            break

          case "tool_start":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls || []),
                        {
                          name: event.data.name,
                          id: event.data.id,
                          status: "running" as const,
                        },
                      ],
                    }
                  : m,
              ),
            )
            break

          case "tool_end":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: (m.toolCalls || []).map((tc) =>
                        tc.id === event.data.id
                          ? {
                              ...tc,
                              status: "done" as const,
                              result: event.data.result,
                            }
                          : tc,
                      ),
                    }
                  : m,
              ),
            )
            break

          case "done":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            )
            setIsStreaming(false)
            break

          case "error":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content:
                        m.content ||
                        `Error: ${event.data.message}`,
                      isStreaming: false,
                    }
                  : m,
              ),
            )
            setIsStreaming(false)
            break
        }
      })

      abortRef.current = controller
    },
    [sessionId, isStreaming],
  )

  const clearChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setMessages([])
    setIsStreaming(false)
  }, [])

  return (
    <ChatPanelContext.Provider
      value={{
        isOpen,
        messages,
        isStreaming,
        configured,
        provider,
        panelRef,
        toggle,
        sendMessage,
        clearChat,
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  )
}

export function useChatPanel() {
  const ctx = useContext(ChatPanelContext)
  if (!ctx)
    throw new Error("useChatPanel must be used within ChatPanelProvider")
  return ctx
}

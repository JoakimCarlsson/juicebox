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
import { useScriptEditor } from "@/contexts/ScriptEditorContext"

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; status: "running" | "done"; result?: string }

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  parts?: MessagePart[]
  isStreaming?: boolean
}

interface ChatPanelContextValue {
  isOpen: boolean
  messages: ChatMessage[]
  isStreaming: boolean
  configured: boolean | null
  panelRef: React.RefObject<PanelImperativeHandle | null>
  toggle: () => void
  onPanelResize: (sizePercent: number) => void
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
  const [isOpen, setIsOpen] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const panelRef = useRef<PanelImperativeHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastExpandedSize = useRef(30)

  useEffect(() => {
    if (!sessionId) return
    fetchChatStatus(sessionId)
      .then((status) => {
        setConfigured(status.configured)
      })
      .catch(() => setConfigured(false))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || configured !== true) return
    fetchChatHistory(sessionId)
      .then((history) => {
        if (history.messages.length > 0) {
          setMessages(
            history.messages.map((m) => {
              const msg: ChatMessage = {
                id: nextId(),
                role: m.role as "user" | "assistant",
                content: m.content,
              }
              if (m.role === "assistant") {
                if (m.parts && m.parts.length > 0) {
                  msg.parts = m.parts.map((p): MessagePart => {
                    if (p.type === "tool_call") {
                      return {
                        type: "tool_call",
                        id: p.id || "",
                        name: p.name || "",
                        status: "done",
                        result: p.result,
                      }
                    }
                    return { type: "text", content: p.content || "" }
                  })
                } else {
                  msg.parts = [{ type: "text", content: m.content }]
                }
              }
              return msg
            }),
          )
        }
      })
      .catch(() => {})
  }, [sessionId, configured])

  const toggle = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.resize(lastExpandedSize.current)
    } else {
      panel.collapse()
    }
  }, [])

  const onPanelResize = useCallback((sizePercent: number) => {
    if (sizePercent === 0) {
      setIsOpen(false)
    } else {
      setIsOpen(true)
      lastExpandedSize.current = sizePercent
    }
  }, [])

  const scriptEditor = useScriptEditor()

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
        parts: [],
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)

      let accumulated = ""
      let cursor = 0
      let insideFileWrite: string | null = null
      let insideFileEdit: string | null = null

      const controller = streamChat(sessionId, text.trim(), (event: SSEEvent) => {
        switch (event.type) {
          case "content": {
            accumulated += event.data.delta

            while (cursor < accumulated.length) {
              if (!insideFileWrite && !insideFileEdit) {
                const remaining = accumulated.slice(cursor)
                const writeMatch = remaining.match(/<file-write\s+src="([^"]+)">\n?/)
                const editMatch = remaining.match(/<file-edit\s+src="([^"]+)">\n?/)

                if (writeMatch && writeMatch.index !== undefined) {
                  insideFileWrite = writeMatch[1]
                  cursor += writeMatch.index + writeMatch[0].length
                  scriptEditor.emit({ type: "file_write_start", name: writeMatch[1] })
                } else if (editMatch && editMatch.index !== undefined) {
                  insideFileEdit = editMatch[1]
                  cursor += editMatch.index + editMatch[0].length
                  scriptEditor.emit({ type: "file_edit_start", name: editMatch[1] })
                } else {
                  break
                }
              } else if (insideFileWrite) {
                const closeTag = "</file-write>"
                const closeIdx = accumulated.indexOf(closeTag, cursor)
                if (closeIdx !== -1) {
                  const content = accumulated.slice(cursor, closeIdx)
                  if (content) {
                    scriptEditor.emit({ type: "file_write_delta", name: insideFileWrite, delta: content })
                  }
                  scriptEditor.emit({ type: "file_write_end", name: insideFileWrite })
                  cursor = closeIdx + closeTag.length
                  insideFileWrite = null
                } else {
                  const safeEnd = accumulated.length - closeTag.length
                  if (safeEnd > cursor) {
                    const content = accumulated.slice(cursor, safeEnd)
                    scriptEditor.emit({ type: "file_write_delta", name: insideFileWrite, delta: content })
                    cursor = safeEnd
                  }
                  break
                }
              } else if (insideFileEdit) {
                const closeTag = "</file-edit>"
                const closeIdx = accumulated.indexOf(closeTag, cursor)
                if (closeIdx !== -1) {
                  scriptEditor.emit({ type: "file_edit_end", name: insideFileEdit })
                  cursor = closeIdx + closeTag.length
                  insideFileEdit = null
                } else {
                  break
                }
              }
            }

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const parts = [...(m.parts || [])]
                const last = parts[parts.length - 1]
                if (last && last.type === "text") {
                  parts[parts.length - 1] = { ...last, content: last.content + event.data.delta }
                } else {
                  parts.push({ type: "text", content: event.data.delta })
                }
                return { ...m, content: m.content + event.data.delta, parts }
              }),
            )
            break
          }

          case "tool_start": {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const parts: MessagePart[] = [
                  ...(m.parts || []),
                  { type: "tool_call", id: event.data.id, name: event.data.name, status: "running" },
                ]
                return { ...m, parts }
              }),
            )
            break
          }

          case "tool_end": {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const parts = (m.parts || []).map((p) =>
                  p.type === "tool_call" && p.id === event.data.id
                    ? { ...p, status: "done" as const, result: event.data.result }
                    : p,
                )
                return { ...m, parts }
              }),
            )
            break
          }

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
        panelRef,
        toggle,
        onPanelResize,
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

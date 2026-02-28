import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import {
  fetchChatStatus,
  fetchChatHistory,
  streamChat,
  fetchConversations,
  createConversation,
  deleteConversation,
  renameConversation,
  updateConversationModel,
  type SSEEvent,
  type Conversation,
} from '@/features/chat/api'
import { fetchAvailableModels, type AvailableModel } from '@/features/settings/api'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'

export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; id: string; name: string; status: 'running' | 'done'; result?: string }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
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
  conversations: Conversation[]
  activeConversationId: string | null
  selectedModel: string
  availableModels: AvailableModel[]
  setSelectedModel: (model: string) => void
  switchConversation: (id: string) => void
  startNewConversation: () => void
  deleteConvo: (id: string) => void
  renameConvo: (id: string, title: string) => void
  refreshConversations: () => void
}

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null)

let messageCounter = 0
function nextId() {
  return `msg-${++messageCounter}`
}

export function ChatPanelProvider({
  deviceId,
  children,
}: {
  deviceId: string
  children: React.ReactNode
}) {
  const { selectedApp } = useAttachedApps()
  const bundleId = selectedApp?.bundleId
  const [isOpen, setIsOpen] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const panelRef = useRef<PanelImperativeHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastExpandedSize = useRef(30)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [selectedModel, setSelectedModelState] = useState('')
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const skipNextHistoryLoad = useRef(false)

  useEffect(() => {
    if (!deviceId) return
    fetchChatStatus(deviceId)
      .then((status) => setConfigured(status.configured))
      .catch(() => setConfigured(false))
  }, [deviceId])

  useEffect(() => {
    if (configured !== true || !deviceId) return
    Promise.all([fetchAvailableModels(), fetchConversations(deviceId)])
      .then(([models, convos]) => {
        setAvailableModels(models)
        setConversations(convos)
        if (convos.length > 0) {
          setActiveConversationId(convos[0].id)
          const savedModel = convos[0].model
          if (savedModel && models.some((m) => m.id === savedModel)) {
            setSelectedModelState(savedModel)
          } else if (models.length > 0) {
            setSelectedModelState(models[0].id)
          }
        } else if (models.length > 0) {
          setSelectedModelState(models[0].id)
        }
      })
      .catch(() => {})
  }, [deviceId, configured])

  const refreshConversations = useCallback(() => {
    if (!deviceId) return
    fetchConversations(deviceId)
      .then((convos) => setConversations(convos))
      .catch(() => {})
  }, [deviceId])

  const loadHistory = useCallback(
    (conversationId: string) => {
      if (!deviceId) return
      fetchChatHistory(deviceId, conversationId)
        .then((history) => {
          if (history.messages.length > 0) {
            setMessages(
              history.messages.map((m) => {
                const msg: ChatMessage = {
                  id: nextId(),
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                }
                if (m.role === 'assistant') {
                  if (m.parts && m.parts.length > 0) {
                    msg.parts = m.parts.map((p): MessagePart => {
                      if (p.type === 'tool_call') {
                        return {
                          type: 'tool_call',
                          id: p.id || '',
                          name: p.name || '',
                          status: 'done',
                          result: p.result,
                        }
                      }
                      return { type: 'text', content: p.content || '' }
                    })
                  } else {
                    msg.parts = [{ type: 'text', content: m.content }]
                  }
                }
                return msg
              })
            )
          } else {
            setMessages([])
          }
        })
        .catch(() => setMessages([]))
    },
    [deviceId]
  )

  useEffect(() => {
    if (!activeConversationId) return

    if (skipNextHistoryLoad.current) {
      skipNextHistoryLoad.current = false
    } else {
      loadHistory(activeConversationId)
    }

    const convo = conversations.find((c) => c.id === activeConversationId)
    if (convo?.model && availableModels.some((m) => m.id === convo.model)) {
      setSelectedModelState(convo.model)
    } else if (availableModels.length > 0 && !selectedModel) {
      setSelectedModelState(availableModels[0].id)
    }
  }, [activeConversationId, loadHistory, conversations, availableModels])

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

  const switchConversation = useCallback(
    (id: string) => {
      if (isStreaming) return
      setActiveConversationId(id)
    },
    [isStreaming]
  )

  const startNewConversation = useCallback(async () => {
    if (!deviceId || isStreaming) return
    try {
      const convo = await createConversation(deviceId, selectedModel)
      setConversations((prev) => [convo, ...prev])
      skipNextHistoryLoad.current = true
      setActiveConversationId(convo.id)
      setMessages([])
    } catch {}
  }, [deviceId, isStreaming, selectedModel])

  const deleteConvo = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id)
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (activeConversationId === id) {
          setActiveConversationId(null)
          setMessages([])
        }
      } catch {}
    },
    [activeConversationId]
  )

  const renameConvo = useCallback(async (id: string, title: string) => {
    try {
      const updated = await renameConversation(id, title)
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)))
    } catch {}
  }, [])

  const setSelectedModel = useCallback(
    (model: string) => {
      setSelectedModelState(model)
      if (activeConversationId) {
        updateConversationModel(activeConversationId, model).catch(() => {})
      }
    },
    [activeConversationId]
  )

  const sendMessage = useCallback(
    (text: string) => {
      if (!deviceId || isStreaming || !text.trim() || !selectedModel) return

      let convoId = activeConversationId

      if (!convoId) {
        createConversation(deviceId, selectedModel)
          .then((convo) => {
            setConversations((prev) => [convo, ...prev])
            skipNextHistoryLoad.current = true
            setActiveConversationId(convo.id)
            doSend(text, convo.id)
          })
          .catch(() => {})
        return
      }

      doSend(text, convoId)
    },
    [deviceId, bundleId, isStreaming, selectedModel, activeConversationId]
  )

  function doSend(text: string, convoId: string) {
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: text.trim(),
    }
    const assistantId = nextId()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      parts: [],
      isStreaming: true,
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    const controller = streamChat(
      deviceId,
      text.trim(),
      bundleId,
      selectedModel,
      convoId,
      (event: SSEEvent) => {
        switch (event.type) {
          case 'content': {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const parts = [...(m.parts || [])]
                const last = parts[parts.length - 1]
                if (last && last.type === 'text') {
                  parts[parts.length - 1] = { ...last, content: last.content + event.data.delta }
                } else {
                  parts.push({ type: 'text', content: event.data.delta })
                }
                return { ...m, content: m.content + event.data.delta, parts }
              })
            )
            break
          }

          case 'tool_start': {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const parts: MessagePart[] = [
                  ...(m.parts || []),
                  {
                    type: 'tool_call',
                    id: event.data.id,
                    name: event.data.name,
                    status: 'running',
                  },
                ]
                return { ...m, parts }
              })
            )
            break
          }

          case 'tool_end': {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const parts = (m.parts || []).map((p) =>
                  p.type === 'tool_call' && p.id === event.data.id
                    ? { ...p, status: 'done' as const, result: event.data.result }
                    : p
                )
                return { ...m, parts }
              })
            )
            break
          }

          case 'edit_applied':
          case 'edit_failed':
            break

          case 'done':
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
            )
            setIsStreaming(false)
            refreshConversations()
            break

          case 'error':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: m.content || `Error: ${event.data.message}`,
                      isStreaming: false,
                    }
                  : m
              )
            )
            setIsStreaming(false)
            break
        }
      }
    )

    abortRef.current = controller
  }

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
        conversations,
        activeConversationId,
        selectedModel,
        availableModels,
        setSelectedModel,
        switchConversation,
        startNewConversation,
        deleteConvo,
        renameConvo,
        refreshConversations,
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  )
}

export function useChatPanel() {
  const ctx = useContext(ChatPanelContext)
  if (!ctx) throw new Error('useChatPanel must be used within ChatPanelProvider')
  return ctx
}

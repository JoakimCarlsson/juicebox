import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useChatPanel } from '@/contexts/ChatPanelContext'
import type { ChatMessage as ChatMessageType, MessagePart } from '@/contexts/ChatPanelContext'
import {
  UserMessage,
  TextBlock,
  ToolCallBlock,
  StreamingCursor,
  ThinkingIndicator,
} from '@/components/chat/ChatMessage'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Send,
  Square,
  BotMessageSquare,
  Settings,
  Plus,
  ChevronDown,
  MessageSquare,
  Trash2,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type RenderItem =
  | { kind: 'user'; key: string; content: string }
  | { kind: 'text'; key: string; content: string; isStreaming: boolean; isLast: boolean }
  | { kind: 'tool_call'; key: string; part: Extract<MessagePart, { type: 'tool_call' }> }
  | { kind: 'cursor'; key: string }

function flattenMessages(messages: ChatMessageType[]): RenderItem[] {
  const items: RenderItem[] = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      items.push({ kind: 'user', key: msg.id, content: msg.content })
      continue
    }
    const parts = msg.parts
    if (!parts || parts.length === 0) {
      if (msg.content) {
        items.push({
          kind: 'text',
          key: msg.id,
          content: msg.content,
          isStreaming: false,
          isLast: false,
        })
      }
      continue
    }
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      if (part.type === 'text') {
        if (!part.content) continue
        items.push({
          kind: 'text',
          key: `${msg.id}-${i}`,
          content: part.content,
          isStreaming: !!msg.isStreaming && isLast,
          isLast,
        })
      } else {
        items.push({ kind: 'tool_call', key: `${msg.id}-${part.id}`, part })
      }
    }
    if (msg.isStreaming && parts[parts.length - 1]?.type !== 'text') {
      items.push({ kind: 'cursor', key: `${msg.id}-cursor` })
    }
  }
  return items
}

function ModelPicker() {
  const { selectedModel, setSelectedModel, availableModels } = useChatPanel()

  if (availableModels.length === 0) return null

  const current = availableModels.find((m) => m.id === selectedModel)
  const grouped = new Map<string, typeof availableModels>()
  for (const m of availableModels) {
    const list = grouped.get(m.provider) || []
    list.push(m)
    grouped.set(m.provider, list)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted">
          <span className="truncate max-w-[140px]">{current?.name || selectedModel}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {[...grouped.entries()].map(([provider, models], idx) => (
          <div key={provider}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {provider}
            </DropdownMenuLabel>
            {models.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                className={cn('text-xs', m.id === selectedModel && 'bg-accent')}
              >
                {m.name}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ConversationList() {
  const {
    conversations,
    activeConversationId,
    switchConversation,
    startNewConversation,
    deleteConvo,
    renameConvo,
    isStreaming,
  } = useChatPanel()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  function startRename(id: string, currentTitle: string) {
    setEditingId(id)
    setEditTitle(currentTitle)
  }

  function commitRename() {
    if (editingId && editTitle.trim()) {
      renameConvo(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  if (conversations.length === 0) return null

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Conversations
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={startNewConversation}
          disabled={isStreaming}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="max-h-40 overflow-auto px-1 pb-1 space-y-px">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex items-center gap-1 rounded px-2 py-1 cursor-pointer text-xs transition-colors',
              c.id === activeConversationId
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            onClick={() => switchConversation(c.id)}
          >
            <MessageSquare className="h-3 w-3 shrink-0" />
            {editingId === c.id ? (
              <input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="flex-1 bg-transparent text-xs outline-none min-w-0"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 truncate">{c.title || 'New conversation'}</span>
            )}
            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  startRename(c.id, c.title)
                }}
                className="p-0.5 rounded hover:bg-background/50"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConvo(c.id)
                }}
                className="p-0.5 rounded hover:bg-background/50 text-destructive"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChatPanel() {
  const {
    messages,
    isStreaming,
    isThinking,
    configured,
    sendMessage,
    stopStreaming,
    startNewConversation,
    activeConversationId,
    selectedModel,
  } = useChatPanel()

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  function handleSend() {
    if (!input.trim() || isStreaming || !selectedModel) return
    sendMessage(input)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  if (configured === false) {
    return (
      <div className="flex h-full flex-col bg-background border-l border-border">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-3 max-w-[280px]">
            <Settings className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">AI assistant not configured</p>
            <p className="text-xs text-muted-foreground">
              Add an API key in settings to enable the AI assistant.
            </p>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Settings className="h-3 w-3" />
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background border-l border-border">
      <div className="flex items-center justify-end px-2 py-1.5 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={startNewConversation}
          disabled={isStreaming}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ConversationList />

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {!activeConversationId && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="text-center space-y-2">
              <BotMessageSquare className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Ask anything about this session</p>
              <p className="text-xs text-muted-foreground/60">
                Start typing to create a new conversation
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="text-center space-y-2">
              <BotMessageSquare className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Ask anything about this session</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {flattenMessages(messages).map((item) => {
              switch (item.kind) {
                case 'user':
                  return <UserMessage key={item.key} content={item.content} />
                case 'text':
                  return (
                    <TextBlock
                      key={item.key}
                      content={item.content}
                      isStreaming={item.isStreaming}
                    />
                  )
                case 'tool_call':
                  return <ToolCallBlock key={item.key} part={item.part} />
                case 'cursor':
                  return <StreamingCursor key={item.key} />
              }
            })}
            {isThinking && <ThinkingIndicator />}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border">
        <div className="flex items-end gap-1.5 p-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this session..."
            disabled={configured !== true || !selectedModel}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          {isStreaming ? (
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={stopStreaming}>
              <Square className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || configured !== true || !selectedModel}
            >
              <Send className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="px-2 pb-1.5">
          <ModelPicker />
        </div>
      </div>
    </div>
  )
}

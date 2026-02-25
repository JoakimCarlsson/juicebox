import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { useChatPanel } from '@/contexts/ChatPanelContext'
import type { ChatMessage as ChatMessageType, MessagePart } from '@/contexts/ChatPanelContext'
import {
  UserMessage,
  TextBlock,
  ToolCallBlock,
  StreamingCursor,
} from '@/components/chat/ChatMessage'

import { Button } from '@/components/ui/button'
import { Send, BotMessageSquare, Settings } from 'lucide-react'

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

export function ChatPanel() {
  const { messages, isStreaming, configured, sendMessage } = useChatPanel()

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
    if (!input.trim() || isStreaming) return
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
              Set the following environment variables to enable:
            </p>
            <div className="text-left space-y-1">
              <code className="block text-[10px] bg-muted px-2 py-1 rounded font-mono">
                JUICEBOX_LLM_PROVIDER=openai
              </code>
              <code className="block text-[10px] bg-muted px-2 py-1 rounded font-mono">
                JUICEBOX_LLM_API_KEY=sk-...
              </code>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Supported: openai, anthropic, ollama
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background border-l border-border">
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {messages.length === 0 ? (
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
          </div>
        )}
      </div>

      <div className="p-2 shrink-0 border-t border-border">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this session..."
            disabled={isStreaming || configured !== true}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || configured !== true}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { Badge } from "@/components/ui/badge"
import { Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage as ChatMessageType } from "@/contexts/ChatPanelContext"

export function ChatMessage({ message }: { message: ChatMessageType }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-2.5 py-1.5 text-primary-foreground text-xs">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {message.toolCalls.map((tc) => (
            <Badge
              key={tc.id}
              variant="outline"
              className="text-[10px] gap-1 font-mono"
            >
              {tc.status === "running" ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Check className="h-2.5 w-2.5 text-green-500" />
              )}
              {tc.name}
            </Badge>
          ))}
        </div>
      )}
      {message.content && (
        <div
          className={cn(
            "min-w-0 max-w-full !text-xs prose prose-sm dark:prose-invert",
            "prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-md prose-pre:overflow-x-auto",
            "prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
            "prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
            "prose-table:my-2 prose-table:text-xs",
            "[&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full",
            "prose-hr:my-3",
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "")
                const code = String(children).replace(/\n$/, "")

                if (match) {
                  return (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        margin: 0,
                        borderRadius: "0.375rem",
                        fontSize: "0.75rem",
                      }}
                    >
                      {code}
                    </SyntaxHighlighter>
                  )
                }

                return (
                  <code
                    className="rounded bg-muted px-1 py-0.5 text-xs"
                    {...props}
                  >
                    {children}
                  </code>
                )
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { Loader2, Check, ChevronRight, FileCode, FileDiff } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MessagePart } from "@/contexts/ChatPanelContext"

const markdownComponents = {
  code({ className, children, ...props }: React.ComponentProps<"code">) {
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
      <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props}>
        {children}
      </code>
    )
  },
}

const proseClasses = cn(
  "min-w-0 max-w-full !text-xs prose prose-sm dark:prose-invert",
  "prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-md prose-pre:overflow-x-auto",
  "prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
  "prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
  "prose-table:my-2 prose-table:text-xs",
  "[&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full",
  "prose-hr:my-3",
)

export function ToolCallBlock({ part }: { part: Extract<MessagePart, { type: "tool_call" }> }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border border-border bg-muted/30 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => part.result && setExpanded(!expanded)}
      >
        {part.status === "running" ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <Check className="h-3 w-3 text-green-500 shrink-0" />
        )}
        <span className="font-mono text-muted-foreground">{part.name}</span>
        {part.result && (
          <ChevronRight className={cn(
            "h-3 w-3 ml-auto text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-90",
          )} />
        )}
      </button>
      {expanded && part.result && (
        <div className="border-t border-border px-2.5 py-2 max-h-48 overflow-auto">
          <pre className="whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
            {part.result}
          </pre>
        </div>
      )}
    </div>
  )
}

type ContentSegment =
  | { type: "text"; content: string }
  | { type: "file_write"; name: string; code: string; complete: boolean }
  | { type: "file_edit"; name: string; body: string; complete: boolean }

function parseContentSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  let remaining = content

  const tagRe = /<file-(write|edit)\s+src="([^"]*)"?[^>]*>/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tagRe.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: remaining.slice(lastIndex, match.index) })
    }

    const kind = match[1] as "write" | "edit"
    const name = match[2]
    const afterTag = remaining.slice(match.index + match[0].length)
    const closeTag = `</file-${kind}>`
    const closeIdx = afterTag.indexOf(closeTag)

    if (closeIdx !== -1) {
      const body = afterTag.slice(0, closeIdx).replace(/^\n/, "")
      segments.push(
        kind === "write"
          ? { type: "file_write", name, code: body, complete: true }
          : { type: "file_edit", name, body, complete: true },
      )
      lastIndex = match.index + match[0].length + closeIdx + closeTag.length
      tagRe.lastIndex = lastIndex
    } else {
      const body = afterTag.replace(/^\n/, "")
      segments.push(
        kind === "write"
          ? { type: "file_write", name, code: body, complete: false }
          : { type: "file_edit", name, body, complete: false },
      )
      lastIndex = remaining.length
      break
    }
  }

  if (lastIndex < remaining.length) {
    segments.push({ type: "text", content: remaining.slice(lastIndex) })
  }

  return segments
}

function FileWriteCard({ name, code, complete }: { name: string; code: string; complete: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border border-border bg-muted/30 text-xs my-1.5">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <span className="font-mono text-foreground">{name}</span>
        {!complete && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
        <ChevronRight className={cn(
          "h-3 w-3 ml-auto text-muted-foreground shrink-0 transition-transform",
          expanded && "rotate-90",
        )} />
      </button>
      {expanded && (
        <div className="border-t border-border overflow-auto max-h-64">
          <SyntaxHighlighter
            style={oneDark}
            language="typescript"
            PreTag="div"
            customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.7rem" }}
          >
            {code || " "}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  )
}

function FileEditCard({ name, body, complete }: { name: string; body: string; complete: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border border-border bg-muted/30 text-xs my-1.5">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <FileDiff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="font-mono text-foreground">{name}</span>
        <span className="text-muted-foreground ml-1">(edit)</span>
        {!complete && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
        <ChevronRight className={cn(
          "h-3 w-3 ml-auto text-muted-foreground shrink-0 transition-transform",
          expanded && "rotate-90",
        )} />
      </button>
      {expanded && (
        <div className="border-t border-border overflow-auto max-h-64 p-2 font-mono text-[10px]">
          {body.split("\n").map((line, i) => {
            const isSearch = line === "<<<<<<< SEARCH"
            const isSep = line === "======="
            const isReplace = line === ">>>>>>> REPLACE"
            if (isSearch || isSep || isReplace) {
              return (
                <div key={i} className="text-muted-foreground/60 select-none">
                  {line}
                </div>
              )
            }
            return <div key={i}>{line}</div>
          })}
        </div>
      )}
    </div>
  )
}

export function TextBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const segments = useMemo(() => parseContentSegments(content), [content])
  const hasOnlyText = segments.every((s) => s.type === "text")

  if (hasOnlyText) {
    return (
      <div className={proseClasses}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    )
  }

  return (
    <div>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case "text":
            return seg.content.trim() ? (
              <div key={i} className={proseClasses}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {seg.content}
                </ReactMarkdown>
              </div>
            ) : null
          case "file_write":
            return <FileWriteCard key={i} name={seg.name} code={seg.code} complete={seg.complete} />
          case "file_edit":
            return <FileEditCard key={i} name={seg.name} body={seg.body} complete={seg.complete} />
        }
      })}
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
      )}
    </div>
  )
}

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-primary px-2.5 py-1.5 text-primary-foreground text-xs">
        {content}
      </div>
    </div>
  )
}

export function StreamingCursor() {
  return <span className="inline-block w-1.5 h-4 bg-foreground animate-pulse" />
}

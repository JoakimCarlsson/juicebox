import { useState, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { Loader2, Check, ChevronRight, FileCode, FileDiff, FilePlus } from "lucide-react"
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

interface EditBlock {
  filename: string
  search: string
  replace: string
  isNew: boolean
  complete: boolean
}

type ContentSegment =
  | { type: "text"; content: string }
  | { type: "edit_block"; block: EditBlock }

const HEAD_RE = /^<{5,9} SEARCH>?\s*$/
const DIVIDER_RE = /^={5,9}\s*$/
const UPDATED_RE = /^>{5,9} REPLACE\s*$/

function parseEditBlocks(content: string): EditBlock[] {
  const lines = content.split("\n")
  const blocks: EditBlock[] = []
  let i = 0
  let currentFilename = ""

  while (i < lines.length) {
    const line = lines[i]

    if (HEAD_RE.test(line.trim())) {
      const filename = findFilename(lines, i)
      if (filename) currentFilename = filename
      if (!currentFilename) { i++; continue }

      i++
      const searchLines: string[] = []
      while (i < lines.length && !DIVIDER_RE.test(lines[i].trim())) {
        searchLines.push(lines[i])
        i++
      }

      if (i >= lines.length) break
      i++

      const replaceLines: string[] = []
      while (i < lines.length && !UPDATED_RE.test(lines[i].trim())) {
        replaceLines.push(lines[i])
        i++
      }

      const complete = i < lines.length && UPDATED_RE.test(lines[i].trim())
      if (complete) i++

      const search = searchLines.join("\n")
      const replace = replaceLines.join("\n")

      blocks.push({
        filename: currentFilename,
        search,
        replace,
        isNew: search.trim() === "",
        complete,
      })
      continue
    }
    i++
  }

  return blocks
}

function findFilename(lines: string[], headIdx: number): string {
  for (let j = headIdx - 1; j >= Math.max(0, headIdx - 3); j--) {
    const line = lines[j].trim()
    if (line.startsWith("```")) continue
    const candidate = line.replace(/^#+\s*/, "").replace(/:$/, "").replace(/[`*'"]/g, "").trim()
    if (candidate && !candidate.includes(" ") && (candidate.includes(".") || candidate.includes("/"))) {
      return candidate
    }
  }
  return ""
}

function parseContentSegments(content: string): ContentSegment[] {
  const blocks = parseEditBlocks(content)
  if (blocks.length === 0) {
    return [{ type: "text", content }]
  }

  const segments: ContentSegment[] = []
  let remaining = content

  for (const block of blocks) {
    const searchMarker = "<<<<<<< SEARCH"
    const idx = remaining.indexOf(searchMarker)
    if (idx === -1) continue

    let textBefore = remaining.slice(0, idx)
    const filenameLineIdx = textBefore.lastIndexOf(block.filename)
    if (filenameLineIdx !== -1) {
      textBefore = textBefore.slice(0, filenameLineIdx)
    }
    const fenceIdx = textBefore.lastIndexOf("```")
    if (fenceIdx !== -1 && fenceIdx > (filenameLineIdx ?? textBefore.length)) {
      textBefore = textBefore.slice(0, fenceIdx)
    }

    if (textBefore.trim()) {
      segments.push({ type: "text", content: textBefore })
    }

    segments.push({ type: "edit_block", block })

    const replaceEnd = ">>>>>>> REPLACE"
    const replaceIdx = remaining.indexOf(replaceEnd, idx)
    if (replaceIdx !== -1) {
      let cutEnd = replaceIdx + replaceEnd.length
      if (remaining[cutEnd] === "\n") cutEnd++
      if (remaining.slice(cutEnd).startsWith("```")) {
        const fenceEnd = remaining.indexOf("\n", cutEnd)
        cutEnd = fenceEnd !== -1 ? fenceEnd + 1 : remaining.length
      }
      remaining = remaining.slice(cutEnd)
    } else {
      remaining = ""
    }
  }

  if (remaining.trim()) {
    segments.push({ type: "text", content: remaining })
  }

  return segments
}

function EditBlockCard({ block }: { block: EditBlock }) {
  const [expanded, setExpanded] = useState(false)

  const Icon = block.isNew ? FilePlus : FileDiff
  const iconColor = block.isNew ? "text-green-400" : "text-amber-400"
  const label = block.isNew ? "new file" : "edit"

  return (
    <div className="rounded-md border border-border bg-muted/30 text-xs my-1.5">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", iconColor)} />
        <span className="font-mono text-foreground">{block.filename}</span>
        <span className="text-muted-foreground ml-1">({label})</span>
        {!block.complete && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
        <ChevronRight className={cn(
          "h-3 w-3 ml-auto text-muted-foreground shrink-0 transition-transform",
          expanded && "rotate-90",
        )} />
      </button>
      {expanded && (
        <div className="border-t border-border overflow-auto max-h-64 p-2 font-mono text-[10px] leading-relaxed">
          {block.isNew ? (
            block.replace.split("\n").map((line, i) => (
              <div key={i} className="text-green-400">
                <span className="select-none text-green-400/50 mr-2">+</span>{line}
              </div>
            ))
          ) : (
            <>
              {block.search.split("\n").map((line, i) => (
                <div key={`s${i}`} className="text-red-400 bg-red-500/5">
                  <span className="select-none text-red-400/50 mr-2">-</span>{line}
                </div>
              ))}
              {block.replace.split("\n").map((line, i) => (
                <div key={`r${i}`} className="text-green-400 bg-green-500/5">
                  <span className="select-none text-green-400/50 mr-2">+</span>{line}
                </div>
              ))}
            </>
          )}
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
          case "edit_block":
            return <EditBlockCard key={i} block={seg.block} />
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

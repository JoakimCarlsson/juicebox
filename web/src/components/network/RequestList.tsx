import { useCallback, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { HttpMessage } from "@/types/session"
import { parseUrl, statusColor, methodColor } from "./helpers"

export function RequestList({
  messages,
  selectedId,
  onSelect,
  autoScroll = true,
}: {
  messages: HttpMessage[]
  selectedId: string | null
  onSelect: (id: string) => void
  autoScroll?: boolean
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    isAtBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 30
  }, [])

  useEffect(() => {
    if (autoScroll && isAtBottom.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages.length, autoScroll])

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="h-full overflow-auto"
    >
      <table className="w-full">
        <thead className="sticky top-0 bg-background z-10">
          <tr className="border-b border-border">
            <th className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-16">
              Method
            </th>
            <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-14">
              Status
            </th>
            <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Host
            </th>
            <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Path
            </th>
          </tr>
        </thead>
        <tbody>
          {messages.map((msg) => {
            const { host, path } = parseUrl(msg.url)
            return (
              <tr
                key={msg.id}
                onClick={() => onSelect(msg.id)}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                  selectedId === msg.id && "bg-accent",
                )}
              >
                <td className="px-3 py-1.5">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "font-mono text-[10px] px-1.5 py-0",
                      methodColor(msg.method),
                    )}
                  >
                    {msg.method}
                  </Badge>
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={cn(
                      "text-xs font-mono font-medium",
                      statusColor(msg.statusCode),
                    )}
                  >
                    {msg.statusCode || "\u2014"}
                  </span>
                </td>
                <td className="px-2 py-1.5 max-w-0">
                  <span className="block truncate text-xs font-mono text-foreground">
                    {host}
                  </span>
                </td>
                <td className="px-2 py-1.5 max-w-0">
                  <span className="block truncate text-xs font-mono text-muted-foreground">
                    {path}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

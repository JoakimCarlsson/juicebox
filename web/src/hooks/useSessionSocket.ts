import { useCallback, useEffect, useRef, useState } from "react"
import type { AgentMessage } from "@/types/session"

interface UseSessionSocketReturn {
  messages: AgentMessage[]
  connected: boolean
  clear: () => void
}

export function useSessionSocket(
  sessionId: string | null,
): UseSessionSocketReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const clear = useCallback(() => {
    setMessages([])
  }, [])

  useEffect(() => {
    if (!sessionId) return

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/v1/ws/sessions/${sessionId}`,
    )
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg: AgentMessage = JSON.parse(event.data)
        setMessages((prev) => [...prev, msg])
      } catch {}
    }

    ws.onclose = () => {
      setConnected(false)
    }

    ws.onerror = () => {
      setConnected(false)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [sessionId])

  return { messages, connected, clear }
}

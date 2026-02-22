import { useCallback, useEffect, useState } from "react"
import { useDeviceSocket } from "@/contexts/DeviceSocketContext"
import type { AgentMessage, DeviceEnvelope } from "@/types/session"

interface UseSessionSocketReturn {
  messages: AgentMessage[]
  connected: boolean
  clear: () => void
}

export function useSessionSocket(
  sessionId: string | null,
): UseSessionSocketReturn {
  const { subscribe, connected } = useDeviceSocket()
  const [messages, setMessages] = useState<AgentMessage[]>([])

  const clear = useCallback(() => {
    setMessages([])
  }, [])

  useEffect(() => {
    if (!sessionId) return

    const unsub = subscribe(null, (envelope: DeviceEnvelope) => {
      if (envelope.sessionId !== sessionId) return
      setMessages((prev) => [
        ...prev,
        { type: envelope.type, payload: envelope.payload },
      ])
    })

    return unsub
  }, [subscribe, sessionId])

  return { messages, connected, clear }
}

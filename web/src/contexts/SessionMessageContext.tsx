import { createContext, useContext, useEffect, useState } from "react"
import { useDeviceSocket } from "@/contexts/DeviceSocketContext"
import type { AgentMessage, DeviceEnvelope } from "@/types/session"

interface SessionMessageContextValue {
  messages: AgentMessage[]
  connected: boolean
}

const SessionMessageContext = createContext<SessionMessageContextValue | null>(
  null,
)

interface SessionMessageProviderProps {
  sessionId: string
  children: React.ReactNode
}

export function SessionMessageProvider({
  sessionId,
  children,
}: SessionMessageProviderProps) {
  const { subscribe, connected } = useDeviceSocket()
  const [messages, setMessages] = useState<AgentMessage[]>([])

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

  return (
    <SessionMessageContext.Provider value={{ messages, connected }}>
      {children}
    </SessionMessageContext.Provider>
  )
}

export function useSessionMessages(): SessionMessageContextValue {
  const ctx = useContext(SessionMessageContext)
  if (!ctx)
    throw new Error(
      "useSessionMessages must be used within SessionMessageProvider",
    )
  return ctx
}

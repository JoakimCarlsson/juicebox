import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useDeviceSocket } from "@/contexts/DeviceSocketContext"
import type { AgentMessage, DeviceEnvelope } from "@/types/session"
import { fetchSessionMessages, fetchSessionLogs, fetchSessionCrashes } from "@/features/sessions/api"

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
  const prevConnected = useRef(false)
  const seenIds = useRef(new Set<string>())

  useEffect(() => {
    if (!sessionId) {
      setMessages([])
      seenIds.current = new Set()
    }
  }, [sessionId])

  const prevSourceId = useRef("")

  useEffect(() => {
    if (!connected || !sessionId) {
      prevConnected.current = connected
      return
    }

    const isReconnect = connected && !prevConnected.current
    const isNewSource = sessionId !== prevSourceId.current

    prevConnected.current = connected

    if (!isReconnect && !isNewSource) return
    prevSourceId.current = sessionId

    Promise.all([
      fetchSessionMessages(sessionId).catch(() => null),
      fetchSessionLogs(sessionId).catch(() => null),
      fetchSessionCrashes(sessionId).catch(() => null),
    ]).then(([msgResp, logResp, crashResp]) => {
      const historical: AgentMessage[] = []

      if (msgResp?.messages) {
        for (const m of msgResp.messages) {
          if (!seenIds.current.has(m.id)) {
            seenIds.current.add(m.id)
            historical.push({ type: "http", payload: m })
          }
        }
      }

      if (logResp?.entries) {
        for (const e of logResp.entries) {
          if (!seenIds.current.has(e.id)) {
            seenIds.current.add(e.id)
            historical.push({ type: "logcat", payload: e })
          }
        }
      }

      if (crashResp?.crashes) {
        for (const c of crashResp.crashes) {
          if (!seenIds.current.has(c.id)) {
            seenIds.current.add(c.id)
            historical.push({ type: "crash", payload: c })
          }
        }
      }

      if (historical.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(
            prev
              .map((m) => {
                const p = m.payload as { id?: string } | undefined
                return p?.id
              })
              .filter(Boolean),
          )
          const newMsgs = historical.filter((h) => {
            const p = h.payload as { id?: string } | undefined
            return p?.id && !existingIds.has(p.id)
          })
          return [...newMsgs, ...prev]
        })
      }
    })
  }, [connected, sessionId])

  useEffect(() => {
    if (!sessionId) return

    const unsub = subscribe(null, (envelope: DeviceEnvelope) => {
      if (envelope.sessionId !== sessionId) return

      const payload = envelope.payload as { id?: string } | undefined
      if (payload?.id) {
        if (seenIds.current.has(payload.id)) return
        seenIds.current.add(payload.id)
      }

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

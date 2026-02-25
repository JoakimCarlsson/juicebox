import { useCallback, useEffect, useState } from 'react'
import { useDeviceSocket } from '@/contexts/DeviceSocketContext'
import type { DeviceEnvelope } from '@/types/session'

interface UseDeviceMessagesOptions {
  type: string
  sessionId?: string | null
}

export function useDeviceMessages<T = unknown>({ type, sessionId }: UseDeviceMessagesOptions) {
  const { subscribe, connected } = useDeviceSocket()
  const [messages, setMessages] = useState<Array<{ sessionId?: string; payload: T }>>([])

  const clear = useCallback(() => setMessages([]), [])

  useEffect(() => {
    const unsub = subscribe(type, (envelope: DeviceEnvelope) => {
      if (sessionId && envelope.sessionId !== sessionId) return
      setMessages((prev) => [
        ...prev,
        {
          sessionId: envelope.sessionId,
          payload: envelope.payload as T,
        },
      ])
    })
    return unsub
  }, [subscribe, type, sessionId])

  return { messages, connected, clear }
}

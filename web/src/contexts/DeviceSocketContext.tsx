import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { DeviceEnvelope } from '@/types/session'

type Listener = (envelope: DeviceEnvelope) => void
type Unsubscribe = () => void

interface DeviceSocketContextValue {
  connected: boolean
  subscribe: (type: string | null, listener: Listener) => Unsubscribe
  send: (data: unknown) => void
}

const DeviceSocketContext = createContext<DeviceSocketContextValue | null>(null)

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]

interface DeviceSocketProviderProps {
  deviceId: string
  children: React.ReactNode
}

export function DeviceSocketProvider({ deviceId, children }: DeviceSocketProviderProps) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const listenersRef = useRef<Map<number, { type: string | null; fn: Listener }>>(new Map())
  const nextIdRef = useRef(0)

  useEffect(() => {
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    function connect() {
      if (disposed) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws/devices/${deviceId}`)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectAttempt = 0
      }

      ws.onclose = () => {
        setConnected(false)
        if (disposed) return
        const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
        reconnectTimer = setTimeout(() => {
          reconnectAttempt++
          connect()
        }, delay)
      }

      ws.onerror = () => {
        setConnected(false)
      }

      ws.onmessage = (event) => {
        try {
          const envelope: DeviceEnvelope = JSON.parse(event.data)
          for (const [, entry] of listenersRef.current) {
            if (entry.type === null || entry.type === envelope.type) {
              entry.fn(envelope)
            }
          }
        } catch {}
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [deviceId])

  const subscribe = useCallback((type: string | null, fn: Listener): Unsubscribe => {
    const id = nextIdRef.current++
    listenersRef.current.set(id, { type, fn })
    return () => {
      listenersRef.current.delete(id)
    }
  }, [])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return (
    <DeviceSocketContext.Provider value={{ connected, subscribe, send }}>
      {children}
    </DeviceSocketContext.Provider>
  )
}

export function useDeviceSocket(): DeviceSocketContextValue {
  const ctx = useContext(DeviceSocketContext)
  if (!ctx) throw new Error('useDeviceSocket must be used within DeviceSocketProvider')
  return ctx
}

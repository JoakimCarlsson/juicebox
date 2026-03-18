import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useDeviceSocket } from '@/contexts/DeviceSocketContext'
import { useParams } from '@tanstack/react-router'
import {
  fetchDeviceMessages,
  fetchDeviceLogs,
  fetchDeviceCrashes,
  fetchDeviceCrypto,
  fetchDeviceClipboard,
  fetchDeviceFlutterChannels,
  fetchDeviceFindings,
  clearDeviceMessages,
  clearDeviceLogs,
  clearDeviceCrashes,
  clearDeviceCrypto,
  clearDeviceClipboard,
  clearDeviceFlutterChannels,
  clearDeviceFindings,
} from '@/features/devices/data-api'
import type { AgentMessage, DeviceEnvelope } from '@/types/session'

const clearApiFns: Record<string, (id: string) => Promise<void>> = {
  http: clearDeviceMessages,
  logcat: clearDeviceLogs,
  crash: clearDeviceCrashes,
  crypto: clearDeviceCrypto,
  clipboard: clearDeviceClipboard,
  flutter_channel: clearDeviceFlutterChannels,
  finding: clearDeviceFindings,
}

interface DeviceMessageContextValue {
  messages: AgentMessage[]
  connected: boolean
  clearByType: (type: string) => Promise<void>
}

const DeviceMessageContext = createContext<DeviceMessageContextValue | null>(null)

export function DeviceMessageProvider({ children }: { children: React.ReactNode }) {
  const { deviceId } = useParams({ strict: false }) as { deviceId?: string }
  const { subscribe, connected } = useDeviceSocket()
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const seenIds = useRef(new Set<string>())
  const hydratedRef = useRef(false)
  const prevConnected = useRef(false)

  useEffect(() => {
    if (!connected || !deviceId) {
      prevConnected.current = connected
      return
    }

    const isReconnect = connected && !prevConnected.current
    prevConnected.current = connected

    if (!isReconnect && hydratedRef.current) return
    hydratedRef.current = true

    Promise.all([
      fetchDeviceMessages(deviceId).catch(() => null),
      fetchDeviceLogs(deviceId).catch(() => null),
      fetchDeviceCrashes(deviceId).catch(() => null),
      fetchDeviceCrypto(deviceId).catch(() => null),
      fetchDeviceClipboard(deviceId).catch(() => null),
      fetchDeviceFlutterChannels(deviceId).catch(() => null),
      fetchDeviceFindings(deviceId).catch(() => null),
    ]).then(
      ([msgResp, logResp, crashResp, cryptoResp, clipboardResp, flutterResp, findingsResp]) => {
        const historical: AgentMessage[] = []

        if (msgResp?.messages) {
          for (const m of msgResp.messages) {
            if (!seenIds.current.has(m.id)) {
              seenIds.current.add(m.id)
              historical.push({ type: 'http', payload: m })
            }
          }
        }

        if (logResp?.entries) {
          for (const e of logResp.entries) {
            if (!seenIds.current.has(e.id)) {
              seenIds.current.add(e.id)
              historical.push({ type: 'logcat', payload: e })
            }
          }
        }

        if (crashResp?.crashes) {
          for (const c of crashResp.crashes) {
            if (!seenIds.current.has(c.id)) {
              seenIds.current.add(c.id)
              historical.push({ type: 'crash', payload: c })
            }
          }
        }

        if (cryptoResp?.events) {
          for (const e of cryptoResp.events) {
            if (!seenIds.current.has(e.id)) {
              seenIds.current.add(e.id)
              historical.push({ type: 'crypto', payload: e })
            }
          }
        }

        if (clipboardResp?.events) {
          for (const e of clipboardResp.events) {
            if (!seenIds.current.has(e.id)) {
              seenIds.current.add(e.id)
              historical.push({ type: 'clipboard', payload: e })
            }
          }
        }

        if (flutterResp?.events) {
          for (const e of flutterResp.events) {
            if (!seenIds.current.has(e.id)) {
              seenIds.current.add(e.id)
              historical.push({ type: 'flutter_channel', payload: e })
            }
          }
        }

        if (findingsResp?.findings) {
          for (const f of findingsResp.findings) {
            if (!seenIds.current.has(f.id)) {
              seenIds.current.add(f.id)
              historical.push({ type: 'finding', payload: f })
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
                .filter(Boolean)
            )
            const newMsgs = historical.filter((h) => {
              const p = h.payload as { id?: string } | undefined
              return p?.id && !existingIds.has(p.id)
            })
            return [...newMsgs, ...prev]
          })
        }
      }
    )
  }, [connected, deviceId])

  useEffect(() => {
    const unsub = subscribe(null, (envelope: DeviceEnvelope) => {
      const payload = envelope.payload as { id?: string } | undefined
      if (payload?.id) {
        if (seenIds.current.has(payload.id)) return
        seenIds.current.add(payload.id)
      }

      setMessages((prev) => [...prev, { type: envelope.type, payload: envelope.payload }])
    })

    return unsub
  }, [subscribe])

  const clearByType = useCallback(
    async (type: string) => {
      if (!deviceId) return
      const fn = clearApiFns[type]
      if (fn) await fn(deviceId)
      setMessages((prev) => {
        const removed = prev.filter((m) => m.type === type)
        for (const m of removed) {
          const id = (m.payload as { id?: string } | undefined)?.id
          if (id) seenIds.current.delete(id)
        }
        return prev.filter((m) => m.type !== type)
      })
    },
    [deviceId]
  )

  return (
    <DeviceMessageContext.Provider value={{ messages, connected, clearByType }}>
      {children}
    </DeviceMessageContext.Provider>
  )
}

export function useDeviceMessages(): DeviceMessageContextValue {
  const ctx = useContext(DeviceMessageContext)
  if (!ctx) throw new Error('useDeviceMessages must be used within DeviceMessageProvider')
  return ctx
}

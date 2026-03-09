import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useDeviceSocket } from './DeviceSocketContext'

export interface AttachedApp {
  bundleId: string
  sessionId: string
  isFlutter: boolean | null
}

interface AttachedAppsContextValue {
  apps: AttachedApp[]
  selectedApp: AttachedApp | null
  addApp: (bundleId: string, sessionId: string) => void
  removeApp: (bundleId: string) => void
  selectApp: (bundleId: string) => void
  wasUserDetach: (bundleId: string) => boolean
}

const AttachedAppsContext = createContext<AttachedAppsContextValue | null>(null)

export function AttachedAppsProvider({ children }: { children: React.ReactNode }) {
  const [apps, setApps] = useState<AttachedApp[]>([])
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null)
  const userDetached = useRef(new Set<string>())
  const { subscribe } = useDeviceSocket()

  const selectedApp = apps.find((a) => a.bundleId === selectedBundleId) ?? apps[0] ?? null

  const addApp = useCallback((bundleId: string, sessionId: string) => {
    userDetached.current.delete(bundleId)
    setApps((prev) => {
      const existing = prev.find((a) => a.bundleId === bundleId)
      if (existing) return prev.map((a) => (a.bundleId === bundleId ? { ...a, sessionId, isFlutter: null } : a))
      return [...prev, { bundleId, sessionId, isFlutter: null }]
    })
    setSelectedBundleId(bundleId)
  }, [])

  const removeApp = useCallback((bundleId: string) => {
    userDetached.current.add(bundleId)
    setTimeout(() => userDetached.current.delete(bundleId), 5000)
    setApps((prev) => prev.filter((a) => a.bundleId !== bundleId))
    setSelectedBundleId((prev) => (prev === bundleId ? null : prev))
  }, [])

  const selectApp = useCallback((bundleId: string) => {
    setSelectedBundleId(bundleId)
  }, [])

  const wasUserDetach = useCallback((bundleId: string) => {
    return userDetached.current.has(bundleId)
  }, [])

  useEffect(() => {
    const unsub1 = subscribe('app_attached', (envelope) => {
      const payload = envelope.payload as { bundleId?: string; sessionId?: string } | undefined
      if (payload?.bundleId && payload?.sessionId) {
        addApp(payload.bundleId, payload.sessionId)
      }
    })
    const unsub2 = subscribe('app_detached', (envelope) => {
      const payload = envelope.payload as { bundleId?: string } | undefined
      if (payload?.bundleId) {
        removeApp(payload.bundleId)
      }
    })
    const unsub3 = subscribe('flutter_detected', (envelope) => {
      const payload = envelope.payload as { flutter?: boolean } | undefined
      const sessionId = envelope.sessionId
      if (sessionId && payload != null) {
        setApps((prev) =>
          prev.map((a) =>
            a.sessionId === sessionId ? { ...a, isFlutter: payload.flutter ?? false } : a
          )
        )
      }
    })
    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [subscribe, addApp, removeApp])

  return (
    <AttachedAppsContext.Provider
      value={{ apps, selectedApp, addApp, removeApp, selectApp, wasUserDetach }}
    >
      {children}
    </AttachedAppsContext.Provider>
  )
}

export function useAttachedApps(): AttachedAppsContextValue {
  const ctx = useContext(AttachedAppsContext)
  if (!ctx) throw new Error('useAttachedApps must be used within AttachedAppsProvider')
  return ctx
}

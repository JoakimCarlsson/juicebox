import { createContext, useCallback, useContext, useState } from 'react'

interface AttachedApp {
  bundleId: string
  sessionId: string
}

interface AttachedAppsContextValue {
  apps: AttachedApp[]
  selectedApp: AttachedApp | null
  addApp: (bundleId: string, sessionId: string) => void
  removeApp: (bundleId: string) => void
  selectApp: (bundleId: string) => void
}

const AttachedAppsContext = createContext<AttachedAppsContextValue | null>(null)

export function AttachedAppsProvider({ children }: { children: React.ReactNode }) {
  const [apps, setApps] = useState<AttachedApp[]>([])
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null)

  const selectedApp = apps.find((a) => a.bundleId === selectedBundleId) ?? apps[0] ?? null

  const addApp = useCallback((bundleId: string, sessionId: string) => {
    setApps((prev) => {
      const existing = prev.find((a) => a.bundleId === bundleId)
      if (existing) return prev.map((a) => (a.bundleId === bundleId ? { ...a, sessionId } : a))
      return [...prev, { bundleId, sessionId }]
    })
    setSelectedBundleId(bundleId)
  }, [])

  const removeApp = useCallback((bundleId: string) => {
    setApps((prev) => prev.filter((a) => a.bundleId !== bundleId))
    setSelectedBundleId((prev) => (prev === bundleId ? null : prev))
  }, [])

  const selectApp = useCallback((bundleId: string) => {
    setSelectedBundleId(bundleId)
  }, [])

  return (
    <AttachedAppsContext.Provider value={{ apps, selectedApp, addApp, removeApp, selectApp }}>
      {children}
    </AttachedAppsContext.Provider>
  )
}

export function useAttachedApps(): AttachedAppsContextValue {
  const ctx = useContext(AttachedAppsContext)
  if (!ctx) throw new Error('useAttachedApps must be used within AttachedAppsProvider')
  return ctx
}

import { createContext, useCallback, useContext, useState } from "react"

interface AppStatus {
  deviceId: string | null
  deviceName: string | null
  connected: boolean
  sessionId: string | null
  bundleId: string | null
}

interface AppStatusContextValue {
  status: AppStatus
  setDeviceStatus: (update: {
    deviceId: string
    deviceName: string
    connected: boolean
  }) => void
  setSessionStatus: (update: {
    sessionId: string | null
    bundleId: string | null
  }) => void
  clearDeviceStatus: () => void
}

const defaultStatus: AppStatus = {
  deviceId: null,
  deviceName: null,
  connected: false,
  sessionId: null,
  bundleId: null,
}

const AppStatusContext = createContext<AppStatusContextValue | null>(null)

export function AppStatusProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [status, setStatus] = useState<AppStatus>(defaultStatus)

  const setDeviceStatus = useCallback(
    (update: { deviceId: string; deviceName: string; connected: boolean }) => {
      setStatus((prev) => ({ ...prev, ...update }))
    },
    [],
  )

  const setSessionStatus = useCallback(
    (update: { sessionId: string | null; bundleId: string | null }) => {
      setStatus((prev) => ({ ...prev, ...update }))
    },
    [],
  )

  const clearDeviceStatus = useCallback(() => {
    setStatus(defaultStatus)
  }, [])

  return (
    <AppStatusContext.Provider
      value={{ status, setDeviceStatus, setSessionStatus, clearDeviceStatus }}
    >
      {children}
    </AppStatusContext.Provider>
  )
}

export function useAppStatus() {
  const ctx = useContext(AppStatusContext)
  if (!ctx)
    throw new Error("useAppStatus must be used within AppStatusProvider")
  return ctx
}

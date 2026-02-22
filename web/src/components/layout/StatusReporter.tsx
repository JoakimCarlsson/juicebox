import { useEffect } from "react"
import { useDeviceSocket } from "@/contexts/DeviceSocketContext"
import { useAppStatus } from "@/contexts/AppStatusContext"

interface StatusReporterProps {
  deviceId: string
  deviceName: string
}

export function StatusReporter({ deviceId, deviceName }: StatusReporterProps) {
  const { connected } = useDeviceSocket()
  const { setDeviceStatus, clearDeviceStatus } = useAppStatus()

  useEffect(() => {
    setDeviceStatus({ deviceId, deviceName, connected })
  }, [deviceId, deviceName, connected, setDeviceStatus])

  useEffect(() => {
    return () => clearDeviceStatus()
  }, [clearDeviceStatus])

  return null
}

import { useEffect } from 'react'
import { useAppStatus } from '@/contexts/AppStatusContext'

interface SessionStatusReporterProps {
  sessionId: string | null
  bundleId: string
}

export function SessionStatusReporter({ sessionId, bundleId }: SessionStatusReporterProps) {
  const { setSessionStatus } = useAppStatus()

  useEffect(() => {
    setSessionStatus({ sessionId, bundleId })
    return () => setSessionStatus({ sessionId: null, bundleId: null })
  }, [sessionId, bundleId, setSessionStatus])

  return null
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useDeviceSocket } from "@/contexts/DeviceSocketContext"
import type { DeviceEnvelope } from "@/types/session"

const MAX_ENTRIES = 1000

export interface EventLogEntry {
  id: number
  timestamp: number
  envelope: DeviceEnvelope
}

interface EventLogContextValue {
  entries: EventLogEntry[]
  clear: () => void
}

const EventLogContext = createContext<EventLogContextValue | null>(null)

export function EventLogProvider({ children }: { children: React.ReactNode }) {
  const { subscribe } = useDeviceSocket()
  const [entries, setEntries] = useState<EventLogEntry[]>([])
  const nextId = useRef(0)

  useEffect(() => {
    return subscribe(null, (envelope) => {
      const entry: EventLogEntry = {
        id: nextId.current++,
        timestamp: Date.now(),
        envelope,
      }
      setEntries((prev) => {
        const next = [...prev, entry]
        if (next.length > MAX_ENTRIES) {
          return next.slice(next.length - MAX_ENTRIES)
        }
        return next
      })
    })
  }, [subscribe])

  const clear = useCallback(() => setEntries([]), [])

  return (
    <EventLogContext.Provider value={{ entries, clear }}>
      {children}
    </EventLogContext.Provider>
  )
}

export function useEventLog() {
  const ctx = useContext(EventLogContext)
  if (!ctx)
    throw new Error("useEventLog must be used within EventLogProvider")
  return ctx
}

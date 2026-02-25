import { createContext, useCallback, useContext, useState } from 'react'

export interface ScriptOutputEntry {
  id: string
  timestamp: number
  payload: unknown
  isError?: boolean
}

interface ScriptOutputContextValue {
  entries: ScriptOutputEntry[]
  addEntry: (payload: unknown, isError?: boolean) => void
  addEntries: (items: { payload: unknown; isError?: boolean }[]) => void
  clear: () => void
}

const ScriptOutputContext = createContext<ScriptOutputContextValue | null>(null)

let entryCounter = 0

export function ScriptOutputProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<ScriptOutputEntry[]>([])

  const addEntry = useCallback((payload: unknown, isError?: boolean) => {
    setEntries((prev) => [
      ...prev,
      {
        id: `so_${++entryCounter}`,
        timestamp: Date.now(),
        payload,
        isError,
      },
    ])
  }, [])

  const addEntries = useCallback((items: { payload: unknown; isError?: boolean }[]) => {
    setEntries((prev) => [
      ...prev,
      ...items.map((item) => ({
        id: `so_${++entryCounter}`,
        timestamp: Date.now(),
        payload: item.payload,
        isError: item.isError,
      })),
    ])
  }, [])

  const clear = useCallback(() => {
    setEntries([])
  }, [])

  return (
    <ScriptOutputContext.Provider value={{ entries, addEntry, addEntries, clear }}>
      {children}
    </ScriptOutputContext.Provider>
  )
}

export function useScriptOutput() {
  const ctx = useContext(ScriptOutputContext)
  if (!ctx) throw new Error('useScriptOutput must be used within ScriptOutputProvider')
  return ctx
}

import { createContext, useCallback, useContext, useRef } from 'react'

export type ScriptEditorEvent =
  | { type: 'file_write_start'; name: string }
  | { type: 'file_write_delta'; name: string; delta: string }
  | { type: 'file_write_end'; name: string }
  | { type: 'file_edit_start'; name: string }
  | { type: 'file_edit_end'; name: string }

type Listener = (event: ScriptEditorEvent) => void

interface ScriptEditorContextValue {
  emit: (event: ScriptEditorEvent) => void
  subscribe: (listener: Listener) => () => void
}

const ScriptEditorContext = createContext<ScriptEditorContextValue | null>(null)

export function ScriptEditorProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<Listener>>(new Set())

  const emit = useCallback((event: ScriptEditorEvent) => {
    for (const listener of listenersRef.current) {
      listener(event)
    }
  }, [])

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  return (
    <ScriptEditorContext.Provider value={{ emit, subscribe }}>
      {children}
    </ScriptEditorContext.Provider>
  )
}

export function useScriptEditor() {
  const ctx = useContext(ScriptEditorContext)
  if (!ctx) throw new Error('useScriptEditor must be used within ScriptEditorProvider')
  return ctx
}

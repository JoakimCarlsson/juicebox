import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useDeviceSocket } from '@/contexts/DeviceSocketContext'
import {
  fetchInterceptState,
  updateInterceptState,
  resolveAllInterceptRequests,
} from '@/features/sessions/api'
import type {
  PendingRequest,
  InterceptRule,
  InterceptDecision,
  DeviceEnvelope,
} from '@/types/session'

interface InterceptContextValue {
  enabled: boolean
  rules: InterceptRule[]
  pendingRequests: PendingRequest[]
  toggleIntercept: (enabled: boolean) => void
  updateRules: (rules: InterceptRule[]) => void
  sendDecision: (decision: InterceptDecision) => void
  forwardAll: () => void
  dropAll: () => void
}

const InterceptContext = createContext<InterceptContextValue | null>(null)

interface InterceptProviderProps {
  sessionId: string
  children: React.ReactNode
}

export function InterceptProvider({ sessionId, children }: InterceptProviderProps) {
  const { subscribe, send } = useDeviceSocket()
  const [enabled, setEnabled] = useState(false)
  const [rules, setRules] = useState<InterceptRule[]>([])
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const sessionIdRef = useRef(sessionId)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    fetchInterceptState(sessionId)
      .then((state) => {
        setEnabled(state.enabled)
        setRules(state.rules)
      })
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    const unsub1 = subscribe('intercept', (envelope: DeviceEnvelope) => {
      if (envelope.sessionId !== sessionId) return
      const pending = envelope.payload as PendingRequest
      if (pending?.id) {
        setPendingRequests((prev) => [...prev, pending])
      }
    })

    const unsub2 = subscribe('intercept_resolved', (envelope: DeviceEnvelope) => {
      if (envelope.sessionId !== sessionId) return
      const payload = envelope.payload as { id?: string }
      if (payload?.id) {
        setPendingRequests((prev) => prev.filter((p) => p.id !== payload.id))
      }
    })

    const unsub3 = subscribe('intercept_state', (envelope: DeviceEnvelope) => {
      if (envelope.sessionId !== sessionId) return
      const state = envelope.payload as {
        enabled?: boolean
        rules?: InterceptRule[]
      }
      if (state?.enabled !== undefined) setEnabled(state.enabled)
      if (state?.rules) setRules(state.rules)
    })

    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [subscribe, sessionId])

  const toggleIntercept = useCallback(
    (value: boolean) => {
      if (!sessionId) return
      setEnabled(value)
      updateInterceptState(sessionId, { enabled: value }).catch(() => setEnabled(!value))
    },
    [sessionId]
  )

  const updateRulesHandler = useCallback(
    (newRules: InterceptRule[]) => {
      if (!sessionId) return
      setRules(newRules)
      updateInterceptState(sessionId, { rules: newRules }).catch(() => {})
    },
    [sessionId]
  )

  const sendDecision = useCallback(
    (decision: InterceptDecision) => {
      send({
        type: 'intercept_decision',
        sessionId: sessionIdRef.current,
        payload: decision,
      })
      setPendingRequests((prev) => prev.filter((p) => p.id !== decision.requestId))
    },
    [send]
  )

  const forwardAll = useCallback(() => {
    if (!sessionId) return
    resolveAllInterceptRequests(sessionId, 'forward').catch(() => {})
    setPendingRequests([])
  }, [sessionId])

  const dropAll = useCallback(() => {
    if (!sessionId) return
    resolveAllInterceptRequests(sessionId, 'drop').catch(() => {})
    setPendingRequests([])
  }, [sessionId])

  return (
    <InterceptContext.Provider
      value={{
        enabled,
        rules,
        pendingRequests,
        toggleIntercept,
        updateRules: updateRulesHandler,
        sendDecision,
        forwardAll,
        dropAll,
      }}
    >
      {children}
    </InterceptContext.Provider>
  )
}

export function useIntercept(): InterceptContextValue {
  const ctx = useContext(InterceptContext)
  if (!ctx) throw new Error('useIntercept must be used within InterceptProvider')
  return ctx
}

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

export type PanelTab = "console" | "problems"

interface BottomPanelContextValue {
  isOpen: boolean
  activeTab: PanelTab
  panelRef: React.RefObject<PanelImperativeHandle | null>
  toggle: () => void
  open: (tab?: PanelTab) => void
  close: () => void
  setActiveTab: (tab: PanelTab) => void
}

const BottomPanelContext = createContext<BottomPanelContextValue | null>(null)

export function BottomPanelProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<PanelTab>("console")
  const panelRef = useRef<PanelImperativeHandle | null>(null)

  const open = useCallback((tab?: PanelTab) => {
    if (tab) setActiveTab(tab)
    setIsOpen(true)
    panelRef.current?.expand()
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    panelRef.current?.collapse()
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        panelRef.current?.collapse()
      } else {
        panelRef.current?.expand()
      }
      return !prev
    })
  }, [])

  return (
    <BottomPanelContext.Provider
      value={{
        isOpen,
        activeTab,
        panelRef,
        toggle,
        open,
        close,
        setActiveTab,
      }}
    >
      {children}
    </BottomPanelContext.Provider>
  )
}

export function useBottomPanel() {
  const ctx = useContext(BottomPanelContext)
  if (!ctx)
    throw new Error("useBottomPanel must be used within BottomPanelProvider")
  return ctx
}

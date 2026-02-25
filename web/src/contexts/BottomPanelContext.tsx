import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'

export type PanelTab = 'console' | 'problems' | 'output' | 'clipboard'

interface BottomPanelContextValue {
  isOpen: boolean
  activeTab: PanelTab
  panelRef: React.RefObject<PanelImperativeHandle | null>
  toggle: () => void
  onPanelResize: (sizePercent: number) => void
  open: (tab?: PanelTab) => void
  close: () => void
  setActiveTab: (tab: PanelTab) => void
}

const BottomPanelContext = createContext<BottomPanelContextValue | null>(null)

export function BottomPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<PanelTab>('console')
  const panelRef = useRef<PanelImperativeHandle | null>(null)
  const lastExpandedSize = useRef(25)

  const open = useCallback((tab?: PanelTab) => {
    if (tab) setActiveTab(tab)
    const panel = panelRef.current
    if (panel?.isCollapsed()) {
      panel.resize(lastExpandedSize.current)
    }
  }, [])

  const close = useCallback(() => {
    panelRef.current?.collapse()
  }, [])

  const toggle = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.resize(lastExpandedSize.current)
    } else {
      panel.collapse()
    }
  }, [])

  const onPanelResize = useCallback((sizePercent: number) => {
    if (sizePercent === 0) {
      setIsOpen(false)
    } else {
      setIsOpen(true)
      lastExpandedSize.current = sizePercent
    }
  }, [])

  return (
    <BottomPanelContext.Provider
      value={{
        isOpen,
        activeTab,
        panelRef,
        toggle,
        onPanelResize,
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
  if (!ctx) throw new Error('useBottomPanel must be used within BottomPanelProvider')
  return ctx
}

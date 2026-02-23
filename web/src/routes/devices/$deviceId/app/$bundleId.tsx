import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SessionStatusReporter } from "@/components/layout/SessionStatusReporter"
import { detachSession } from "@/features/sessions/api"
import { SessionMessageProvider } from "@/contexts/SessionMessageContext"
import { ChatPanelProvider, useChatPanel } from "@/contexts/ChatPanelContext"
import { useBottomPanel } from "@/contexts/BottomPanelContext"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { BottomPanel } from "@/components/layout/BottomPanel"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { useDefaultLayout } from "react-resizable-panels"
import { ArrowLeft, Home, Globe, FileText, Code, Terminal, MessageSquare } from "lucide-react"
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: AppLayout,
})

const tabs = [
  { value: "home", label: "Home", icon: Home, enabled: true, to: "/devices/$deviceId/app/$bundleId/home" as const },
  { value: "network", label: "Network", icon: Globe, enabled: true, to: "/devices/$deviceId/app/$bundleId/network" as const },
  { value: "logs", label: "Logs", icon: FileText, enabled: true, to: "/devices/$deviceId/app/$bundleId/logs" as const },
  { value: "hooks", label: "Hooks", icon: Code, enabled: false, to: "/devices/$deviceId/app/$bundleId/network" as const },
]

function AppLayout() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/app/$bundleId",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId",
  })

  return (
    <SessionMessageProvider sessionId={sessionId}>
      <ChatPanelProvider sessionId={sessionId}>
        <AppLayoutWithChat
          deviceId={deviceId}
          bundleId={bundleId}
          sessionId={sessionId}
        />
      </ChatPanelProvider>
    </SessionMessageProvider>
  )
}

function AppLayoutWithChat({
  deviceId,
  bundleId,
  sessionId,
}: {
  deviceId: string
  bundleId: string
  sessionId: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = location.pathname.split("/").pop() || "home"
  const { panelRef, onPanelResize: onChatResize, toggle: toggleChat, isOpen: chatOpen } = useChatPanel()
  const { panelRef: bottomPanelRef, onPanelResize: onBottomResize, toggle: toggleBottomPanel, isOpen: bottomPanelOpen } = useBottomPanel()
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  const {
    defaultLayout: outerLayout,
    onLayoutChanged: onOuterLayoutChanged,
  } = useDefaultLayout({ id: "app-main", storage: localStorage })

  const {
    defaultLayout: innerLayout,
    onLayoutChanged: onInnerLayoutChanged,
  } = useDefaultLayout({ id: "app-top", storage: localStorage })

  useEffect(() => {
    if (!sessionId) return

    function handleBeforeUnload() {
      fetch(`/api/v1/sessions/${sessionRef.current}`, { method: "DELETE", keepalive: true })
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      detachSession(sessionRef.current).catch(() => {})
    }
  }, [sessionId])

  return (
    <div className="flex h-full flex-col">
      {sessionId && <SessionStatusReporter sessionId={sessionId} bundleId={bundleId} />}

      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                navigate({
                  to: "/devices/$deviceId/apps",
                  params: { deviceId },
                })
              }
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-semibold text-foreground">
              {bundleId}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={bottomPanelOpen ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleBottomPanel}
                >
                  <Terminal className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Console</TooltipContent>
            </Tooltip>
            {sessionId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={chatOpen ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={toggleChat}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">AI Assistant</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup
          orientation="vertical"
          className="h-full"
          defaultLayout={outerLayout}
          onLayoutChanged={onOuterLayoutChanged}
        >
          <ResizablePanel id="top" defaultSize={75} minSize={30}>
            <ResizablePanelGroup
              orientation="horizontal"
              className="h-full"
              defaultLayout={innerLayout}
              onLayoutChanged={onInnerLayoutChanged}
            >
              <ResizablePanel id="content" defaultSize={70} minSize={40}>
                <div className="flex h-full flex-col">
                  <div className="flex items-center border-b border-border px-2 h-9">
                    {tabs.map((tab) => {
                      const Icon = tab.icon
                      const isActive = tab.value === activeTab
                      return (
                        <Link
                          key={tab.value}
                          to={tab.enabled ? tab.to : undefined!}
                          params={{ deviceId, bundleId }}
                          search={{ sessionId }}
                          className={cn(
                            "flex items-center h-9 px-3 text-xs transition-colors",
                            "border-b-2 border-transparent",
                            tab.enabled
                              ? "text-muted-foreground hover:text-foreground"
                              : "text-muted-foreground/50 cursor-default",
                            isActive && "border-foreground text-foreground",
                          )}
                          onClick={(e) => {
                            if (!tab.enabled) e.preventDefault()
                          }}
                        >
                          <Icon className="mr-1.5 h-3 w-3" />
                          {tab.label}
                        </Link>
                      )
                    })}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <Outlet />
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle className="h-full w-px after:inset-y-0 after:-left-1 after:-right-1 after:inset-x-auto" />
              <ResizablePanel
                id="chat"
                panelRef={panelRef}
                defaultSize={30}
                minSize={20}
                collapsible
                collapsedSize={0}
                onResize={(size) => onChatResize(size.asPercentage)}
              >
                <ChatPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle className="w-full h-px after:inset-x-0 after:-top-1 after:-bottom-1 after:inset-y-auto" />
          <ResizablePanel
            id="bottom"
            panelRef={bottomPanelRef}
            defaultSize={25}
            minSize={10}
            collapsible
            collapsedSize={0}
            onResize={(size) => onBottomResize(size.asPercentage)}
          >
            <BottomPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

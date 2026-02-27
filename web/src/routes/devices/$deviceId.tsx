import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { DeviceSocketProvider } from '@/contexts/DeviceSocketContext'
import { AttachedAppsProvider } from '@/contexts/AttachedAppsContext'
import { EventLogProvider } from '@/contexts/EventLogContext'
import { BottomPanelProvider, useBottomPanel } from '@/contexts/BottomPanelContext'
import { ScriptOutputProvider } from '@/contexts/ScriptOutputContext'
import { DeviceMessageProvider } from '@/contexts/DeviceMessageContext'
import { InterceptProvider } from '@/contexts/InterceptContext'
import { ChatPanelProvider, useChatPanel } from '@/contexts/ChatPanelContext'
import { StatusReporter } from '@/components/layout/StatusReporter'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { BottomPanel } from '@/components/layout/BottomPanel'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDefaultLayout } from 'react-resizable-panels'
import { deviceInfoQueryOptions } from '@/features/devices/queries'
import { disconnectDevice } from '@/features/devices/api'
import { cn } from '@/lib/utils'
import {
  LayoutGrid,
  Globe,
  FileText,
  FolderOpen,
  Blocks,
  AlertTriangle,
  Lock,
  Search,
  Code,
  Terminal,
  MessageSquare,
  Unplug,
  ChevronLeft,
} from 'lucide-react'

export const Route = createFileRoute('/devices/$deviceId')({
  component: DeviceLayout,
})

const TABS = [
  { value: 'apps', label: 'Apps', icon: LayoutGrid },
  { value: 'network', label: 'Network', icon: Globe },
  { value: 'logs', label: 'Logs', icon: FileText },
  { value: 'files', label: 'Files', icon: FolderOpen },
  { value: 'classes', label: 'Classes', icon: Blocks },
  { value: 'crashes', label: 'Crashes', icon: AlertTriangle },
  { value: 'crypto', label: 'Crypto', icon: Lock },
  { value: 'memory', label: 'Memory', icon: Search },
  { value: 'hooks', label: 'Hooks', icon: Code },
] as const

function DeviceLayout() {
  const { deviceId } = Route.useParams()
  const { data: info } = useQuery(deviceInfoQueryOptions(deviceId))
  const deviceName = info?.name ?? deviceId

  return (
    <DeviceSocketProvider deviceId={deviceId}>
      <StatusReporter deviceId={deviceId} deviceName={deviceName} />
      <AttachedAppsProvider>
        <EventLogProvider>
          <ScriptOutputProvider>
            <BottomPanelProvider>
              <DeviceMessageProvider>
                <InterceptProvider>
                  <ChatPanelProvider>
                    <DeviceShell deviceId={deviceId} deviceName={deviceName} />
                  </ChatPanelProvider>
                </InterceptProvider>
              </DeviceMessageProvider>
            </BottomPanelProvider>
          </ScriptOutputProvider>
        </EventLogProvider>
      </AttachedAppsProvider>
    </DeviceSocketProvider>
  )
}

function DeviceShell({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = location.pathname.split('/').pop() || 'apps'

  const {
    panelRef,
    onPanelResize: onChatResize,
    toggle: toggleChat,
    isOpen: chatOpen,
  } = useChatPanel()

  const {
    panelRef: bottomPanelRef,
    onPanelResize: onBottomResize,
    toggle: toggleBottomPanel,
    isOpen: bottomPanelOpen,
  } = useBottomPanel()

  const { defaultLayout: horizontalLayout, onLayoutChanged: onHorizontalChanged } =
    useDefaultLayout({ id: 'device-horizontal', storage: localStorage })

  const { defaultLayout: verticalLayout, onLayoutChanged: onVerticalChanged } = useDefaultLayout({
    id: 'device-vertical',
    storage: localStorage,
  })

  async function handleDisconnect() {
    try {
      await disconnectDevice(deviceId)
    } catch {}
    await navigate({ to: '/' })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Link
              to="/"
              className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="text-sm font-semibold text-foreground">{deviceName}</span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={bottomPanelOpen ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleBottomPanel}
                >
                  <Terminal className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Console</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={chatOpen ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleChat}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">AI Assistant</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              className="ml-2 text-muted-foreground hover:text-destructive"
            >
              <Unplug className="mr-1.5 h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full"
          defaultLayout={horizontalLayout}
          onLayoutChanged={onHorizontalChanged}
        >
          <ResizablePanel id="content" defaultSize={70} minSize={40}>
            <ResizablePanelGroup
              orientation="vertical"
              className="h-full"
              defaultLayout={verticalLayout}
              onLayoutChanged={onVerticalChanged}
            >
              <ResizablePanel id="top" defaultSize={75} minSize={30}>
                <div className="flex h-full flex-col">
                  <div className="flex items-center border-b border-border px-2 h-9">
                    {TABS.map((tab) => {
                      const Icon = tab.icon
                      const isActive = tab.value === activeTab
                      return (
                        <Link
                          key={tab.value}
                          to={`/devices/$deviceId/${tab.value}`}
                          params={{ deviceId }}
                          className={cn(
                            'flex items-center h-9 px-3 text-xs transition-colors',
                            'border-b-2 border-transparent',
                            'text-muted-foreground hover:text-foreground',
                            isActive && 'border-foreground text-foreground'
                          )}
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
      </div>
    </div>
  )
}

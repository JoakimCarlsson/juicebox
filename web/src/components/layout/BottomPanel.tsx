import {
  useBottomPanel,
  type PanelTab,
} from "@/contexts/BottomPanelContext"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ChevronDown,
  ChevronUp,
  Terminal,
  FileText,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"

const tabs: { value: PanelTab; label: string; icon: React.ReactNode }[] = [
  {
    value: "console",
    label: "Console",
    icon: <Terminal className="mr-1.5 h-3 w-3" />,
  },
  {
    value: "output",
    label: "Output",
    icon: <FileText className="mr-1.5 h-3 w-3" />,
  },
  {
    value: "problems",
    label: "Problems",
    icon: <AlertTriangle className="mr-1.5 h-3 w-3" />,
  },
]

export function BottomPanel() {
  const { isOpen, activeTab, setActiveTab, toggle } = useBottomPanel()

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-t border-border px-2 h-9 shrink-0">
        <div className="flex items-center gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "flex items-center h-9 px-3 text-xs transition-colors",
                "border-b-2 border-transparent",
                "text-muted-foreground hover:text-foreground",
                activeTab === tab.value &&
                  "border-foreground text-foreground",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={toggle}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {activeTab === "console" && <ConsoleTab />}
        {activeTab === "output" && <OutputTab />}
        {activeTab === "problems" && <ProblemsTab />}
      </ScrollArea>
    </div>
  )
}

function ConsoleTab() {
  return (
    <div className="p-3 font-mono text-xs text-muted-foreground">
      <p>Console output will appear here...</p>
    </div>
  )
}

function OutputTab() {
  return (
    <div className="p-3 font-mono text-xs text-muted-foreground">
      <p>Output will appear here...</p>
    </div>
  )
}

function ProblemsTab() {
  return (
    <div className="p-3 font-mono text-xs text-muted-foreground">
      <p>No problems detected.</p>
    </div>
  )
}

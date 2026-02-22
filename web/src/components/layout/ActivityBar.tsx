import { Smartphone, Settings } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function ActivityBar() {
  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-border bg-sidebar py-2 gap-1 shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md",
              "text-foreground border-l-2 border-foreground",
            )}
          >
            <Smartphone className="h-5 w-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Devices</TooltipContent>
      </Tooltip>

      <div className="mt-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <Settings className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

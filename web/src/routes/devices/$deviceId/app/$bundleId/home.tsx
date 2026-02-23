import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router"
import { Globe, FileText, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/home",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: HomePage,
})

const MODULES = [
  {
    value: "network",
    label: "Network",
    description: "Inspect HTTP traffic, intercept and modify requests",
    icon: Globe,
    to: "/devices/$deviceId/app/$bundleId/network" as const,
  },
  {
    value: "logs",
    label: "Logs",
    description: "Stream and filter Logcat output from the app",
    icon: FileText,
    to: "/devices/$deviceId/app/$bundleId/logs" as const,
  },
  {
    value: "files",
    label: "Files",
    description: "Browse, read, and search files in the app sandbox",
    icon: FolderOpen,
    to: "/devices/$deviceId/app/$bundleId/files" as const,
  },
]

function HomePage() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/app/$bundleId/home",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/home",
  })

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {MODULES.map((mod) => {
          const Icon = mod.icon
          return (
            <Link
              key={mod.value}
              to={mod.to}
              params={{ deviceId, bundleId }}
              search={{ sessionId }}
              className={cn(
                "group flex flex-col gap-2 rounded-lg border border-border bg-card p-4",
                "hover:bg-muted/50 hover:border-foreground/20 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              <div>
                <p className="text-sm font-medium text-foreground">{mod.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{mod.description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

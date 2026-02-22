import { createFileRoute, useSearch } from "@tanstack/react-router"
import { Home } from "lucide-react"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/home",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: HomePage,
})

function HomePage() {
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/home",
  })

  return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
      <Home className="h-8 w-8 opacity-30" />
      <p className="mt-2 text-sm">
        {sessionId ? "Modules coming soon" : "No active session"}
      </p>
    </div>
  )
}

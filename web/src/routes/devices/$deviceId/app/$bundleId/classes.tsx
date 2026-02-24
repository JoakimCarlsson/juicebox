import { createFileRoute, useSearch } from "@tanstack/react-router"
import { ClassBrowser } from "@/components/classes/ClassBrowser"
import { NoSessionEmptyState } from "@/components/sessions/NoSessionEmptyState"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/classes",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: ClassesPage,
})

function ClassesPage() {
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/classes",
  })

  if (!sessionId) {
    return <NoSessionEmptyState />
  }

  return <ClassBrowser sessionId={sessionId} />
}

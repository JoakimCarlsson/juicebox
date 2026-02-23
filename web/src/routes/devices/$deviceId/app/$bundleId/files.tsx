import { createFileRoute, useParams, useSearch } from "@tanstack/react-router"
import { FileBrowser } from "@/components/filesystem/FileBrowser"
import { NoSessionEmptyState } from "@/components/sessions/NoSessionEmptyState"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/files",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: FilesPage,
})

function FilesPage() {
  const { bundleId } = useParams({
    from: "/devices/$deviceId/app/$bundleId/files",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/files",
  })

  if (!sessionId) {
    return <NoSessionEmptyState />
  }

  return <FileBrowser sessionId={sessionId} bundleId={bundleId} />
}

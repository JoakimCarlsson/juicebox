import { createFileRoute, Navigate, useParams, useSearch } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: AppIndex,
})

function AppIndex() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/app/$bundleId/",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/",
  })
  return (
    <Navigate
      to="/devices/$deviceId/app/$bundleId/home"
      params={{ deviceId, bundleId }}
      search={{ sessionId }}
    />
  )
}

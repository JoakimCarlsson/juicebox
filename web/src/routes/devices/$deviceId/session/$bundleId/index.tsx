import { createFileRoute, Navigate, useParams, useSearch } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/devices/$deviceId/session/$bundleId/",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: SessionIndex,
})

function SessionIndex() {
  const { deviceId, bundleId } = useParams({
    from: "/devices/$deviceId/session/$bundleId/",
  })
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/session/$bundleId/",
  })
  return (
    <Navigate
      to="/devices/$deviceId/session/$bundleId/network"
      params={{ deviceId, bundleId }}
      search={{ sessionId }}
    />
  )
}

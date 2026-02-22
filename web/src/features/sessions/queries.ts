import { queryOptions } from "@tanstack/react-query"
import { fetchSessions, fetchSessionsForApp } from "./api"

export function sessionsQueryOptions(deviceId: string) {
  return queryOptions({
    queryKey: ["devices", deviceId, "sessions"],
    queryFn: () => fetchSessions(deviceId),
    enabled: !!deviceId,
  })
}

export function appSessionsQueryOptions(deviceId: string, bundleId: string) {
  return queryOptions({
    queryKey: ["devices", deviceId, "sessions", bundleId],
    queryFn: () => fetchSessionsForApp(deviceId, bundleId),
    enabled: !!deviceId && !!bundleId,
  })
}

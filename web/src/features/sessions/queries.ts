import { queryOptions } from "@tanstack/react-query"
import { fetchSessions } from "./api"

export function sessionsQueryOptions(deviceId: string) {
  return queryOptions({
    queryKey: ["devices", deviceId, "sessions"],
    queryFn: () => fetchSessions(deviceId),
    enabled: !!deviceId,
  })
}

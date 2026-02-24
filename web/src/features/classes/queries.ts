import { queryOptions } from "@tanstack/react-query"
import { listClasses, getClassDetail } from "./api"

export function listClassesQueryOptions(sessionId: string, query: string, limit = 100, offset = 0) {
  return queryOptions({
    queryKey: ["sessions", sessionId, "classes", query, limit, offset],
    queryFn: () => listClasses(sessionId, query, limit, offset),
    enabled: !!sessionId,
    staleTime: 30_000,
  })
}

export function classDetailQueryOptions(sessionId: string, className: string) {
  return queryOptions({
    queryKey: ["sessions", sessionId, "classes", "detail", className],
    queryFn: () => getClassDetail(sessionId, className),
    enabled: !!sessionId && !!className,
    staleTime: 60_000,
  })
}

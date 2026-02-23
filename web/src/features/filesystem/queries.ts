import { queryOptions } from "@tanstack/react-query"
import { listFiles, readFile, findFiles } from "./api"

export function listFilesQueryOptions(sessionId: string, path: string) {
  return queryOptions({
    queryKey: ["sessions", sessionId, "fs", "ls", path],
    queryFn: () => listFiles(sessionId, path),
    enabled: !!sessionId && !!path,
    staleTime: 10_000,
  })
}

export function readFileQueryOptions(sessionId: string, path: string) {
  return queryOptions({
    queryKey: ["sessions", sessionId, "fs", "read", path],
    queryFn: () => readFile(sessionId, path),
    enabled: !!sessionId && !!path,
    staleTime: 30_000,
  })
}

export function findFilesQueryOptions(sessionId: string, pattern: string, basePath?: string) {
  return queryOptions({
    queryKey: ["sessions", sessionId, "fs", "find", pattern, basePath],
    queryFn: () => findFiles(sessionId, pattern, basePath),
    enabled: !!sessionId && !!pattern,
    staleTime: 15_000,
  })
}

import type { AttachResponse, SessionsResponse, MessagesResponse, LogsResponse, CrashesResponse, InterceptState, InterceptDecision, InterceptRule, PendingRequest } from "@/types/session"

export async function attachApp(
  deviceId: string,
  bundleId: string,
  sessionId?: string,
): Promise<AttachResponse> {
  const url = sessionId
    ? `/api/v1/devices/${deviceId}/apps/${bundleId}/attach?sessionId=${encodeURIComponent(sessionId)}`
    : `/api/v1/devices/${deviceId}/apps/${bundleId}/attach`
  const res = await fetch(url, { method: "POST" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Failed to attach")
  }
  return res.json()
}

export async function detachSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/v1/sessions/${sessionId}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Failed to detach")
  }
}

export async function fetchSessions(
  deviceId: string,
  limit = 50,
  offset = 0,
): Promise<SessionsResponse> {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/sessions?limit=${limit}&offset=${offset}`,
  )
  if (!res.ok) throw new Error("Failed to fetch sessions")
  return res.json()
}

export async function fetchSessionsForApp(
  deviceId: string,
  bundleId: string,
  limit = 50,
  offset = 0,
): Promise<SessionsResponse> {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/sessions?bundleId=${encodeURIComponent(bundleId)}&limit=${limit}&offset=${offset}`,
  )
  if (!res.ok) throw new Error("Failed to fetch sessions")
  return res.json()
}

export async function fetchSessionMessages(
  sessionId: string,
  limit = 500,
  offset = 0,
): Promise<MessagesResponse> {
  const res = await fetch(
    `/api/v1/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`,
  )
  if (!res.ok) throw new Error("Failed to fetch messages")
  return res.json()
}

export async function renameSession(
  sessionId: string,
  name: string,
): Promise<void> {
  const res = await fetch(`/api/v1/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Failed to rename session")
  }
}

export async function fetchSessionLogs(
  sessionId: string,
  limit = 5000,
  offset = 0,
): Promise<LogsResponse> {
  const res = await fetch(
    `/api/v1/sessions/${sessionId}/logs?limit=${limit}&offset=${offset}`,
  )
  if (!res.ok) throw new Error("Failed to fetch logs")
  return res.json()
}

export async function fetchSessionCrashes(
  sessionId: string,
  limit = 500,
  offset = 0,
): Promise<CrashesResponse> {
  const res = await fetch(
    `/api/v1/sessions/${sessionId}/crashes?limit=${limit}&offset=${offset}`,
  )
  if (!res.ok) throw new Error("Failed to fetch crashes")
  return res.json()
}

export async function fetchInterceptState(
  sessionId: string,
): Promise<InterceptState> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/intercept`)
  if (!res.ok) throw new Error("Failed to fetch intercept state")
  return res.json()
}

export async function updateInterceptState(
  sessionId: string,
  update: { enabled?: boolean; rules?: InterceptRule[] },
): Promise<InterceptState> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/intercept`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  })
  if (!res.ok) throw new Error("Failed to update intercept state")
  return res.json()
}

export async function fetchPendingRequests(
  sessionId: string,
): Promise<{ pending: PendingRequest[] }> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/intercept/pending`)
  if (!res.ok) throw new Error("Failed to fetch pending requests")
  return res.json()
}

export async function resolveInterceptRequest(
  sessionId: string,
  decision: InterceptDecision,
): Promise<void> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/intercept/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(decision),
  })
  if (!res.ok) throw new Error("Failed to resolve intercept request")
}

export async function resolveAllInterceptRequests(
  sessionId: string,
  action: "forward" | "drop",
): Promise<void> {
  const res = await fetch(
    `/api/v1/sessions/${sessionId}/intercept/resolve-all`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  )
  if (!res.ok) throw new Error("Failed to resolve all intercept requests")
}

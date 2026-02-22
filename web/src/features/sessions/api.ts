import type { AttachResponse, SessionsResponse, MessagesResponse, LogsResponse } from "@/types/session"

export async function attachApp(
  deviceId: string,
  bundleId: string,
): Promise<AttachResponse> {
  const res = await fetch(
    `/api/v1/devices/${deviceId}/apps/${bundleId}/attach`,
    { method: "POST" },
  )
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

import type { AttachResponse } from "@/types/session"

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

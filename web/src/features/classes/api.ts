export interface ClassListResponse {
  classes: string[]
  total: number
}

export interface MethodInfo {
  name: string
  parameterTypes: string[]
  returnType: string
  modifiers: number
}

export interface FieldInfo {
  name: string
  type: string
  modifiers: number
  value: unknown
}

export interface ClassDetail {
  className: string
  methods: MethodInfo[]
  fields: FieldInfo[]
  interfaces: string[]
  superclasses: string[]
}

export interface InvokeResult {
  value?: string | null
  error?: string
}

export async function listClasses(
  sessionId: string,
  query: string,
  limit = 100,
  offset = 0
): Promise<ClassListResponse> {
  const params = new URLSearchParams({ query, limit: String(limit), offset: String(offset) })
  const res = await fetch(`/api/v1/sessions/${sessionId}/classes?${params}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to list classes')
  }
  return res.json()
}

export async function getClassDetail(sessionId: string, className: string): Promise<ClassDetail> {
  const params = new URLSearchParams({ className })
  const res = await fetch(`/api/v1/sessions/${sessionId}/classes/detail?${params}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to get class detail')
  }
  return res.json()
}

export async function invokeMethod(
  sessionId: string,
  className: string,
  methodName: string,
  args: string[] = []
): Promise<InvokeResult> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/classes/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ className, methodName, args }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to invoke method')
  }
  return res.json()
}

export async function readField(
  sessionId: string,
  className: string,
  fieldName: string
): Promise<InvokeResult> {
  const res = await fetch(`/api/v1/sessions/${sessionId}/classes/read-field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ className, fieldName }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to read field')
  }
  return res.json()
}

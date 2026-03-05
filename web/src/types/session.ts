export interface EvasionConfig {
  frida_bypass?: boolean
  root_bypass?: boolean
  emulator_bypass?: boolean
  ssl_bypass?: boolean
  crash_handler?: boolean
}

export interface AttachResponse {
  sessionId: string
  pid: number
  capabilities: string[]
}

export interface HttpMessage {
  id: string
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody?: string | null
  requestBodyEncoding?: string
  requestBodySize?: number
  statusCode: number
  responseHeaders: Record<string, string>
  responseBody?: string | null
  responseBodyEncoding?: string
  responseBodySize?: number
  duration?: number
  timestamp: number
}

export interface AgentMessage {
  type: string
  payload?: unknown
}

export interface DeviceEnvelope {
  type: string
  sessionId?: string
  payload?: unknown
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

export interface LogcatEntry {
  id: string
  timestamp: string
  pid: number
  tid: number
  level: 'V' | 'D' | 'I' | 'W' | 'E' | 'F'
  tag: string
  message: string
}

export interface SessionSummary {
  id: string
  deviceId: string
  bundleId: string
  pid: number
  name: string
  platform: string
  startedAt: number
  endedAt: number | null
  httpCount: number
  logcatCount: number
  capabilities: string[]
}

export interface SessionsResponse {
  sessions: SessionSummary[]
  total: number
}

export interface MessagesResponse {
  messages: HttpMessage[]
  total: number
}

export interface LogsResponse {
  entries: LogcatEntry[]
  total: number
}

export interface CrashEvent {
  id: string
  crashType: 'native' | 'java'
  signal: string | null
  address: string | null
  registers: Record<string, string> | null
  backtrace: string[]
  javaStackTrace: string | null
  exceptionClass: string | null
  exceptionMessage: string | null
  timestamp: number
}

export interface CrashesResponse {
  crashes: CrashEvent[]
  total: number
}

export interface CryptoEvent {
  id: string
  operation: string
  algorithm: string
  input: string | null
  output: string | null
  key: string | null
  iv: string | null
  timestamp: number
}

export interface CryptoEventsResponse {
  events: CryptoEvent[]
  total: number
}

export interface ClipboardEvent {
  id: string
  direction: 'read' | 'write'
  content: string | null
  mimeType: string | null
  callerStack: string | null
  timestamp: number
}

export interface ClipboardEventsResponse {
  events: ClipboardEvent[]
  total: number
}

export interface CertInfo {
  subject: string
  issuer: string
  serial: string
  notBefore: string
  notAfter: string
  sigAlgorithm: string
}

export interface KeystoreEntry {
  alias: string
  entryClass: string
  keyType: string
  keySize: number
  keyFormat: string | null
  encodedKey: string | null
  publicKey: string | null
  certificate: CertInfo | null
  creationDate: string | null
  purposes: string[]
  blockModes: string[]
  encryptionPaddings: string[]
  signaturePaddings: string[]
  digests: string[]
  authRequired: boolean
  authValiditySeconds: number
  hardwareBacked: boolean
  error: string | null
}

export interface SharedPrefEntry {
  key: string
  value: string
  type: string
}

export interface SharedPrefsFile {
  name: string
  path: string
  encrypted: boolean
  entries: SharedPrefEntry[]
}

export interface SharedPrefsResponse {
  files: SharedPrefsFile[]
  total: number
}

export interface InterceptRule {
  id: string
  enabled: boolean
  host?: string
  pathPattern?: string
  method?: string
  contentType?: string
}

export interface PendingRequest {
  id: string
  phase: 'request' | 'response'
  method: string
  url: string
  headers: Record<string, string>
  body?: string | null
  bodyEncoding?: string
  timestamp: number
  statusCode?: number
  responseHeaders?: Record<string, string>
  responseBody?: string | null
  responseBodyEncoding?: string
}

export interface InterceptState {
  enabled: boolean
  rules: InterceptRule[]
  pendingCount: number
}

export interface MemoryScanProgress {
  event: 'progress'
  current: number
  total: number
}

export interface MemoryScanMatch {
  event: 'match'
  id: string
  address: string
  size: number
  hexDump: string
  utf8Preview: string
}

export interface MemoryScanDone {
  event: 'done'
  count: number
}

export type MemoryScanEvent = MemoryScanProgress | MemoryScanMatch | MemoryScanDone

export interface InterceptDecision {
  requestId: string
  action: 'forward' | 'modify' | 'drop'
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
  statusCode?: number
  responseHeaders?: Record<string, string>
  responseBody?: string
}

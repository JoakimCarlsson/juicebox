import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Trash2,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Key,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileText,
  LockKeyhole,
  Flag,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDeviceMessages } from '@/contexts/DeviceMessageContext'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'
import { NoAppAttachedState } from '@/components/devices/NoAppAttachedState'
import type { CryptoEvent, KeystoreEntry, SharedPrefsFile } from '@/types/session'
import { FindingDialog } from '@/components/findings/FindingDialog'
import {
  enableCryptoHooks,
  fetchKeystoreEntries,
  fetchSharedPreferences,
} from '@/features/sessions/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/devices/$deviceId/crypto')({
  component: CryptoPage,
})

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    month: 'short',
    day: 'numeric',
  })
}

function hexToAscii(hex: string): string {
  let result = ''
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16)
    result += code >= 32 && code < 127 ? String.fromCharCode(code) : '.'
  }
  return result
}

function truncateHex(hex: string | null, maxLen = 64): string {
  if (!hex) return '-'
  if (hex.length <= maxLen) return hex
  return hex.substring(0, maxLen) + '...'
}

const OP_COLORS: Record<string, string> = {
  encrypt: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  decrypt: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  mac: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  digest: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  key_derivation: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  key_generation: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
}

function CryptoPage() {
  const { selectedApp } = useAttachedApps()
  const sessionId = selectedApp?.sessionId ?? ''
  const { messages } = useDeviceMessages()
  const [search, setSearch] = useState('')
  const [clearIndex, setClearIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showDecoded, setShowDecoded] = useState(false)
  const [keystoreEntries, setKeystoreEntries] = useState<KeystoreEntry[]>([])
  const [keystoreLoading, setKeystoreLoading] = useState(false)
  const [prefsFiles, setPrefsFiles] = useState<SharedPrefsFile[]>([])
  const [prefsLoading, setPrefsLoading] = useState(false)
  const [cryptoEnabled, setCryptoEnabled] = useState(false)
  const enabledRef = useRef(false)

  const clear = useCallback(() => setClearIndex(messages.length), [messages.length])

  useEffect(() => {
    if (!sessionId || enabledRef.current) return
    enabledRef.current = true
    enableCryptoHooks(sessionId)
      .then(() => setCryptoEnabled(true))
      .catch(() => {})
  }, [sessionId])

  const loadKeystore = useCallback(() => {
    if (!sessionId) return
    setKeystoreLoading(true)
    fetchKeystoreEntries(sessionId)
      .then((resp) => setKeystoreEntries(resp.entries))
      .catch(() => {})
      .finally(() => setKeystoreLoading(false))
  }, [sessionId])

  const loadPrefs = useCallback(() => {
    if (!sessionId) return
    setPrefsLoading(true)
    fetchSharedPreferences(sessionId)
      .then((resp) => setPrefsFiles(resp.files))
      .catch(() => {})
      .finally(() => setPrefsLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (sessionId) {
      fetchKeystoreEntries(sessionId)
        .then((resp) => setKeystoreEntries(resp.entries))
        .catch(() => {})
      fetchSharedPreferences(sessionId)
        .then((resp) => setPrefsFiles(resp.files))
        .catch(() => {})
    }
  }, [sessionId])

  const cryptoEvents = useMemo(() => {
    return messages
      .slice(clearIndex)
      .filter(
        (m): m is { type: 'crypto'; payload: CryptoEvent } => m.type === 'crypto' && !!m.payload
      )
      .map((m) => m.payload as unknown as CryptoEvent)
  }, [messages, clearIndex])

  const filtered = useMemo(() => {
    if (!search.trim()) return cryptoEvents
    const q = search.toLowerCase()
    return cryptoEvents.filter(
      (e) => e.algorithm.toLowerCase().includes(q) || e.operation.toLowerCase().includes(q)
    )
  }, [cryptoEvents, search])

  const selectedEvent = useMemo(() => {
    if (!selectedId) return null
    return filtered.find((e) => e.id === selectedId) ?? null
  }, [filtered, selectedId])

  if (!selectedApp) {
    return <NoAppAttachedState feature="Crypto Monitor" />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by algorithm or operation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
          <Trash2 className="mr-1.5 h-3 w-3" />
          Clear
        </Button>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          {!cryptoEnabled && ' (enabling hooks...)'}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={55} minSize={30}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
                <Lock className="h-8 w-8 opacity-30" />
                <p className="text-sm">
                  {cryptoEvents.length === 0
                    ? 'Waiting for crypto operations...'
                    : 'No events match your filter'}
                </p>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex-1 min-h-0 overflow-auto">
                  <EventList events={filtered} selectedId={selectedId} onSelect={setSelectedId} />
                </div>
                {selectedEvent && (
                  <EventDetail
                    event={selectedEvent}
                    showDecoded={showDecoded}
                    onToggleDecoded={() => setShowDecoded((v) => !v)}
                    sessionId={sessionId}
                  />
                )}
              </div>
            )}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={25}>
            <Tabs defaultValue="keystore" className="h-full">
              <div className="border-b border-border px-2">
                <TabsList className="h-8">
                  <TabsTrigger value="keystore" className="text-xs gap-1.5 px-2.5">
                    <Key className="h-3 w-3" />
                    Keystore
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {keystoreEntries.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="sharedprefs" className="text-xs gap-1.5 px-2.5">
                    <FileText className="h-3 w-3" />
                    SharedPrefs
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {prefsFiles.length}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="keystore" className="h-[calc(100%-2.5rem)] overflow-hidden">
                <KeystorePanel
                  entries={keystoreEntries}
                  loading={keystoreLoading}
                  onRefresh={loadKeystore}
                />
              </TabsContent>
              <TabsContent value="sharedprefs" className="h-[calc(100%-2.5rem)] overflow-hidden">
                <SharedPrefsPanel files={prefsFiles} loading={prefsLoading} onRefresh={loadPrefs} />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

function EventList({
  events,
  selectedId,
  onSelect,
}: {
  events: CryptoEvent[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={listRef} className="divide-y divide-border">
      {events.map((event) => {
        const isSelected = event.id === selectedId
        return (
          <button
            key={event.id}
            onClick={() => onSelect(event.id)}
            className={cn(
              'w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors',
              isSelected && 'bg-muted/70'
            )}
          >
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 font-mono shrink-0',
                OP_COLORS[event.operation] ?? 'bg-muted'
              )}
            >
              {event.operation}
            </Badge>
            <span className="text-xs font-mono truncate flex-1 text-foreground">
              {event.algorithm}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {formatTimestamp(event.timestamp)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function EventDetail({
  event,
  showDecoded,
  onToggleDecoded,
  sessionId,
}: {
  event: CryptoEvent
  showDecoded: boolean
  onToggleDecoded: () => void
  sessionId?: string | null
}) {
  const [findingOpen, setFindingOpen] = useState(false)

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2 max-h-[50%] overflow-auto">
      <div className="flex items-center gap-2 mb-2">
        <Badge
          variant="outline"
          className={cn('text-[10px] font-mono', OP_COLORS[event.operation] ?? '')}
        >
          {event.operation}
        </Badge>
        <span className="text-xs font-mono text-foreground">{event.algorithm}</span>
        <div className="ml-auto flex items-center gap-1">
          {sessionId && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={() => setFindingOpen(true)}
              >
                <Flag className="h-3 w-3 mr-1" />
                Add Finding
              </Button>
              <FindingDialog
                open={findingOpen}
                onOpenChange={setFindingOpen}
                sessionId={sessionId}
                defaultTitle={`${event.operation} — ${event.algorithm}`}
                onSubmit={async (data) => {
                  const { createFinding } = await import('@/features/sessions/api')
                  await createFinding(sessionId, data)
                  setFindingOpen(false)
                }}
              />
            </>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={onToggleDecoded}>
            {showDecoded ? 'Hex' : 'Decoded'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {event.key && <DataRow label="Key" hex={event.key} showDecoded={showDecoded} />}
        {event.iv && <DataRow label="IV" hex={event.iv} showDecoded={showDecoded} />}
        {event.input && <DataRow label="Input" hex={event.input} showDecoded={showDecoded} />}
        {event.output && <DataRow label="Output" hex={event.output} showDecoded={showDecoded} />}
      </div>
    </div>
  )
}

function DataRow({
  label,
  hex,
  showDecoded,
}: {
  label: string
  hex: string
  showDecoded: boolean
}) {
  return (
    <div className="flex gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-12 shrink-0 pt-0.5">
        {label}
      </span>
      <code className="text-xs font-mono text-foreground break-all bg-muted/50 rounded px-1.5 py-0.5 flex-1">
        {showDecoded ? hexToAscii(hex) : truncateHex(hex, 128)}
      </code>
    </div>
  )
}

function KeystorePanel({
  entries,
  loading,
  onRefresh,
}: {
  entries: KeystoreEntry[]
  loading: boolean
  onRefresh: () => void
}) {
  const [expandedAlias, setExpandedAlias] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-1.5">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-auto"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <Shield className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {loading ? 'Loading keystore...' : 'No keystore entries found'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => {
              const isExpanded = expandedAlias === entry.alias
              return (
                <div key={entry.alias}>
                  <button
                    onClick={() => setExpandedAlias(isExpanded ? null : entry.alias)}
                    className={cn(
                      'w-full text-left px-4 py-2.5 flex items-start gap-2.5 hover:bg-muted/50 transition-colors',
                      isExpanded && 'bg-muted/30'
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono truncate text-foreground">
                          {entry.alias}
                        </span>
                        {entry.encodedKey ? (
                          <ShieldX className="h-3 w-3 text-red-500 shrink-0" />
                        ) : entry.hardwareBacked ? (
                          <ShieldCheck className="h-3 w-3 text-green-500 shrink-0" />
                        ) : (
                          <ShieldAlert className="h-3 w-3 text-amber-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          {entry.keyType}
                        </Badge>
                        {entry.keySize > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {entry.keySize}b
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 text-muted-foreground"
                        >
                          {entry.entryClass}
                        </Badge>
                      </div>
                    </div>
                  </button>

                  {isExpanded && <KeystoreDetail entry={entry} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SharedPrefsPanel({
  files,
  loading,
  onRefresh,
}: {
  files: SharedPrefsFile[]
  loading: boolean
  onRefresh: () => void
}) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files
    const q = search.toLowerCase()
    return files
      .map((f) => ({
        ...f,
        entries: f.entries.filter(
          (e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
        ),
      }))
      .filter((f) => f.entries.length > 0 || f.name.toLowerCase().includes(q))
  }, [files, search])

  const totalEntries = files.reduce((sum, f) => sum + f.entries.length, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-1.5">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {totalEntries} entr{totalEntries !== 1 ? 'ies' : 'y'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-auto"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {files.length > 0 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter keys or values..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <FileText className="h-8 w-8 opacity-30" />
            <p className="text-sm">
              {loading ? 'Loading preferences...' : 'No SharedPreferences found'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredFiles.map((file) => {
              const isExpanded = expandedFile === file.name
              return (
                <div key={file.name}>
                  <button
                    onClick={() => setExpandedFile(isExpanded ? null : file.name)}
                    className={cn(
                      'w-full text-left px-4 py-2.5 flex items-start gap-2.5 hover:bg-muted/50 transition-colors',
                      isExpanded && 'bg-muted/30'
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {file.encrypted ? (
                          <LockKeyhole className="h-3 w-3 text-green-500 shrink-0" />
                        ) : (
                          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-xs font-mono truncate text-foreground">
                          {file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {file.encrypted && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-600 dark:text-green-400"
                          >
                            encrypted
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {file.entries.length} entr{file.entries.length !== 1 ? 'ies' : 'y'}
                        </Badge>
                      </div>
                    </div>
                  </button>

                  {isExpanded && <SharedPrefsEntries entries={file.entries} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SharedPrefsEntries({ entries }: { entries: SharedPrefsFile['entries'] }) {
  if (entries.length === 0) {
    return (
      <div className="px-4 pb-3 pl-9">
        <p className="text-xs text-muted-foreground">No entries</p>
      </div>
    )
  }

  return (
    <div className="pl-9 pr-4 pb-3">
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                Key
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                Value
              </th>
              <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider w-16">
                Type
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.key} className="hover:bg-muted/30">
                <td className="px-2.5 py-1.5 font-mono text-foreground break-all max-w-[200px]">
                  {entry.key}
                </td>
                <td className="px-2.5 py-1.5 font-mono text-foreground/80 break-all max-w-[300px]">
                  {entry.value.length > 200 ? entry.value.substring(0, 200) + '...' : entry.value}
                </td>
                <td className="px-2.5 py-1.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {entry.type}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BadgeList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1 mt-1">
        {items.map((item) => (
          <Badge key={item} variant="outline" className="text-[10px] px-1.5 py-0">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function HexBlock({ label, hex }: { label: string; hex: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(hex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [hex])

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <button onClick={handleCopy} className="p-0.5 hover:bg-muted rounded">
          {copied ? (
            <Check className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <Copy className="h-2.5 w-2.5 text-muted-foreground" />
          )}
        </button>
      </div>
      <div className="mt-1 rounded border border-border bg-muted/30 px-2 py-1.5 max-h-24 overflow-auto">
        <p className="text-[10px] font-mono break-all text-foreground/80 select-all">{hex}</p>
      </div>
    </div>
  )
}

function CertificateBlock({ cert }: { cert: NonNullable<KeystoreEntry['certificate']> }) {
  return (
    <div>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Certificate
      </span>
      <div className="mt-1 rounded border border-border bg-muted/30 px-2.5 py-2 space-y-1">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <DetailField label="Subject" value={cert.subject} />
          <DetailField label="Issuer" value={cert.issuer} />
          <DetailField label="Serial" value={cert.serial} />
          <DetailField label="Sig Algorithm" value={cert.sigAlgorithm} />
          <DetailField label="Not Before" value={cert.notBefore} />
          <DetailField label="Not After" value={cert.notAfter} />
        </div>
      </div>
    </div>
  )
}

function KeystoreDetail({ entry }: { entry: KeystoreEntry }) {
  return (
    <div className="px-4 pb-3 pl-9 space-y-2">
      {entry.error && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono break-all">
            {entry.error}
          </p>
        </div>
      )}

      {entry.encodedKey && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 flex items-start gap-1.5">
          <ShieldX className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[10px] text-red-600 dark:text-red-400">
            Key material is extractable — raw bytes available below
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailField label="Entry Class" value={entry.entryClass} />
        <DetailField label="Key Type" value={entry.keyType} />
        <DetailField
          label="Key Size"
          value={entry.keySize > 0 ? `${entry.keySize} bits` : 'unknown'}
        />
        {entry.keyFormat && <DetailField label="Key Format" value={entry.keyFormat} />}
        <DetailField
          label="Hardware Backed"
          value={entry.hardwareBacked ? 'Yes (TEE/StrongBox)' : 'No (software)'}
          warn={!entry.hardwareBacked}
        />
        <DetailField
          label="Auth Required"
          value={entry.authRequired ? 'Yes' : 'No'}
          warn={!entry.authRequired}
        />
        {entry.authRequired && entry.authValiditySeconds > 0 && (
          <DetailField label="Auth Validity" value={`${entry.authValiditySeconds}s`} />
        )}
        {entry.creationDate && <DetailField label="Created" value={entry.creationDate} />}
      </div>

      {entry.encodedKey && <HexBlock label="Raw Key (hex)" hex={entry.encodedKey} />}
      {entry.publicKey && <HexBlock label="Public Key (hex)" hex={entry.publicKey} />}
      {entry.certificate && <CertificateBlock cert={entry.certificate} />}

      <BadgeList label="Purposes" items={entry.purposes} />
      <BadgeList label="Block Modes" items={entry.blockModes} />
      <BadgeList label="Encryption Paddings" items={entry.encryptionPaddings} />
      <BadgeList label="Signature Paddings" items={entry.signaturePaddings} />
      <BadgeList label="Digests" items={entry.digests} />
    </div>
  )
}

function DetailField({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p className={cn('text-xs', warn ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>
        {value}
      </p>
    </div>
  )
}

import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Search,
  Shield,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  FileCode2,
  Plus,
  Trash2,
  Activity,
  Radio,
  Database,
  Zap,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NoSessionEmptyState } from "@/components/sessions/NoSessionEmptyState"
import { fetchManifest, launchIntent } from "@/features/sessions/api"
import type {
  ManifestData,
  ManifestComponent,
  ActivityInfo,
  ProviderInfo,
  IntentParams,
  IntentResult,
} from "@/types/session"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/devices/$deviceId/app/$bundleId/manifest",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: (search.sessionId as string) ?? "",
  }),
  component: ManifestPage,
})

type ComponentType = "activity" | "service" | "receiver" | "provider"

interface SelectedComponent {
  type: ComponentType
  component: ManifestComponent | ActivityInfo | ProviderInfo
}

const COMPONENT_ICONS: Record<ComponentType, typeof Activity> = {
  activity: Activity,
  service: Zap,
  receiver: Radio,
  provider: Database,
}

interface ExtraEntry {
  key: string
  type: string
  value: string
}

function ManifestPage() {
  const { sessionId } = useSearch({
    from: "/devices/$deviceId/app/$bundleId/manifest",
  })

  const [manifest, setManifest] = useState<ManifestData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<SelectedComponent | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["activities", "services", "receivers", "providers"]),
  )

  const [intentAction, setIntentAction] = useState("")
  const [intentData, setIntentData] = useState("")
  const [intentCategory, setIntentCategory] = useState("")
  const [intentFlags, setIntentFlags] = useState("")
  const [extras, setExtras] = useState<ExtraEntry[]>([])
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null)
  const [launching, setLaunching] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    fetchManifest(sessionId)
      .then((data) => setManifest(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (!selected) return
    setIntentResult(null)
    const c = selected.component
    const filters = c.intentFilters ?? []
    if (filters.length > 0) {
      const f = filters[0]
      setIntentAction(f.actions[0] ?? "")
      setIntentCategory(f.categories[0] ?? "")
      const d = f.data?.[0]
      if (d?.scheme) {
        setIntentData(`${d.scheme}://${d.host ?? ""}${d.path ?? ""}`)
      } else {
        setIntentData("")
      }
    } else {
      setIntentAction("")
      setIntentData("")
      setIntentCategory("")
    }
    setExtras([])
    setIntentFlags("")
  }, [selected])

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }, [])

  const filteredComponents = useMemo(() => {
    if (!manifest) return { activities: [], services: [], receivers: [], providers: [] }
    const q = search.toLowerCase()
    const filter = <T extends ManifestComponent>(arr: T[]) =>
      q ? arr.filter((c) => c.name.toLowerCase().includes(q)) : arr
    return {
      activities: filter(manifest.activities),
      services: filter(manifest.services),
      receivers: filter(manifest.receivers),
      providers: filter(manifest.providers),
    }
  }, [manifest, search])

  const exportedCount = useMemo(() => {
    if (!manifest) return 0
    return (
      manifest.activities.filter((a) => a.exported).length +
      manifest.services.filter((s) => s.exported).length +
      manifest.receivers.filter((r) => r.exported).length +
      manifest.providers.filter((p) => p.exported).length
    )
  }, [manifest])

  const handleLaunch = useCallback(async () => {
    if (!sessionId || !selected || selected.type === "provider") return
    setLaunching(true)
    setIntentResult(null)

    const params: IntentParams = {
      component: selected.component.name,
      type: selected.type === "receiver" ? "broadcast" : selected.type,
    }
    if (intentAction) params.action = intentAction
    if (intentData) params.data = intentData
    if (intentCategory) params.categories = [intentCategory]
    if (intentFlags) params.flags = parseInt(intentFlags, 16) || 0
    if (extras.length > 0) {
      params.extras = {}
      for (const e of extras) {
        if (e.key) params.extras[e.key] = { type: e.type, value: e.value }
      }
    }

    try {
      const result = await launchIntent(sessionId, params)
      setIntentResult(result)
    } catch (e: any) {
      setIntentResult({ success: false, error: e.message })
    } finally {
      setLaunching(false)
    }
  }, [sessionId, selected, intentAction, intentData, intentCategory, intentFlags, extras])

  if (!sessionId) {
    return <NoSessionEmptyState />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter components..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        {manifest && (
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
              {manifest.packageName}
            </Badge>
            {manifest.versionName && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                v{manifest.versionName}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {exportedCount} exported
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin opacity-30" />
            <p className="text-sm">Loading manifest...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <ShieldAlert className="h-8 w-8 opacity-30" />
            <p className="text-sm">{error}</p>
          </div>
        ) : !manifest ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
            <FileCode2 className="h-8 w-8 opacity-30" />
            <p className="text-sm">No manifest data</p>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={55} minSize={30}>
              <div className="h-full overflow-auto">
                <ComponentGroup
                  label="Activities"
                  groupKey="activities"
                  type="activity"
                  components={filteredComponents.activities}
                  expanded={expandedGroups.has("activities")}
                  onToggle={toggleGroup}
                  selected={selected}
                  onSelect={setSelected}
                />
                <ComponentGroup
                  label="Services"
                  groupKey="services"
                  type="service"
                  components={filteredComponents.services}
                  expanded={expandedGroups.has("services")}
                  onToggle={toggleGroup}
                  selected={selected}
                  onSelect={setSelected}
                />
                <ComponentGroup
                  label="Broadcast Receivers"
                  groupKey="receivers"
                  type="receiver"
                  components={filteredComponents.receivers}
                  expanded={expandedGroups.has("receivers")}
                  onToggle={toggleGroup}
                  selected={selected}
                  onSelect={setSelected}
                />
                <ComponentGroup
                  label="Content Providers"
                  groupKey="providers"
                  type="provider"
                  components={filteredComponents.providers}
                  expanded={expandedGroups.has("providers")}
                  onToggle={toggleGroup}
                  selected={selected}
                  onSelect={setSelected}
                />

                {manifest.permissions.length > 0 && (
                  <div className="border-t border-border px-4 py-3">
                    <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                      Permissions ({manifest.permissions.length})
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {manifest.permissions.map((p) => (
                        <Badge
                          key={p}
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 font-mono",
                            p.includes("DANGEROUS") && "border-red-500/30 text-red-600 dark:text-red-400",
                          )}
                        >
                          {p.replace("android.permission.", "")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={45} minSize={25}>
              <div className="h-full overflow-auto">
                {selected ? (
                  <IntentBuilder
                    selected={selected}
                    action={intentAction}
                    onActionChange={setIntentAction}
                    data={intentData}
                    onDataChange={setIntentData}
                    category={intentCategory}
                    onCategoryChange={setIntentCategory}
                    flags={intentFlags}
                    onFlagsChange={setIntentFlags}
                    extras={extras}
                    onExtrasChange={setExtras}
                    onLaunch={handleLaunch}
                    launching={launching}
                    result={intentResult}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground">
                    <Shield className="h-8 w-8 opacity-30" />
                    <p className="text-sm">Select a component to build an intent</p>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}

function ComponentGroup({
  label,
  groupKey,
  type,
  components,
  expanded,
  onToggle,
  selected,
  onSelect,
}: {
  label: string
  groupKey: string
  type: ComponentType
  components: (ManifestComponent | ActivityInfo | ProviderInfo)[]
  expanded: boolean
  onToggle: (key: string) => void
  selected: SelectedComponent | null
  onSelect: (s: SelectedComponent) => void
}) {
  const Icon = COMPONENT_ICONS[type]
  const exportedCount = components.filter((c) => c.exported).length

  return (
    <div className="border-b border-border">
      <button
        onClick={() => onToggle(groupKey)}
        className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
          {exportedCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400 mr-1.5">
              {exportedCount} exported
            </span>
          )}
          {components.length}
        </span>
      </button>
      {expanded && (
        <div className="divide-y divide-border/50">
          {components.map((c) => {
            const isSelected =
              selected?.component.name === c.name && selected?.type === type
            return (
              <button
                key={c.name}
                onClick={() => onSelect({ type, component: c })}
                className={cn(
                  "w-full text-left pl-10 pr-4 py-1.5 flex items-center gap-2 hover:bg-muted/50 transition-colors",
                  isSelected && "bg-muted/70",
                )}
              >
                {c.exported ? (
                  <ShieldAlert className="h-3 w-3 text-amber-500 shrink-0" />
                ) : (
                  <Shield className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                )}
                <span className="text-xs font-mono truncate flex-1">
                  {c.name.split(".").pop()}
                </span>
                {c.intentFilters.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
                    {c.intentFilters.length} filter{c.intentFilters.length !== 1 ? "s" : ""}
                  </Badge>
                )}
                {c.permission && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono shrink-0 max-w-[100px] truncate">
                    {c.permission.split(".").pop()}
                  </Badge>
                )}
              </button>
            )
          })}
          {components.length === 0 && (
            <p className="text-xs text-muted-foreground pl-10 py-2">None</p>
          )}
        </div>
      )}
    </div>
  )
}

function IntentBuilder({
  selected,
  action,
  onActionChange,
  data,
  onDataChange,
  category,
  onCategoryChange,
  flags,
  onFlagsChange,
  extras,
  onExtrasChange,
  onLaunch,
  launching,
  result,
}: {
  selected: SelectedComponent
  action: string
  onActionChange: (v: string) => void
  data: string
  onDataChange: (v: string) => void
  category: string
  onCategoryChange: (v: string) => void
  flags: string
  onFlagsChange: (v: string) => void
  extras: ExtraEntry[]
  onExtrasChange: (v: ExtraEntry[]) => void
  onLaunch: () => void
  launching: boolean
  result: IntentResult | null
}) {
  const c = selected.component
  const isProvider = selected.type === "provider"

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-xs font-medium mb-1">Component</h3>
        <p className="text-xs font-mono text-foreground break-all">{c.name}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              c.exported
                ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {c.exported ? "exported" : "private"}
          </Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {selected.type}
          </Badge>
          {"launchMode" in c && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {(c as ActivityInfo).launchMode}
            </Badge>
          )}
        </div>
      </div>

      {c.intentFilters.length > 0 && (
        <div>
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            Intent Filters
          </h3>
          <div className="space-y-1.5">
            {c.intentFilters.map((f, i) => (
              <div key={i} className="rounded border border-border bg-muted/30 px-2.5 py-1.5 space-y-0.5">
                {f.actions.map((a) => (
                  <div key={a} className="text-[10px] font-mono">
                    <span className="text-muted-foreground">action: </span>
                    {a}
                  </div>
                ))}
                {f.categories.map((cat) => (
                  <div key={cat} className="text-[10px] font-mono">
                    <span className="text-muted-foreground">category: </span>
                    {cat}
                  </div>
                ))}
                {f.data.map((d, j) => (
                  <div key={j} className="text-[10px] font-mono">
                    <span className="text-muted-foreground">data: </span>
                    {d.scheme}://{d.host}{d.path}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {"authorities" in c && (
        <div>
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Provider Details
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="text-[10px] text-muted-foreground">Authorities</span>
              <p className="text-xs font-mono">{(c as ProviderInfo).authorities || "-"}</p>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Grant URI</span>
              <p className="text-xs">{(c as ProviderInfo).grantUriPermissions ? "Yes" : "No"}</p>
            </div>
            {(c as ProviderInfo).readPermission && (
              <div>
                <span className="text-[10px] text-muted-foreground">Read Perm</span>
                <p className="text-xs font-mono break-all">
                  {(c as ProviderInfo).readPermission}
                </p>
              </div>
            )}
            {(c as ProviderInfo).writePermission && (
              <div>
                <span className="text-[10px] text-muted-foreground">Write Perm</span>
                <p className="text-xs font-mono break-all">
                  {(c as ProviderInfo).writePermission}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!isProvider && (
        <>
          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Intent Builder
            </h3>

            <div>
              <label className="text-[10px] text-muted-foreground">Action</label>
              <Input
                placeholder="android.intent.action.VIEW"
                value={action}
                onChange={(e) => onActionChange(e.target.value)}
                className="h-7 text-xs font-mono mt-0.5"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground">Data URI</label>
              <Input
                placeholder="content://authority/path"
                value={data}
                onChange={(e) => onDataChange(e.target.value)}
                className="h-7 text-xs font-mono mt-0.5"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground">Category</label>
              <Input
                placeholder="android.intent.category.DEFAULT"
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="h-7 text-xs font-mono mt-0.5"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground">Flags (hex)</label>
              <Input
                placeholder="10000000"
                value={flags}
                onChange={(e) => onFlagsChange(e.target.value)}
                className="h-7 text-xs font-mono mt-0.5"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-muted-foreground">Extras</label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() =>
                    onExtrasChange([...extras, { key: "", type: "string", value: "" }])
                  }
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {extras.map((extra, i) => (
                <div key={i} className="flex items-center gap-1 mb-1">
                  <Input
                    placeholder="key"
                    value={extra.key}
                    onChange={(e) => {
                      const next = [...extras]
                      next[i] = { ...next[i], key: e.target.value }
                      onExtrasChange(next)
                    }}
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Select
                    value={extra.type}
                    onValueChange={(v: string) => {
                      const next = [...extras]
                      next[i] = { ...next[i], type: v }
                      onExtrasChange(next)
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">string</SelectItem>
                      <SelectItem value="int">int</SelectItem>
                      <SelectItem value="boolean">bool</SelectItem>
                      <SelectItem value="float">float</SelectItem>
                      <SelectItem value="long">long</SelectItem>
                      <SelectItem value="double">double</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="value"
                    value={extra.value}
                    onChange={(e) => {
                      const next = [...extras]
                      next[i] = { ...next[i], value: e.target.value }
                      onExtrasChange(next)
                    }}
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onExtrasChange(extras.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={onLaunch}
            disabled={launching}
          >
            {launching ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3 w-3" />
            )}
            Launch {selected.type === "receiver" ? "Broadcast" : selected.type === "service" ? "Service" : "Activity"}
          </Button>

          {result && (
            <div
              className={cn(
                "rounded-md border px-3 py-2",
                result.success
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-red-500/30 bg-red-500/5",
              )}
            >
              <p
                className={cn(
                  "text-xs font-mono",
                  result.success
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {result.success ? result.result : result.error}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

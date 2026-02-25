import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { classDetailQueryOptions } from '@/features/classes/queries'
import { invokeMethod, readField } from '@/features/classes/api'
import type { MethodInfo, FieldInfo } from '@/features/classes/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Play, Eye, ChevronRight, AlertCircle, Lock, Unlock, Zap, Hash, Shield } from 'lucide-react'

interface ClassDetailProps {
  sessionId: string
  className: string
}

const MODIFIER_FLAGS: [number, string][] = [
  [0x0001, 'public'],
  [0x0002, 'private'],
  [0x0004, 'protected'],
  [0x0008, 'static'],
  [0x0010, 'final'],
  [0x0020, 'synchronized'],
  [0x0040, 'volatile'],
  [0x0080, 'transient'],
  [0x0100, 'native'],
  [0x0400, 'abstract'],
]

function modifierTags(modifiers: number) {
  return MODIFIER_FLAGS.filter(([flag]) => (modifiers & flag) !== 0).map(([, name]) => name)
}

function modifierIcon(modifiers: number) {
  if (modifiers & 0x0001) return <Unlock className="h-3 w-3 text-emerald-500" />
  if (modifiers & 0x0002) return <Lock className="h-3 w-3 text-red-400" />
  if (modifiers & 0x0004) return <Shield className="h-3 w-3 text-amber-400" />
  return <Hash className="h-3 w-3 text-muted-foreground" />
}

type ActiveTab = 'methods' | 'fields' | 'hierarchy'

export function ClassDetail({ sessionId, className }: ClassDetailProps) {
  const [tab, setTab] = useState<ActiveTab>('methods')
  const { data, isLoading, error } = useQuery(classDetailQueryOptions(sessionId, className))

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />
        {error?.message ?? 'Failed to load class detail'}
      </div>
    )
  }

  const tabs: { value: ActiveTab; label: string; count: number }[] = [
    { value: 'methods', label: 'Methods', count: data.methods.length },
    { value: 'fields', label: 'Fields', count: data.fields.length },
    {
      value: 'hierarchy',
      label: 'Hierarchy',
      count: data.interfaces.length + data.superclasses.length,
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-2">
        <p className="text-xs font-mono text-foreground truncate">{className}</p>
      </div>
      <div className="flex items-center gap-0.5 border-b border-border px-2 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 h-8 text-xs transition-colors border-b-2 border-transparent',
              tab === t.value
                ? 'border-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            <span className="text-muted-foreground/70">{t.count}</span>
          </button>
        ))}
      </div>
      <ScrollArea className="flex-1">
        {tab === 'methods' && (
          <MethodsTab sessionId={sessionId} className={className} methods={data.methods} />
        )}
        {tab === 'fields' && (
          <FieldsTab sessionId={sessionId} className={className} fields={data.fields} />
        )}
        {tab === 'hierarchy' && (
          <HierarchyTab interfaces={data.interfaces} superclasses={data.superclasses} />
        )}
      </ScrollArea>
    </div>
  )
}

function MethodsTab({
  sessionId,
  className,
  methods,
}: {
  sessionId: string
  className: string
  methods: MethodInfo[]
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  if (methods.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">No declared methods.</p>
  }

  return (
    <div className="divide-y divide-border">
      {methods.map((m, i) => (
        <MethodRow
          key={`${m.name}-${i}`}
          sessionId={sessionId}
          className={className}
          method={m}
          expanded={expandedIdx === i}
          onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
        />
      ))}
    </div>
  )
}

function MethodRow({
  sessionId,
  className,
  method,
  expanded,
  onToggle,
}: {
  sessionId: string
  className: string
  method: MethodInfo
  expanded: boolean
  onToggle: () => void
}) {
  const [args, setArgs] = useState('')
  const invoke = useMutation({
    mutationFn: () => {
      const parsed = args.trim() ? args.split(',').map((a) => a.trim()) : []
      return invokeMethod(sessionId, className, method.name, parsed)
    },
  })

  const mods = modifierTags(method.modifiers)
  const isStatic = (method.modifiers & 0x0008) !== 0
  const paramSig = method.parameterTypes.map((p) => p.split('.').pop()).join(', ')

  return (
    <div className="group">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
        {modifierIcon(method.modifiers)}
        <span className="text-xs font-mono text-foreground truncate">{method.name}</span>
        <span className="text-xs font-mono text-muted-foreground truncate">({paramSig})</span>
        <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0 mx-0.5" />
        <span className="text-xs font-mono text-muted-foreground truncate">
          {method.returnType.split('.').pop()}
        </span>
        {isStatic && (
          <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 h-4 shrink-0">
            static
          </Badge>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-muted/30 space-y-2">
          <div className="flex flex-wrap gap-1">
            {mods.map((m) => (
              <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {m}
              </Badge>
            ))}
          </div>
          {method.parameterTypes.length > 0 && (
            <div className="text-xs text-muted-foreground font-mono space-y-0.5">
              {method.parameterTypes.map((p, i) => (
                <div key={i}>
                  <span className="text-muted-foreground/70">arg{i}: </span>
                  {p}
                </div>
              ))}
            </div>
          )}
          <div className="text-xs font-mono text-muted-foreground">
            <span className="text-muted-foreground/70">returns: </span>
            {method.returnType}
          </div>
          <div className="flex items-center gap-2 pt-1">
            {method.parameterTypes.length > 0 && (
              <Input
                placeholder="arg1, arg2, ..."
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                className="h-7 text-xs font-mono flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') invoke.mutate()
                }}
              />
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 shrink-0"
              onClick={() => invoke.mutate()}
              disabled={invoke.isPending}
            >
              <Play className="h-3 w-3" />
              Invoke
            </Button>
          </div>
          {invoke.data && (
            <div
              className={cn(
                'text-xs font-mono p-2 rounded border',
                invoke.data.error
                  ? 'bg-destructive/10 border-destructive/20 text-destructive'
                  : 'bg-muted border-border text-foreground'
              )}
            >
              {invoke.data.error ?? invoke.data.value ?? 'null'}
            </div>
          )}
          {invoke.error && <div className="text-xs text-destructive">{invoke.error.message}</div>}
        </div>
      )}
    </div>
  )
}

function FieldsTab({
  sessionId,
  className,
  fields,
}: {
  sessionId: string
  className: string
  fields: FieldInfo[]
}) {
  if (fields.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">No declared fields.</p>
  }

  return (
    <div className="divide-y divide-border">
      {fields.map((f, i) => (
        <FieldRow key={`${f.name}-${i}`} sessionId={sessionId} className={className} field={f} />
      ))}
    </div>
  )
}

function FieldRow({
  sessionId,
  className,
  field,
}: {
  sessionId: string
  className: string
  field: FieldInfo
}) {
  const read = useMutation({
    mutationFn: () => readField(sessionId, className, field.name),
  })

  const mods = modifierTags(field.modifiers)

  return (
    <div className="px-4 py-2 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        {modifierIcon(field.modifiers)}
        <span className="text-xs font-mono text-foreground truncate">{field.name}</span>
        <span className="text-xs font-mono text-muted-foreground truncate">
          : {field.type.split('.').pop()}
        </span>
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {mods.includes('static') && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              static
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => read.mutate()}
            disabled={read.isPending}
          >
            <Eye className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {field.value !== null && field.value !== undefined && (
        <div className="mt-1 text-xs font-mono text-muted-foreground pl-5 truncate">
          = {String(field.value)}
        </div>
      )}
      {read.data && (
        <div
          className={cn(
            'mt-1 text-xs font-mono p-1.5 rounded border ml-5',
            read.data.error
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-muted border-border text-foreground'
          )}
        >
          {read.data.error ?? read.data.value ?? 'null'}
        </div>
      )}
    </div>
  )
}

function HierarchyTab({
  interfaces,
  superclasses,
}: {
  interfaces: string[]
  superclasses: string[]
}) {
  return (
    <div className="p-4 space-y-4">
      {superclasses.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Superclass Chain</p>
          <div className="space-y-1">
            {superclasses.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span
                    className="text-muted-foreground/40 text-xs"
                    style={{ paddingLeft: i * 12 }}
                  >
                    {'↳'}
                  </span>
                )}
                <Zap className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs font-mono text-foreground">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {interfaces.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Interfaces</p>
          <div className="flex flex-wrap gap-1.5">
            {interfaces.map((iface) => (
              <Badge key={iface} variant="secondary" className="text-[10px] font-mono px-2 py-0.5">
                {iface}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {superclasses.length === 0 && interfaces.length === 0 && (
        <p className="text-xs text-muted-foreground">No hierarchy information.</p>
      )}
    </div>
  )
}

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  FilePenLine,
  Layers3,
  ListFilter,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react'

import {
  createV2Entity,
  deleteV2Entity,
  listV2Entities,
  updateV2Entity,
  v2EntityConfigs,
  type V2EntityConfig,
  type V2EntityField,
  type V2EntityPayload,
  type V2EntityRecord,
} from '@/api/v2Entities'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Input, Label, Textarea } from '@movscript/ui'

type PanelMode = 'create' | 'edit'

const statusTone: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  accepted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  locked: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  playable: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  candidate: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  generated: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  draft: 'bg-muted text-muted-foreground',
  todo: 'bg-muted text-muted-foreground',
  missing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  review: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  running: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  checking: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  blocked: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  ignored: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  rejected: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  archived: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
}

export default function V2EntitiesPage() {
  const project = useProjectStore((s) => s.current)
  const queryClient = useQueryClient()
  const [activeKind, setActiveKind] = useState(v2EntityConfigs[0].kind)
  const config = v2EntityConfigs.find((item) => item.kind === activeKind) ?? v2EntityConfigs[0]
  const queryKey = ['v2-entities', project?.ID, config.kind]

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<PanelMode>('create')
  const [draft, setDraft] = useState<Record<string, string | boolean>>(emptyDraft(config))

  const entitiesQuery = useQuery({
    queryKey,
    queryFn: () => listV2Entities(project!.ID, config),
    enabled: !!project,
  })

  const records = entitiesQuery.data ?? []
  const selected = records.find((item) => item.ID === selectedId) ?? null

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter((record) => {
      const currentStatus = String(record.status ?? '')
      const matchesStatus = status === 'all' || currentStatus === status
      const haystack = config.summaryKeys
        .map((key) => String(record[key] ?? ''))
        .concat([String(record.ID)])
        .join(' ')
        .toLowerCase()
      return matchesStatus && (!q || haystack.includes(q))
    })
  }, [config.summaryKeys, query, records, status])

  const availableStatuses = useMemo(() => {
    const values = new Set(records.map((item) => String(item.status ?? '')).filter(Boolean))
    return Array.from(values).sort()
  }, [records])

  const confirmedCount = records.filter((item) => ['active', 'accepted', 'approved', 'confirmed', 'locked', 'playable'].includes(String(item.status ?? ''))).length
  const attentionCount = records.filter((item) => ['blocked', 'ignored', 'missing', 'rejected', 'review', 'running', 'checking'].includes(String(item.status ?? ''))).length

  useEffect(() => {
    setSelectedId(null)
    setMode('create')
    setDraft(emptyDraft(config))
    setQuery('')
    setStatus('all')
  }, [config])

  useEffect(() => {
    if (mode === 'edit' && selected) {
      setDraft(recordToDraft(config, selected))
    }
  }, [config, mode, selected])

  useEffect(() => {
    if (selectedId && !records.some((item) => item.ID === selectedId)) {
      setSelectedId(null)
      setMode('create')
      setDraft(emptyDraft(config))
    }
  }, [config, records, selectedId])

  const createMutation = useMutation({
    mutationFn: (payload: V2EntityPayload) => createV2Entity(project!.ID, config, payload),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey })
      setSelectedId(record.ID)
      setMode('edit')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: V2EntityPayload }) => updateV2Entity(project!.ID, config, id, payload),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey })
      setSelectedId(record.ID)
      setMode('edit')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteV2Entity(project!.ID, config, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setSelectedId(null)
      setMode('create')
      setDraft(emptyDraft(config))
    },
  })

  function startCreate() {
    setMode('create')
    setSelectedId(null)
    setDraft(emptyDraft(config))
  }

  function selectRecord(record: V2EntityRecord) {
    setSelectedId(record.ID)
    setMode('edit')
    setDraft(recordToDraft(config, record))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const payload = draftToPayload(config, draft, mode)
    if (mode === 'edit' && selectedId) {
      updateMutation.mutate({ id: selectedId, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  function removeSelected() {
    if (!selectedId) return
    const title = selected ? entityTitle(selected) : `#${selectedId}`
    if (!window.confirm(`删除 ${config.label} ${title}？`)) return
    deleteMutation.mutate(selectedId)
  }

  const working = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1200px] p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <span>/</span>
              <span>V2 实体</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">V2 实体工作台</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{config.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => entitiesQuery.refetch()} loading={entitiesQuery.isFetching}>
              <RefreshCcw size={15} />
              刷新
            </Button>
            <Button className="gap-2" onClick={startCreate}>
              <Plus size={15} />
              新建{config.label}
            </Button>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-4 gap-3">
          <Metric icon={Boxes} label="当前对象" value={config.pluralLabel} detail={`${v2EntityConfigs.length} 类 V2 对象`} tone={config.iconTone} />
          <Metric icon={Layers3} label="总量" value={records.length} detail="当前项目内记录" tone="text-sky-600" />
          <Metric icon={CheckCircle2} label="已确认" value={confirmedCount} detail="active / confirmed / locked 等" tone="text-emerald-600" />
          <Metric icon={Clock3} label="待处理" value={attentionCount} detail="missing / review / blocked 等" tone="text-amber-600" />
        </section>

        <section className="mt-5 grid grid-cols-[250px_minmax(0,1fr)_390px] gap-4">
          <aside className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-2">
              {v2EntityConfigs.map((item) => {
                const active = item.kind === config.kind
                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => setActiveKind(item.kind)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors',
                      active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Database size={14} className={cn('shrink-0', active ? 'text-background' : item.iconTone)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.pluralLabel}</span>
                      <span className={cn('block text-[11px]', active ? 'text-background/65' : 'text-muted-foreground')}>{item.path}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {config.requiredHint && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                {config.requiredHint}
              </div>
            )}
          </aside>

          <main className="min-w-0 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <div className="relative min-w-0 flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9" placeholder="搜索标题、名称、状态或 ID" />
              </div>
              <div className="flex items-center gap-2">
                <ListFilter size={14} className="text-muted-foreground" />
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="ms-input h-9 w-36">
                  <option value="all">全部状态</option>
                  {availableStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>

            <div className="max-h-[calc(100vh-280px)] overflow-auto">
              {entitiesQuery.isLoading ? (
                <EmptyState title="正在加载" detail="读取当前项目的 V2 对象" />
              ) : visibleRecords.length === 0 ? (
                <EmptyState title="暂无记录" detail="可以从右侧表单创建第一条记录" />
              ) : (
                <div className="divide-y divide-border">
                  {visibleRecords.map((record) => (
                    <RecordRow
                      key={record.ID}
                      config={config}
                      record={record}
                      selected={selectedId === record.ID}
                      onSelect={() => selectRecord(record)}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>

          <aside className="rounded-lg border border-border bg-card">
            <form onSubmit={submit} className="flex h-full max-h-[calc(100vh-178px)] flex-col">
              <div className="border-b border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FilePenLine size={16} className={config.iconTone} />
                      <h2 className="text-sm font-semibold text-foreground">{mode === 'edit' ? `编辑${config.label}` : `新建${config.label}`}</h2>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{mode === 'edit' && selected ? `ID ${selected.ID}` : config.path}</p>
                  </div>
                  {mode === 'edit' && selected && <StatusBadge status={String(selected.status ?? 'draft')} />}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
                {config.fields.map((field) => (
                  <EntityField
                    key={field.key}
                    field={field}
                    disabled={mode === 'edit' && field.createOnly}
                    value={draft[field.key] ?? ''}
                    onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border p-4">
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  onClick={removeSelected}
                  disabled={mode !== 'edit' || !selectedId || working}
                >
                  <Trash2 size={15} />
                  删除
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={startCreate} disabled={working}>清空</Button>
                  <Button type="submit" className="gap-2" loading={working}>
                    <Save size={15} />
                    {mode === 'edit' ? '保存' : '创建'}
                  </Button>
                </div>
              </div>
            </form>
          </aside>
        </section>
      </div>
    </div>
  )
}

function RecordRow({ config, record, selected, onSelect }: {
  config: V2EntityConfig
  record: V2EntityRecord
  selected: boolean
  onSelect: () => void
}) {
  const title = entityTitle(record)
  const summary = config.summaryKeys
    .filter((key) => key !== 'title' && key !== 'name')
    .map((key) => ({ key, value: record[key] }))
    .filter((item) => item.value !== undefined && item.value !== null && String(item.value) !== '')

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50',
      )}
    >
      <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted', selected && 'bg-background/50')}>
        <Database size={15} className={config.iconTone} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {record.status ? <StatusBadge status={String(record.status)} /> : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">ID {record.ID}</Badge>
          {summary.slice(0, 4).map((item) => (
            <Badge key={item.key} variant="secondary" className="max-w-[190px] truncate text-[10px]">
              {item.key}: {String(item.value)}
            </Badge>
          ))}
        </div>
      </div>
    </button>
  )
}

function EntityField({ field, value, disabled, onChange }: {
  field: V2EntityField
  value: string | boolean
  disabled?: boolean
  onChange: (value: string | boolean) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label required={field.required}>{field.label}</Label>
      {field.type === 'textarea' ? (
        <Textarea
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          disabled={disabled}
          placeholder={field.placeholder}
        />
      ) : field.type === 'select' ? (
        <select
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required={field.required}
          className="ms-input h-9 w-full"
        >
          <option value="">未设置</option>
          {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : field.type === 'boolean' ? (
        <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
          <span>{Boolean(value) ? '是' : '否'}</span>
        </label>
      ) : (
        <Input
          type={field.type === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required={field.required}
          placeholder={field.placeholder}
        />
      )}
      {field.helper && <p className="text-[11px] leading-relaxed text-muted-foreground">{field.helper}</p>}
    </div>
  )
}

function Metric({ icon: Icon, label, value, detail, tone }: {
  icon: typeof Database
  label: string
  value: string | number
  detail: string
  tone: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon size={16} className={tone} />
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tracking-normal text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="secondary" className={cn('shrink-0 text-[10px]', statusTone[status] ?? 'bg-muted text-muted-foreground')}>{status}</Badge>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
      <Database size={24} className="text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function emptyDraft(config: V2EntityConfig): Record<string, string | boolean> {
  return Object.fromEntries(config.fields.map((field) => [field.key, field.type === 'boolean' ? false : '']))
}

function recordToDraft(config: V2EntityConfig, record: V2EntityRecord): Record<string, string | boolean> {
  return Object.fromEntries(config.fields.map((field) => {
    const value = record[field.key]
    if (field.type === 'boolean') return [field.key, Boolean(value)]
    if (value === undefined || value === null) return [field.key, '']
    return [field.key, String(value)]
  }))
}

function draftToPayload(config: V2EntityConfig, draft: Record<string, string | boolean>, mode: PanelMode): V2EntityPayload {
  const payload: V2EntityPayload = {}
  for (const field of config.fields) {
    if (mode === 'edit' && field.createOnly) continue
    const value = draft[field.key]
    if (field.type === 'boolean') {
      payload[field.key] = Boolean(value)
      continue
    }
    const text = String(value ?? '').trim()
    if (text === '') {
      payload[field.key] = null
      continue
    }
    payload[field.key] = field.type === 'number' ? Number(text) : text
  }
  return payload
}

function entityTitle(record: V2EntityRecord) {
  return String(record.title ?? record.name ?? record.label ?? `#${record.ID}`)
}

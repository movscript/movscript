import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  GitBranch,
  Link2,
  ListFilter,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  UserRoundPen,
} from 'lucide-react'

import {
  createCreativeReferenceUsage,
  createCreativeRelationship,
  deleteCreativeReferenceUsage,
  deleteCreativeRelationship,
  listCreativeReferences,
  listCreativeReferenceStates,
  listCreativeReferenceUsages,
  listCreativeRelationships,
  updateCreativeReferenceUsage,
  updateCreativeRelationship,
  type CreativeReference,
  type CreativeReferenceState,
  type CreativeReferenceUsage,
  type CreativeRelationship,
  type RelationTab,
  type RelationshipPayload,
  type UsagePayload,
} from '@/api/referenceRelations'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Input, Label, Textarea } from '@movscript/ui'

type Mode = 'create' | 'edit'

const ownerTypes = ['script_section', 'situation', 'content_unit', 'keyframe']
const scopeTypes = ['', 'project', 'script', 'script_section', 'situation', 'content_unit']
const sources = ['manual', 'ai', 'import']
const statuses = ['draft', 'confirmed', 'corrected', 'ignored']
const usageRoles = ['protagonist', 'supporting', 'location', 'prop', 'style', 'brand', 'rule']
const relationshipCategories = ['relationship', 'continuity', 'conflict', 'dependency', 'style_rule']

const statusTone: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  corrected: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  draft: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ignored: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
}

const sourceTone: Record<string, string> = {
  ai: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  manual: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  import: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
}

const emptyUsage: UsageDraft = {
  owner_type: 'content_unit',
  owner_id: '',
  creative_reference_id: '',
  creative_reference_state_id: '',
  role: 'protagonist',
  order: '0',
  evidence: '',
  source: 'manual',
  status: 'draft',
  metadata_json: '',
}

const emptyRelationship: RelationshipDraft = {
  source_creative_reference_id: '',
  target_creative_reference_id: '',
  scope_type: '',
  scope_id: '',
  category: 'relationship',
  type: '',
  label: '',
  description: '',
  evidence: '',
  source: 'manual',
  status: 'draft',
  metadata_json: '',
}

interface UsageDraft {
  owner_type: string
  owner_id: string
  creative_reference_id: string
  creative_reference_state_id: string
  role: string
  order: string
  evidence: string
  source: string
  status: string
  metadata_json: string
}

interface RelationshipDraft {
  source_creative_reference_id: string
  target_creative_reference_id: string
  scope_type: string
  scope_id: string
  category: string
  type: string
  label: string
  description: string
  evidence: string
  source: string
  status: string
  metadata_json: string
}

export default function ReferenceRelationsPage() {
  const project = useProjectStore((s) => s.current)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<RelationTab>('usage')
  const [mode, setMode] = useState<Mode>('create')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [usageDraft, setUsageDraft] = useState<UsageDraft>(emptyUsage)
  const [relationshipDraft, setRelationshipDraft] = useState<RelationshipDraft>(emptyRelationship)

  const projectId = project?.ID
  const referencesQuery = useQuery({
    queryKey: ['reference-relations', projectId, 'references'],
    queryFn: () => listCreativeReferences(projectId!),
    enabled: !!projectId,
  })
  const statesQuery = useQuery({
    queryKey: ['reference-relations', projectId, 'states'],
    queryFn: () => listCreativeReferenceStates(projectId!),
    enabled: !!projectId,
  })
  const usagesQuery = useQuery({
    queryKey: ['reference-relations', projectId, 'usages'],
    queryFn: () => listCreativeReferenceUsages(projectId!),
    enabled: !!projectId,
  })
  const relationshipsQuery = useQuery({
    queryKey: ['reference-relations', projectId, 'relationships'],
    queryFn: () => listCreativeRelationships(projectId!),
    enabled: !!projectId,
  })

  const references = referencesQuery.data ?? []
  const states = statesQuery.data ?? []
  const usages = usagesQuery.data ?? []
  const relationships = relationshipsQuery.data ?? []
  const usageRecords = useMemo(() => usages.map((item) => hydrateUsage(item, references, states)), [references, states, usages])
  const relationshipRecords = useMemo(() => relationships.map((item) => hydrateRelationship(item, references)), [references, relationships])

  const selectedUsage = tab === 'usage' ? usageRecords.find((item) => item.ID === selectedId) ?? null : null
  const selectedRelationship = tab === 'relationship' ? relationshipRecords.find((item) => item.ID === selectedId) ?? null : null

  const filteredUsages = useMemo(() => {
    const q = query.trim().toLowerCase()
    return usageRecords.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const haystack = [
        item.owner_type,
        item.owner_id,
        item.role,
        item.evidence,
        item.creative_reference?.name,
        item.creative_reference_state?.name,
      ].join(' ').toLowerCase()
      return matchesStatus && (!q || haystack.includes(q))
    })
  }, [query, statusFilter, usageRecords])

  const filteredRelationships = useMemo(() => {
    const q = query.trim().toLowerCase()
    return relationshipRecords.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const haystack = [
        item.category,
        item.type,
        item.label,
        item.description,
        item.evidence,
        item.source_creative_reference?.name,
        item.target_creative_reference?.name,
      ].join(' ').toLowerCase()
      return matchesStatus && (!q || haystack.includes(q))
    })
  }, [query, relationshipRecords, statusFilter])

  useEffect(() => {
    startCreate()
  }, [tab])

  const invalidateRelations = () => {
    queryClient.invalidateQueries({ queryKey: ['reference-relations', projectId] })
  }

  const createUsageMutation = useMutation({
    mutationFn: (payload: UsagePayload) => createCreativeReferenceUsage(projectId!, payload),
    onSuccess: (record) => {
      invalidateRelations()
      setSelectedId(record.ID)
      setMode('edit')
    },
  })
  const updateUsageMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UsagePayload }) => updateCreativeReferenceUsage(projectId!, id, payload),
    onSuccess: (record) => {
      invalidateRelations()
      setSelectedId(record.ID)
      setMode('edit')
    },
  })
  const deleteUsageMutation = useMutation({
    mutationFn: (id: number) => deleteCreativeReferenceUsage(projectId!, id),
    onSuccess: () => {
      invalidateRelations()
      startCreate()
    },
  })

  const createRelationshipMutation = useMutation({
    mutationFn: (payload: RelationshipPayload) => createCreativeRelationship(projectId!, payload),
    onSuccess: (record) => {
      invalidateRelations()
      setSelectedId(record.ID)
      setMode('edit')
    },
  })
  const updateRelationshipMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: RelationshipPayload }) => updateCreativeRelationship(projectId!, id, payload),
    onSuccess: (record) => {
      invalidateRelations()
      setSelectedId(record.ID)
      setMode('edit')
    },
  })
  const deleteRelationshipMutation = useMutation({
    mutationFn: (id: number) => deleteCreativeRelationship(projectId!, id),
    onSuccess: () => {
      invalidateRelations()
      startCreate()
    },
  })

  const working = createUsageMutation.isPending || updateUsageMutation.isPending || deleteUsageMutation.isPending ||
    createRelationshipMutation.isPending || updateRelationshipMutation.isPending || deleteRelationshipMutation.isPending

  function refreshAll() {
    referencesQuery.refetch()
    statesQuery.refetch()
    usagesQuery.refetch()
    relationshipsQuery.refetch()
  }

  function startCreate() {
    setMode('create')
    setSelectedId(null)
    setUsageDraft(emptyUsage)
    setRelationshipDraft(emptyRelationship)
  }

  function selectUsage(record: CreativeReferenceUsage) {
    setMode('edit')
    setSelectedId(record.ID)
    setUsageDraft(usageToDraft(record))
  }

  function selectRelationship(record: CreativeRelationship) {
    setMode('edit')
    setSelectedId(record.ID)
    setRelationshipDraft(relationshipToDraft(record))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (tab === 'usage') {
      const payload = usageDraftToPayload(usageDraft)
      if (!payload) return
      if (mode === 'edit' && selectedId) {
        updateUsageMutation.mutate({ id: selectedId, payload })
      } else {
        createUsageMutation.mutate(payload)
      }
      return
    }
    const payload = relationshipDraftToPayload(relationshipDraft)
    if (!payload) return
    if (mode === 'edit' && selectedId) {
      updateRelationshipMutation.mutate({ id: selectedId, payload })
    } else {
      createRelationshipMutation.mutate(payload)
    }
  }

  function deleteSelected() {
    if (!selectedId) return
    const label = tab === 'usage' ? '使用关系' : '资料关系'
    if (!window.confirm(`删除当前${label}？`)) return
    if (tab === 'usage') deleteUsageMutation.mutate(selectedId)
    else deleteRelationshipMutation.mutate(selectedId)
  }

  function quickStatus(status: string) {
    if (!selectedId) return
    if (tab === 'usage') {
      const payload = usageDraftToPayload({ ...usageDraft, status })
      if (payload) updateUsageMutation.mutate({ id: selectedId, payload })
    } else {
      const payload = relationshipDraftToPayload({ ...relationshipDraft, status })
      if (payload) updateRelationshipMutation.mutate({ id: selectedId, payload })
    }
  }

  const totalRelations = usages.length + relationships.length
  const aiRelations = usages.filter((item) => item.source === 'ai').length + relationships.filter((item) => item.source === 'ai').length
  const correctedRelations = usages.filter((item) => item.status === 'corrected').length + relationships.filter((item) => item.status === 'corrected').length
  const pendingRelations = usages.filter((item) => item.status === 'draft').length + relationships.filter((item) => item.status === 'draft').length

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1240px] p-5 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranch size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <span>/</span>
              <span>引用关系</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">引用关系工作台</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              校正 AI 提取的创作资料引用，维护情境、内容单元、关键帧与人物、地点、道具、风格之间的关系。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={refreshAll} loading={usagesQuery.isFetching || relationshipsQuery.isFetching}>
              <RefreshCcw size={15} />
              刷新
            </Button>
            <Button className="gap-2" onClick={startCreate}>
              <Plus size={15} />
              新建关系
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-3">
          <Metric icon={Link2} label="关系总数" value={totalRelations} detail="使用关系 + 资料关系" tone="text-sky-600" />
          <Metric icon={Bot} label="AI 添加" value={aiRelations} detail="需要人工抽查和确认" tone="text-violet-600" />
          <Metric icon={UserRoundPen} label="人工修正" value={correctedRelations} detail="AI 关系被修正后的记录" tone="text-emerald-600" />
          <Metric icon={ListFilter} label="待确认" value={pendingRelations} detail="draft 状态关系" tone="text-amber-600" />
        </section>

        <section className="grid grid-cols-[300px_minmax(0,1fr)_420px] gap-4">
          <aside className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-2">
              <SegmentButton active={tab === 'usage'} icon={Link2} label="对象使用资料" count={usages.length} onClick={() => setTab('usage')} />
              <SegmentButton active={tab === 'relationship'} icon={GitBranch} label="资料之间关系" count={relationships.length} onClick={() => setTab('relationship')} />
            </div>

            <Panel title="筛选">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" placeholder="搜索对象、资料、证据" />
              </div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="all">全部状态</option>
                {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Panel>

            <Panel title="资料概览">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="资料" value={references.length} />
                <MiniStat label="状态" value={states.length} />
                <MiniStat label="使用" value={usages.length} />
                <MiniStat label="关系" value={relationships.length} />
              </div>
            </Panel>
          </aside>

          <main className="min-w-0 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{tab === 'usage' ? '对象使用资料' : '资料之间关系'}</h2>
                <p className="text-xs text-muted-foreground">{tab === 'usage' ? '描述某个结构对象引用了哪个创作资料和状态' : '描述人物、地点、道具、风格之间的语义关系'}</p>
              </div>
              <Badge variant="outline">{tab === 'usage' ? filteredUsages.length : filteredRelationships.length} 条</Badge>
            </div>
            <div className="max-h-[calc(100vh-330px)] overflow-auto p-3">
              {tab === 'usage' ? (
                filteredUsages.length === 0 ? <EmptyState /> : (
                  <div className="space-y-2">
                    {filteredUsages.map((record) => (
                      <UsageRow key={record.ID} record={record} active={selectedId === record.ID} onClick={() => selectUsage(record)} />
                    ))}
                  </div>
                )
              ) : (
                filteredRelationships.length === 0 ? <EmptyState /> : (
                  <div className="space-y-2">
                    {filteredRelationships.map((record) => (
                      <RelationshipRow key={record.ID} record={record} active={selectedId === record.ID} onClick={() => selectRelationship(record)} />
                    ))}
                  </div>
                )
              )}
            </div>
          </main>

          <aside className="min-w-0 rounded-lg border border-border bg-card">
            <form onSubmit={submit} className="flex h-full min-h-[620px] flex-col">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{mode === 'edit' ? '修改关系' : '新建关系'}</h2>
                    <p className="text-xs text-muted-foreground">AI 写错时直接修正字段，并把状态改为 corrected。</p>
                  </div>
                  {mode === 'edit' && <Badge variant="outline">#{selectedId}</Badge>}
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-auto p-4">
                {tab === 'usage' ? (
                  <UsageForm draft={usageDraft} setDraft={setUsageDraft} references={references} states={states} />
                ) : (
                  <RelationshipForm draft={relationshipDraft} setDraft={setRelationshipDraft} references={references} />
                )}

                {mode === 'edit' && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold text-foreground">快速审阅</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => quickStatus('confirmed')}>
                        <CheckCircle2 size={14} />
                        确认
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => quickStatus('corrected')}>标为已修正</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => quickStatus('ignored')}>忽略</Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border p-4">
                <Button type="button" variant="outline" onClick={deleteSelected} disabled={mode !== 'edit' || working} className="gap-2">
                  <Trash2 size={15} />
                  删除
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={startCreate}>清空</Button>
                  <Button type="submit" loading={working} className="gap-2">
                    <Save size={15} />
                    保存
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

function UsageForm({ draft, setDraft, references, states }: {
  draft: UsageDraft
  setDraft: (draft: UsageDraft) => void
  references: CreativeReference[]
  states: CreativeReferenceState[]
}) {
  const selectedReferenceId = Number(draft.creative_reference_id) || 0
  const availableStates = selectedReferenceId > 0 ? states.filter((item) => item.creative_reference_id === selectedReferenceId) : states
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="对象类型">
          <Select value={draft.owner_type} onChange={(value) => setDraft({ ...draft, owner_type: value })} options={ownerTypes} />
        </Field>
        <Field label="对象 ID">
          <Input value={draft.owner_id} onChange={(event) => setDraft({ ...draft, owner_id: event.target.value })} inputMode="numeric" required />
        </Field>
      </div>
      <Field label="创作资料">
        <ReferenceSelect value={draft.creative_reference_id} onChange={(value) => setDraft({ ...draft, creative_reference_id: value, creative_reference_state_id: '' })} references={references} />
      </Field>
      <Field label="资料状态">
        <select value={draft.creative_reference_state_id} onChange={(event) => setDraft({ ...draft, creative_reference_state_id: event.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
          <option value="">不指定状态</option>
          {availableStates.map((state) => (
            <option key={state.ID} value={state.ID}>{state.name} · {state.scope_type}{state.scope_id ? ` #${state.scope_id}` : ''}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="角色">
          <Select value={draft.role} onChange={(value) => setDraft({ ...draft, role: value })} options={usageRoles} />
        </Field>
        <Field label="顺序">
          <Input value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} inputMode="numeric" />
        </Field>
      </div>
      <ReviewFields source={draft.source} status={draft.status} onSource={(source) => setDraft({ ...draft, source })} onStatus={(status) => setDraft({ ...draft, status })} />
      <Field label="证据">
        <Textarea value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })} className="min-h-[88px]" />
      </Field>
      <Field label="元数据 JSON">
        <Textarea value={draft.metadata_json} onChange={(event) => setDraft({ ...draft, metadata_json: event.target.value })} className="min-h-[72px] font-mono text-xs" />
      </Field>
    </div>
  )
}

function RelationshipForm({ draft, setDraft, references }: {
  draft: RelationshipDraft
  setDraft: (draft: RelationshipDraft) => void
  references: CreativeReference[]
}) {
  return (
    <div className="space-y-4">
      <Field label="来源资料">
        <ReferenceSelect value={draft.source_creative_reference_id} onChange={(value) => setDraft({ ...draft, source_creative_reference_id: value })} references={references} />
      </Field>
      <Field label="目标资料">
        <ReferenceSelect value={draft.target_creative_reference_id} onChange={(value) => setDraft({ ...draft, target_creative_reference_id: value })} references={references} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="作用范围">
          <Select value={draft.scope_type} onChange={(value) => setDraft({ ...draft, scope_type: value })} options={scopeTypes} labels={{ '': '项目级/不限定' }} />
        </Field>
        <Field label="范围 ID">
          <Input value={draft.scope_id} onChange={(event) => setDraft({ ...draft, scope_id: event.target.value })} inputMode="numeric" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="分类">
          <Select value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} options={relationshipCategories} />
        </Field>
        <Field label="关系类型">
          <Input value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} placeholder="friend / owns / appears_with" />
        </Field>
      </div>
      <Field label="显示名称">
        <Input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
      </Field>
      <Field label="描述">
        <Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="min-h-[88px]" />
      </Field>
      <ReviewFields source={draft.source} status={draft.status} onSource={(source) => setDraft({ ...draft, source })} onStatus={(status) => setDraft({ ...draft, status })} />
      <Field label="证据">
        <Textarea value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })} className="min-h-[76px]" />
      </Field>
      <Field label="元数据 JSON">
        <Textarea value={draft.metadata_json} onChange={(event) => setDraft({ ...draft, metadata_json: event.target.value })} className="min-h-[72px] font-mono text-xs" />
      </Field>
    </div>
  )
}

function ReviewFields({ source, status, onSource, onStatus }: {
  source: string
  status: string
  onSource: (source: string) => void
  onStatus: (status: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="来源">
        <Select value={source} onChange={onSource} options={sources} />
      </Field>
      <Field label="状态">
        <Select value={status} onChange={onStatus} options={statuses} />
      </Field>
    </div>
  )
}

function UsageRow({ record, active, onClick }: { record: CreativeReferenceUsage; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('w-full rounded-lg border p-3 text-left transition-colors', active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="truncate">{record.owner_type} #{record.owner_id}</span>
            <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{referenceName(record.creative_reference)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{record.creative_reference_state?.name ?? record.evidence ?? '未填写状态或证据'}</p>
        </div>
        <RelationBadges source={record.source} status={record.status} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{record.role || 'role'}</Badge>
        <span>order {record.order ?? 0}</span>
      </div>
    </button>
  )
}

function RelationshipRow({ record, active, onClick }: { record: CreativeRelationship; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('w-full rounded-lg border p-3 text-left transition-colors', active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="truncate">{referenceName(record.source_creative_reference)}</span>
            <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{referenceName(record.target_creative_reference)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{record.label || record.description || record.evidence || '未填写描述'}</p>
        </div>
        <RelationBadges source={record.source} status={record.status} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{record.category || 'relationship'}</Badge>
        {record.type && <span>{record.type}</span>}
        {record.scope_type && <span>{record.scope_type}{record.scope_id ? ` #${record.scope_id}` : ''}</span>}
      </div>
    </button>
  )
}

function RelationBadges({ source, status }: { source?: string; status?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className={cn('rounded px-1.5 py-0.5 text-[11px]', sourceTone[source ?? 'manual'] ?? sourceTone.manual)}>{source || 'manual'}</span>
      <span className={cn('rounded px-1.5 py-0.5 text-[11px]', statusTone[status ?? 'draft'] ?? statusTone.draft)}>{status || 'draft'}</span>
    </div>
  )
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Link2; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className={tone} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function SegmentButton({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: typeof Link2; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors', active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
      <Icon size={15} />
      <span className="flex-1 truncate">{label}</span>
      <span className={cn('rounded px-1.5 py-0.5 text-[11px]', active ? 'bg-background/15' : 'bg-muted text-muted-foreground')}>{count}</span>
    </button>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-xs font-semibold text-foreground">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </label>
  )
}

function Select({ value, onChange, options, labels }: { value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
      {options.map((item) => <option key={item || 'empty'} value={item}>{labels?.[item] ?? item}</option>)}
    </select>
  )
}

function ReferenceSelect({ value, onChange, references }: { value: string; onChange: (value: string) => void; references: CreativeReference[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" required>
      <option value="">选择创作资料</option>
      {references.map((reference) => (
        <option key={reference.ID} value={reference.ID}>{reference.name} · {reference.kind} #{reference.ID}</option>
      ))}
    </select>
  )
}

function EmptyState() {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
      <Link2 size={22} className="text-muted-foreground" />
      <p className="mt-2 text-sm font-medium text-foreground">没有匹配的关系</p>
      <p className="mt-1 text-xs text-muted-foreground">调整筛选或新建一条关系。</p>
    </div>
  )
}

function hydrateUsage(item: CreativeReferenceUsage, references: CreativeReference[], states: CreativeReferenceState[]) {
  return {
    ...item,
    creative_reference: item.creative_reference ?? references.find((reference) => reference.ID === item.creative_reference_id),
    creative_reference_state: item.creative_reference_state ?? states.find((state) => state.ID === item.creative_reference_state_id),
  }
}

function hydrateRelationship(item: CreativeRelationship, references: CreativeReference[]) {
  return {
    ...item,
    source_creative_reference: item.source_creative_reference ?? references.find((reference) => reference.ID === item.source_creative_reference_id),
    target_creative_reference: item.target_creative_reference ?? references.find((reference) => reference.ID === item.target_creative_reference_id),
  }
}

function referenceName(reference?: CreativeReference) {
  if (!reference) return '未选择资料'
  return `${reference.name} #${reference.ID}`
}

function usageToDraft(record: CreativeReferenceUsage): UsageDraft {
  return {
    owner_type: record.owner_type ?? 'content_unit',
    owner_id: String(record.owner_id ?? ''),
    creative_reference_id: String(record.creative_reference_id ?? ''),
    creative_reference_state_id: record.creative_reference_state_id ? String(record.creative_reference_state_id) : '',
    role: record.role ?? 'protagonist',
    order: String(record.order ?? 0),
    evidence: record.evidence ?? '',
    source: record.source ?? 'manual',
    status: record.status ?? 'draft',
    metadata_json: record.metadata_json ?? '',
  }
}

function relationshipToDraft(record: CreativeRelationship): RelationshipDraft {
  return {
    source_creative_reference_id: String(record.source_creative_reference_id ?? ''),
    target_creative_reference_id: String(record.target_creative_reference_id ?? ''),
    scope_type: record.scope_type ?? '',
    scope_id: record.scope_id ? String(record.scope_id) : '',
    category: record.category ?? 'relationship',
    type: record.type ?? '',
    label: record.label ?? '',
    description: record.description ?? '',
    evidence: record.evidence ?? '',
    source: record.source ?? 'manual',
    status: record.status ?? 'draft',
    metadata_json: record.metadata_json ?? '',
  }
}

function usageDraftToPayload(draft: UsageDraft): UsagePayload | null {
  const ownerID = Number(draft.owner_id)
  const referenceID = Number(draft.creative_reference_id)
  if (!draft.owner_type || !ownerID || !referenceID) return null
  return {
    owner_type: draft.owner_type,
    owner_id: ownerID,
    creative_reference_id: referenceID,
    creative_reference_state_id: draft.creative_reference_state_id ? Number(draft.creative_reference_state_id) : null,
    role: draft.role,
    order: Number(draft.order) || 0,
    evidence: draft.evidence,
    source: draft.source,
    status: draft.status,
    metadata_json: draft.metadata_json,
  }
}

function relationshipDraftToPayload(draft: RelationshipDraft): RelationshipPayload | null {
  const sourceID = Number(draft.source_creative_reference_id)
  const targetID = Number(draft.target_creative_reference_id)
  if (!sourceID || !targetID) return null
  return {
    source_creative_reference_id: sourceID,
    target_creative_reference_id: targetID,
    scope_type: draft.scope_type,
    scope_id: draft.scope_id ? Number(draft.scope_id) : null,
    category: draft.category,
    type: draft.type,
    label: draft.label,
    description: draft.description,
    evidence: draft.evidence,
    source: draft.source,
    status: draft.status,
    metadata_json: draft.metadata_json,
  }
}

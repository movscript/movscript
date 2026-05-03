import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  Clock3,
  Film,
  GitBranch,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Sparkles,
  Sparkle,
  Trash2,
  Wand2,
  X,
  CheckCheck,
  Check,
  Diff,
  LayoutList,
} from 'lucide-react'

import {
  createSemanticEntity,
  deleteSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { Badge, Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@movscript/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EntityFilter = 'all' | 'segments' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'

type SegmentRecord = SemanticEntityRecord & {
  title?: string; kind?: string; summary?: string; content?: string
  source_range?: string; order?: number; status?: string; script_version_id?: number
}
type SceneMomentRecord = SemanticEntityRecord & {
  segment_id?: number; title?: string; time_text?: string; location_text?: string
  action_text?: string; mood?: string; order?: number; status?: string; description?: string
}
type CreativeReferenceRecord = SemanticEntityRecord & {
  name?: string; kind?: string; importance?: string; status?: string; description?: string; alias?: string
}
type AssetSlotRecord = SemanticEntityRecord & {
  production_id?: number; name?: string; kind?: string; priority?: string; status?: string
  description?: string; owner_type?: string; owner_id?: number
}
type ContentUnitRecord = SemanticEntityRecord & {
  production_id?: number; segment_id?: number; scene_moment_id?: number
  title?: string; kind?: string; order?: number; duration_sec?: number; description?: string
  shot_size?: string; camera_angle?: string; camera_motion?: string; status?: string; prompt?: string
}

interface OrchestrationData {
  productions: SemanticEntityRecord[]
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
}

// AI analysis output types
interface AISegmentCandidate { [k: string]: unknown; client_id: string; order: number; title: string; summary: string; source_range?: string }
interface AISceneMomentCandidate { [k: string]: unknown; client_id: string; segment_id: string; order: number; title: string; time_text?: string; location_text?: string; action_text?: string; mood?: string }
interface AICreativeReferenceCandidate { [k: string]: unknown; client_id: string; name: string; type: string; importance: string; description?: string }
interface AIAssetSlotCandidate { [k: string]: unknown; client_id: string; segment_id?: string; name: string; type: string; description?: string; priority: string }
interface AIContentUnitCandidate { [k: string]: unknown; client_id: string; segment_id?: string; scene_moment_id?: string; order: number; type: string; description?: string; shot_size?: string; camera_angle?: string }

interface AIAnalysisResult {
  segments: AISegmentCandidate[]
  scene_moments: AISceneMomentCandidate[]
  creative_references: AICreativeReferenceCandidate[]
  asset_slots: AIAssetSlotCandidate[]
  content_units: AIContentUnitCandidate[]
}

type CandidateStatus = 'pending' | 'accepted' | 'rejected'

interface TrackedCandidate<T> { data: T; status: CandidateStatus }

interface TrackedCandidates {
  segments: TrackedCandidate<AISegmentCandidate>[]
  scene_moments: TrackedCandidate<AISceneMomentCandidate>[]
  creative_references: TrackedCandidate<AICreativeReferenceCandidate>[]
  asset_slots: TrackedCandidate<AIAssetSlotCandidate>[]
  content_units: TrackedCandidate<AIContentUnitCandidate>[]
}

interface ModelConfig { id: number; display_name?: string; name?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const filterDefs: { key: EntityFilter; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: '全部', icon: LayoutList },
  { key: 'segments', label: '片段', icon: GitBranch },
  { key: 'sceneMoments', label: '情节', icon: Route },
  { key: 'creativeReferences', label: '创作资料', icon: Sparkles },
  { key: 'assetSlots', label: '素材需求', icon: PackageCheck },
  { key: 'contentUnits', label: '内容单元', icon: Film },
]

const statusTone: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  locked:    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  accepted:  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  active:    'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  draft:     'bg-muted text-muted-foreground',
  candidate: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  missing:   'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ignored:   'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  rejected:  'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  blocked:   'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  in_production: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
}

const statusLabel: Record<string, string> = {
  confirmed: '已确认', locked: '已锁定', accepted: '已采纳', active: '进行中',
  draft: '草稿', candidate: '候选', missing: '缺素材', ignored: '已忽略',
  rejected: '已拒绝', blocked: '阻塞', in_production: '生产中',
  low: '低', normal: '普通', high: '高', critical: '紧急',
}

const segmentKindLabel: Record<string, string> = {
  section: '片段', scene: '场次', montage: '蒙太奇', narration: '旁白',
  product_showcase: '产品展示', title_card: '标题卡', transition: '转场',
}

const contentUnitKindLabel: Record<string, string> = {
  shot: '镜头', visual_segment: '视觉段', product_showcase: '产品展示',
  caption_card: '字幕卡', narration: '旁白', transition: '转场', music_beat: '节拍',
}

const creativeReferenceKindLabel: Record<string, string> = {
  person: '人物', place: '地点', prop: '道具', product: '产品',
  brand: '品牌', style: '风格', world_rule: '世界规则', time_period: '时间段', restriction: '限制',
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadOrchestrationData(projectId: number): Promise<OrchestrationData> {
  const [productions, segments, sceneMoments, creativeReferences, assetSlots, contentUnits] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('productions')),
    listSemanticEntities(projectId, semanticEntityConfig('segments')),
    listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferences')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
  ])
  return {
    productions,
    segments: segments as SegmentRecord[],
    sceneMoments: sceneMoments as SceneMomentRecord[],
    creativeReferences: creativeReferences as CreativeReferenceRecord[],
    assetSlots: assetSlots as AssetSlotRecord[],
    contentUnits: contentUnits as ContentUnitRecord[],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProductionOrchestratePage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [searchParams, setSearchParams] = useSearchParams()
  const productionId = Number(searchParams.get('productionId')) || 0

  const [filter, setFilter] = useState<EntityFilter>('all')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [createType, setCreateType] = useState<EntityFilter | null>(null)
  const [editEntry, setEditEntry] = useState<{ type: EntityFilter; record: SemanticEntityRecord } | null>(null)
  const [candidates, setCandidates] = useState<TrackedCandidates | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [aiPanelOpen, setAIPanelOpen] = useState(false)

  const queryKey = ['production-orchestrate', projectId] as const
  const { data, isLoading, isFetching, refetch } = useQuery<OrchestrationData>({
    queryKey,
    queryFn: () => loadOrchestrationData(projectId!),
    enabled: !!projectId,
  })

  const productions = data?.productions ?? []
  const selectedProduction = productions.find((p) => p.ID === productionId) ?? productions[0]
  const effectiveProductionId = selectedProduction?.ID ?? 0

  const allSegments = useMemo(() => (data?.segments ?? []).slice().sort(byOrder), [data?.segments])
  const allSceneMoments = useMemo(() => (data?.sceneMoments ?? []).slice().sort(byOrder), [data?.sceneMoments])
  const allCreativeReferences = data?.creativeReferences ?? []
  const allAssetSlots = useMemo(
    () => (data?.assetSlots ?? []).filter((s) => !effectiveProductionId || Number(s.production_id) === effectiveProductionId),
    [data?.assetSlots, effectiveProductionId]
  )
  const allContentUnits = useMemo(
    () => (data?.contentUnits ?? []).filter((u) => !effectiveProductionId || Number(u.production_id) === effectiveProductionId).sort(byOrder),
    [data?.contentUnits, effectiveProductionId]
  )

  const filterCounts = {
    segments: allSegments.length,
    sceneMoments: allSceneMoments.length,
    creativeReferences: allCreativeReferences.length,
    assetSlots: allAssetSlots.length,
    contentUnits: allContentUnits.length,
  }

  const pendingCandidateCount = candidates
    ? countPending(candidates.segments) + countPending(candidates.scene_moments) +
      countPending(candidates.creative_references) + countPending(candidates.asset_slots) +
      countPending(candidates.content_units)
    : 0

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAcceptCandidate(key: keyof TrackedCandidates, clientId: string) {
    setCandidates((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: (prev[key] as TrackedCandidate<{ client_id: string }>[]).map((c) =>
          c.data.client_id === clientId ? { ...c, status: 'accepted' as CandidateStatus } : c
        ),
      }
    })
  }

  function handleRejectCandidate(key: keyof TrackedCandidates, clientId: string) {
    setCandidates((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: (prev[key] as TrackedCandidate<{ client_id: string }>[]).map((c) =>
          c.data.client_id === clientId ? { ...c, status: 'rejected' as CandidateStatus } : c
        ),
      }
    })
  }

  function handleSelectProduction(id: string) {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('productionId', id)
    else next.delete('productionId')
    setSearchParams(next, { replace: true })
  }

  function handleClearCandidates() {
    setCandidates(null)
    setShowDiff(false)
  }

  const sharedEntityProps = {
    projectId,
    productionId: effectiveProductionId,
    queryKey,
    expandedIds,
    onToggleExpand: toggleExpand,
    onEdit: (type: EntityFilter, record: SemanticEntityRecord) => setEditEntry({ type, record }),
    onCreateChild: (type: EntityFilter) => setCreateType(type),
    candidates,
    showDiff,
    onAcceptCandidate: handleAcceptCandidate,
    onRejectCandidate: handleRejectCandidate,
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Boxes size={13} />
              <Link to="/production" className="hover:underline">{project?.name ?? '项目'}</Link>
              <ChevronRight size={12} />
              <span>制作编排</span>
            </div>
            {productions.length > 0 && (
              <Select value={String(effectiveProductionId || '')} onValueChange={handleSelectProduction}>
                <SelectTrigger className="h-7 w-44 text-xs">
                  <SelectValue placeholder="选择制作" />
                </SelectTrigger>
                <SelectContent>
                  {productions.map((p) => (
                    <SelectItem key={p.ID} value={String(p.ID)}>
                      {String(p.name ?? `制作 #${p.ID}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isFetching && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            {candidates && (
              <>
                <Button
                  size="sm"
                  variant={showDiff ? 'secondary' : 'outline'}
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowDiff((v) => !v)}
                >
                  <Diff size={13} />
                  {showDiff ? '隐藏差异' : '查看差异'}
                  {pendingCandidateCount > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                      {pendingCandidateCount}
                    </Badge>
                  )}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={handleClearCandidates}>
                  <X size={13} />
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => refetch()}>
              <RefreshCw size={13} />
              刷新
            </Button>
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAIPanelOpen(true)}>
              <Wand2 size={13} />
              AI分析
            </Button>
          </div>
        </div>
      </header>

      {/* Filter tabs */}
      <div className="shrink-0 border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {filterDefs.map(({ key, label, icon: Icon }) => {
            const count = key === 'all' ? undefined : filterCounts[key as keyof typeof filterCounts]
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors whitespace-nowrap',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon size={13} />
                {label}
                {count !== undefined && (
                  <span className={cn('rounded-full px-1.5 py-0 text-[10px] tabular-nums', active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
              onClick={() => setCreateType(filter === 'all' ? 'segments' : filter)}
            >
              <Plus size={12} />
              新增{filter === 'all' ? '片段' : filterDefs.find((f) => f.key === filter)?.label ?? ''}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            加载中…
          </div>
        ) : filter === 'all' ? (
          <AllView
            segments={allSegments}
            sceneMoments={allSceneMoments}
            creativeReferences={allCreativeReferences}
            assetSlots={allAssetSlots}
            contentUnits={allContentUnits}
            onAddSegment={() => setCreateType('segments')}
            onAddReference={() => setCreateType('creativeReferences')}
            onAddAsset={() => setCreateType('assetSlots')}
            {...sharedEntityProps}
          />
        ) : filter === 'segments' ? (
          <TypeSection
            type="segments"
            label="片段"
            icon={GitBranch}
            items={allSegments}
            renderRow={(seg) => (
              <SegmentRow key={seg.ID} segment={seg as SegmentRecord} sceneMoments={allSceneMoments} contentUnits={allContentUnits} {...sharedEntityProps} />
            )}
            pendingCandidates={(showDiff ? (candidates?.segments.filter((c) => c.status === 'pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
            renderCandidate={(c) => {
              const data = c.data as AISegmentCandidate
              return (
                <AISegmentRow key={data.client_id} candidate={data} onAccept={async () => {
                  const saved = await createSemanticEntity(projectId!, semanticEntityConfig('segments'), {
                    title: data.title, summary: data.summary, kind: 'section', status: 'draft', order: data.order, source_range: data.source_range ?? ''
                  })
                  handleAcceptCandidate('segments', data.client_id)
                  toast.success(`片段「${saved.title}」已创建`)
                  refetch()
                }} onReject={() => handleRejectCandidate('segments', data.client_id)} />
              )
            }}
            onAdd={() => setCreateType('segments')}
          />
        ) : filter === 'sceneMoments' ? (
          <TypeSection
            type="sceneMoments"
            label="情节"
            icon={Route}
            items={allSceneMoments}
            renderRow={(sm) => (
              <SceneMomentRow key={sm.ID} moment={sm as SceneMomentRecord} segments={allSegments} {...sharedEntityProps} />
            )}
            pendingCandidates={(showDiff ? (candidates?.scene_moments.filter((c) => c.status === 'pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
            renderCandidate={(c) => {
              const data = c.data as AISceneMomentCandidate
              return (
                <AISceneMomentRow key={data.client_id} candidate={data} onAccept={async () => {
                  const saved = await createSemanticEntity(projectId!, semanticEntityConfig('sceneMoments'), {
                    title: data.title, time_text: data.time_text ?? '', location_text: data.location_text ?? '',
                    action_text: data.action_text ?? '', mood: data.mood ?? '', status: 'draft', order: data.order
                  })
                  handleAcceptCandidate('scene_moments', data.client_id)
                  toast.success(`情节「${saved.title}」已创建`)
                  refetch()
                }} onReject={() => handleRejectCandidate('scene_moments', data.client_id)} />
              )
            }}
            onAdd={() => setCreateType('sceneMoments')}
          />
        ) : filter === 'creativeReferences' ? (
          <TypeSection
            type="creativeReferences"
            label="创作资料"
            icon={Sparkles}
            items={allCreativeReferences}
            renderRow={(ref) => (
              <CreativeReferenceRow key={ref.ID} reference={ref as CreativeReferenceRecord} {...sharedEntityProps} />
            )}
            pendingCandidates={(showDiff ? (candidates?.creative_references.filter((c) => c.status === 'pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
            renderCandidate={(c) => {
              const data = c.data as AICreativeReferenceCandidate
              return (
                <AICreativeReferenceRow key={data.client_id} candidate={data} onAccept={async () => {
                  const saved = await createSemanticEntity(projectId!, semanticEntityConfig('creativeReferences'), {
                    name: data.name, kind: data.type, importance: data.importance, description: data.description ?? '', status: 'draft'
                  })
                  handleAcceptCandidate('creative_references', data.client_id)
                  toast.success(`创作资料「${saved.name}」已创建`)
                  refetch()
                }} onReject={() => handleRejectCandidate('creative_references', data.client_id)} />
              )
            }}
            onAdd={() => setCreateType('creativeReferences')}
          />
        ) : filter === 'assetSlots' ? (
          <TypeSection
            type="assetSlots"
            label="素材需求"
            icon={PackageCheck}
            items={allAssetSlots}
            renderRow={(slot) => (
              <AssetSlotRow key={slot.ID} slot={slot as AssetSlotRecord} {...sharedEntityProps} />
            )}
            pendingCandidates={(showDiff ? (candidates?.asset_slots.filter((c) => c.status === 'pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
            renderCandidate={(c) => {
              const data = c.data as AIAssetSlotCandidate
              return (
                <AIAssetSlotRow key={data.client_id} candidate={data} onAccept={async () => {
                  const saved = await createSemanticEntity(projectId!, semanticEntityConfig('assetSlots'), {
                    name: data.name, kind: data.type, priority: data.priority, description: data.description ?? '', status: 'missing',
                    production_id: effectiveProductionId || ''
                  })
                  handleAcceptCandidate('asset_slots', data.client_id)
                  toast.success(`素材需求「${saved.name}」已创建`)
                  refetch()
                }} onReject={() => handleRejectCandidate('asset_slots', data.client_id)} />
              )
            }}
            onAdd={() => setCreateType('assetSlots')}
          />
        ) : filter === 'contentUnits' ? (
          <TypeSection
            type="contentUnits"
            label="内容单元"
            icon={Film}
            items={allContentUnits}
            renderRow={(cu) => (
              <ContentUnitRow key={cu.ID} unit={cu as ContentUnitRecord} segments={allSegments} sceneMoments={allSceneMoments} {...sharedEntityProps} />
            )}
            pendingCandidates={(showDiff ? (candidates?.content_units.filter((c) => c.status === 'pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
            renderCandidate={(c) => {
              const data = c.data as AIContentUnitCandidate
              return (
                <AIContentUnitRow key={data.client_id} candidate={data} onAccept={async () => {
                  const saved = await createSemanticEntity(projectId!, semanticEntityConfig('contentUnits'), {
                    title: data.description ?? `镜头 ${data.order}`, kind: data.type, description: data.description ?? '',
                    shot_size: data.shot_size ?? '', camera_angle: data.camera_angle ?? '', order: data.order,
                    status: 'draft', production_id: effectiveProductionId || ''
                  })
                  handleAcceptCandidate('content_units', data.client_id)
                  toast.success(`内容单元「${saved.title}」已创建`)
                  refetch()
                }} onReject={() => handleRejectCandidate('content_units', data.client_id)} />
              )
            }}
            onAdd={() => setCreateType('contentUnits')}
          />
        ) : null}
      </div>

      {/* CRUD dialogs */}
      {createType && createType !== 'all' && (
        <SemanticEntityCrudDialog
          open
          mode="create"
          projectId={projectId}
          config={semanticEntityConfig(createType)}
          defaults={createDefaultsForType(createType, effectiveProductionId)}
          queryKey={queryKey}
          title={`新增${filterDefs.find((f) => f.key === createType)?.label ?? ''}`}
          onOpenChange={(open) => { if (!open) setCreateType(null) }}
          onSaved={() => setCreateType(null)}
        />
      )}
      {editEntry && (
        <SemanticEntityCrudDialog
          open
          mode="edit"
          projectId={projectId}
          config={semanticEntityConfig(editEntry.type as Parameters<typeof semanticEntityConfig>[0])}
          record={editEntry.record}
          queryKey={queryKey}
          title={`编辑${filterDefs.find((f) => f.key === editEntry.type)?.label ?? ''}`}
          onOpenChange={(open) => { if (!open) setEditEntry(null) }}
          onSaved={() => setEditEntry(null)}
        />
      )}

      {/* AI analysis panel */}
      {aiPanelOpen && (
        <AIAnalysisPanel
          projectId={projectId}
          onClose={() => setAIPanelOpen(false)}
          onResult={(result) => {
            setCandidates({
              segments: result.segments.map((d) => ({ data: d, status: 'pending' })),
              scene_moments: result.scene_moments.map((d) => ({ data: d, status: 'pending' })),
              creative_references: result.creative_references.map((d) => ({ data: d, status: 'pending' })),
              asset_slots: result.asset_slots.map((d) => ({ data: d, status: 'pending' })),
              content_units: result.content_units.map((d) => ({ data: d, status: 'pending' })),
            })
            setShowDiff(true)
            setAIPanelOpen(false)
            toast.success(`AI分析完成：${result.segments.length} 片段，${result.scene_moments.length} 情节，${result.creative_references.length} 资料，${result.asset_slots.length} 素材，${result.content_units.length} 内容单元`)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// All view (hierarchy)
// ─────────────────────────────────────────────────────────────────────────────

interface AllViewProps {
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  projectId?: number
  productionId: number
  queryKey: readonly unknown[]
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onEdit: (type: EntityFilter, record: SemanticEntityRecord) => void
  onCreateChild: (type: EntityFilter) => void
  onAddSegment: () => void
  onAddReference: () => void
  onAddAsset: () => void
  candidates: TrackedCandidates | null
  showDiff: boolean
  onAcceptCandidate: (key: keyof TrackedCandidates, clientId: string) => void
  onRejectCandidate: (key: keyof TrackedCandidates, clientId: string) => void
}

function AllView({ segments, sceneMoments, creativeReferences, assetSlots, contentUnits, projectId, productionId, queryKey, expandedIds, onToggleExpand, onEdit, onAddSegment, onAddReference, onAddAsset, candidates, showDiff, onAcceptCandidate, onRejectCandidate }: AllViewProps) {
  const sharedEntityProps = { projectId, productionId, queryKey, expandedIds, onToggleExpand, onEdit, onCreateChild: () => {}, candidates, showDiff, onAcceptCandidate, onRejectCandidate }

  return (
    <div className="divide-y divide-border">
      {/* Segments + Scene Moments + Content Units */}
      <section>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <GitBranch size={13} />
            片段 · 情节 · 内容单元
          </div>
          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={onAddSegment}>
            <Plus size={11} />新增片段
          </button>
        </div>
        {showDiff && candidates && candidates.segments.filter((c) => c.status === 'pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 新增候选</p>
            {candidates.segments.filter((c) => c.status === 'pending').map((c) => (
              <AISegmentRow key={c.data.client_id} candidate={c.data}
                onAccept={async () => {
                  if (!projectId) return
                  const saved = await createSemanticEntity(projectId, semanticEntityConfig('segments'), { title: c.data.title, summary: c.data.summary, kind: 'section', status: 'draft', order: c.data.order, source_range: c.data.source_range ?? '' })
                  onAcceptCandidate('segments', c.data.client_id)
                  toast.success(`片段「${saved.title}」已创建`)
                }}
                onReject={() => onRejectCandidate('segments', c.data.client_id)}
              />
            ))}
          </div>
        )}
        {segments.length === 0 ? (
          <EmptySection text="暂无片段" onAdd={onAddSegment} />
        ) : (
          <div className="divide-y divide-border/50">
            {segments.map((seg) => (
              <SegmentRow key={seg.ID} segment={seg} sceneMoments={sceneMoments} contentUnits={contentUnits} {...sharedEntityProps} />
            ))}
          </div>
        )}
      </section>

      {/* Creative References */}
      <section>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Sparkles size={13} />
            创作资料
          </div>
          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={onAddReference}>
            <Plus size={11} />新增资料
          </button>
        </div>
        {showDiff && candidates && candidates.creative_references.filter((c) => c.status === 'pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 新增候选</p>
            {candidates.creative_references.filter((c) => c.status === 'pending').map((c) => (
              <AICreativeReferenceRow key={c.data.client_id} candidate={c.data}
                onAccept={async () => {
                  if (!projectId) return
                  const saved = await createSemanticEntity(projectId, semanticEntityConfig('creativeReferences'), { name: c.data.name, kind: c.data.type, importance: c.data.importance, description: c.data.description ?? '', status: 'draft' })
                  onAcceptCandidate('creative_references', c.data.client_id)
                  toast.success(`创作资料「${saved.name}」已创建`)
                }}
                onReject={() => onRejectCandidate('creative_references', c.data.client_id)}
              />
            ))}
          </div>
        )}
        {creativeReferences.length === 0 ? (
          <EmptySection text="暂无创作资料" onAdd={onAddReference} />
        ) : (
          <div className="divide-y divide-border/50">
            {creativeReferences.map((ref) => (
              <CreativeReferenceRow key={ref.ID} reference={ref} {...sharedEntityProps} />
            ))}
          </div>
        )}
      </section>

      {/* Asset Slots */}
      <section>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <PackageCheck size={13} />
            素材需求
          </div>
          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={onAddAsset}>
            <Plus size={11} />新增素材
          </button>
        </div>
        {showDiff && candidates && candidates.asset_slots.filter((c) => c.status === 'pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 新增候选</p>
            {candidates.asset_slots.filter((c) => c.status === 'pending').map((c) => (
              <AIAssetSlotRow key={c.data.client_id} candidate={c.data}
                onAccept={async () => {
                  if (!projectId) return
                  const saved = await createSemanticEntity(projectId, semanticEntityConfig('assetSlots'), { name: c.data.name, kind: c.data.type, priority: c.data.priority, description: c.data.description ?? '', status: 'missing', production_id: productionId || '' })
                  onAcceptCandidate('asset_slots', c.data.client_id)
                  toast.success(`素材需求「${saved.name}」已创建`)
                }}
                onReject={() => onRejectCandidate('asset_slots', c.data.client_id)}
              />
            ))}
          </div>
        )}
        {assetSlots.length === 0 ? (
          <EmptySection text="暂无素材需求" onAdd={onAddAsset} />
        ) : (
          <div className="divide-y divide-border/50">
            {assetSlots.map((slot) => (
              <AssetSlotRow key={slot.ID} slot={slot} {...sharedEntityProps} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Type section (flat list per filter)
// ─────────────────────────────────────────────────────────────────────────────

interface TypeSectionProps {
  type: EntityFilter
  label: string
  icon: LucideIcon
  items: SemanticEntityRecord[]
  renderRow: (item: SemanticEntityRecord) => React.ReactNode
  pendingCandidates: TrackedCandidate<Record<string, unknown> & { client_id: string }>[]
  renderCandidate: (c: TrackedCandidate<Record<string, unknown> & { client_id: string }>) => React.ReactNode
  onAdd: () => void
}

function TypeSection({ label, icon: Icon, items, renderRow, pendingCandidates, renderCandidate, onAdd }: TypeSectionProps) {
  return (
    <div className="divide-y divide-border/50">
      {pendingCandidates.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50/50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-2">
            <Sparkle size={13} className="text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">AI 分析候选 · {pendingCandidates.length} 条待确认</span>
          </div>
          <div className="space-y-1.5">
            {pendingCandidates.map((c) => renderCandidate(c))}
          </div>
        </div>
      )}
      {items.length === 0 && pendingCandidates.length === 0 ? (
        <EmptySection text={`暂无${label}`} onAdd={onAdd} />
      ) : (
        items.map((item) => renderRow(item))
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity rows
// ─────────────────────────────────────────────────────────────────────────────

interface SharedRowProps {
  projectId?: number
  productionId: number
  queryKey: readonly unknown[]
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onEdit: (type: EntityFilter, record: SemanticEntityRecord) => void
  onCreateChild: (type: EntityFilter) => void
  candidates: TrackedCandidates | null
  showDiff: boolean
  onAcceptCandidate: (key: keyof TrackedCandidates, clientId: string) => void
  onRejectCandidate: (key: keyof TrackedCandidates, clientId: string) => void
}

function SegmentRow({ segment, sceneMoments, contentUnits, projectId, queryKey, expandedIds, onToggleExpand, onEdit }: { segment: SegmentRecord; sceneMoments: SceneMomentRecord[]; contentUnits: ContentUnitRecord[] } & SharedRowProps) {
  const queryClient = useQueryClient()
  const expandId = `segment-${segment.ID}`
  const expanded = expandedIds.has(expandId)
  const childSceneMoments = sceneMoments.filter((sm) => sm.segment_id === segment.ID)
  const childContentUnits = contentUnits.filter((cu) => cu.segment_id === segment.ID)
  const totalDuration = childContentUnits.reduce((sum, cu) => sum + (Number(cu.duration_sec) || 0), 0)

  const deleteMutation = useMutation({
    mutationFn: () => deleteSemanticEntity(projectId!, semanticEntityConfig('segments'), segment.ID),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('片段已删除') },
    onError: () => toast.error('删除失败'),
  })

  return (
    <div className={cn('group/seg', expanded && 'bg-muted/20')}>
      <div className="flex items-start gap-2 px-4 py-2.5">
        <button type="button" onClick={() => onToggleExpand(expandId)} className="mt-1 shrink-0 text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{String(segment.title ?? `片段 #${segment.ID}`)}</span>
            {segment.kind && <Badge variant="secondary" className="text-[10px]">{segmentKindLabel[String(segment.kind)] ?? String(segment.kind)}</Badge>}
            {segment.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(segment.status)])}>{statusLabel[String(segment.status)] ?? String(segment.status)}</Badge>}
            {childSceneMoments.length > 0 && <span className="text-[10px] text-muted-foreground">{childSceneMoments.length} 情节</span>}
            {childContentUnits.length > 0 && <span className="text-[10px] text-muted-foreground">{childContentUnits.length} 内容单元 {totalDuration > 0 ? `· ${totalDuration}s` : ''}</span>}
          </div>
          {segment.summary && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{String(segment.summary)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/seg:opacity-100">
          <button type="button" onClick={() => onEdit('segments', segment)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这个片段？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ml-6 border-l border-border/50 pl-3 pb-2">
          {/* Full detail */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-2 py-2 text-xs md:grid-cols-3">
            {segment.kind && <DetailField label="类型" value={segmentKindLabel[String(segment.kind)] ?? String(segment.kind)} />}
            {segment.order !== undefined && <DetailField label="顺序" value={String(segment.order)} />}
            {segment.source_range && <DetailField label="原文范围" value={String(segment.source_range)} />}
          </div>
          {segment.content && (
            <div className="px-2 pb-2">
              <p className="text-[10px] text-muted-foreground">内容</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{String(segment.content)}</p>
            </div>
          )}
          {/* Child scene moments */}
          {childSceneMoments.length > 0 && (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">情节</p>
              {childSceneMoments.map((sm) => (
                <SceneMomentRow key={sm.ID} moment={sm} segments={[]} projectId={projectId} productionId={0} queryKey={queryKey} expandedIds={expandedIds} onToggleExpand={onToggleExpand} onEdit={onEdit} onCreateChild={() => {}} candidates={null} showDiff={false} onAcceptCandidate={() => {}} onRejectCandidate={() => {}} />
              ))}
            </div>
          )}
          {/* Child content units */}
          {childContentUnits.length > 0 && (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">内容单元</p>
              {childContentUnits.map((cu) => (
                <ContentUnitRow key={cu.ID} unit={cu} segments={[]} sceneMoments={[]} projectId={projectId} productionId={0} queryKey={queryKey} expandedIds={expandedIds} onToggleExpand={onToggleExpand} onEdit={onEdit} onCreateChild={() => {}} candidates={null} showDiff={false} onAcceptCandidate={() => {}} onRejectCandidate={() => {}} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SceneMomentRow({ moment, segments, projectId, queryKey, expandedIds, onToggleExpand, onEdit }: { moment: SceneMomentRecord; segments: SegmentRecord[] } & SharedRowProps) {
  const queryClient = useQueryClient()
  const expandId = `scene_moment-${moment.ID}`
  const expanded = expandedIds.has(expandId)
  const parentSegment = segments.find((s) => s.ID === moment.segment_id)

  const deleteMutation = useMutation({
    mutationFn: () => deleteSemanticEntity(projectId!, semanticEntityConfig('sceneMoments'), moment.ID),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('情节已删除') },
    onError: () => toast.error('删除失败'),
  })

  return (
    <div className={cn('group/sm', expanded && 'bg-muted/20')}>
      <div className="flex items-start gap-2 px-4 py-2">
        <button type="button" onClick={() => onToggleExpand(expandId)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-foreground">{String(moment.title ?? `情节 #${moment.ID}`)}</span>
            {moment.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(moment.status)])}>{statusLabel[String(moment.status)] ?? String(moment.status)}</Badge>}
            {parentSegment && <span className="text-[10px] text-muted-foreground">片段: {String(parentSegment.title ?? `#${parentSegment.ID}`)}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {moment.time_text && <span>时间: {String(moment.time_text)}</span>}
            {moment.location_text && <span>地点: {String(moment.location_text)}</span>}
            {moment.mood && <span>情绪: {String(moment.mood)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/sm:opacity-100">
          <button type="button" onClick={() => onEdit('sceneMoments', moment)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这个情节？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ml-6 border-l border-border/50 pb-2 pl-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-2 py-2 text-xs md:grid-cols-3">
            {moment.time_text && <DetailField label="时间" value={String(moment.time_text)} />}
            {moment.location_text && <DetailField label="地点" value={String(moment.location_text)} />}
            {moment.mood && <DetailField label="情绪" value={String(moment.mood)} />}
          </div>
          {moment.action_text && (
            <div className="px-2 pb-2">
              <p className="text-[10px] text-muted-foreground">动作/事件</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">{String(moment.action_text)}</p>
            </div>
          )}
          {moment.description && (
            <div className="px-2 pb-2">
              <p className="text-[10px] text-muted-foreground">描述</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">{String(moment.description)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreativeReferenceRow({ reference, projectId, queryKey, expandedIds, onToggleExpand, onEdit }: { reference: CreativeReferenceRecord } & SharedRowProps) {
  const queryClient = useQueryClient()
  const expandId = `creative_reference-${reference.ID}`
  const expanded = expandedIds.has(expandId)

  const deleteMutation = useMutation({
    mutationFn: () => deleteSemanticEntity(projectId!, semanticEntityConfig('creativeReferences'), reference.ID),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('创作资料已删除') },
    onError: () => toast.error('删除失败'),
  })

  return (
    <div className={cn('group/cr', expanded && 'bg-muted/20')}>
      <div className="flex items-start gap-2 px-4 py-2">
        <button type="button" onClick={() => onToggleExpand(expandId)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-foreground">{String(reference.name ?? `资料 #${reference.ID}`)}</span>
            {reference.kind && <Badge variant="secondary" className="text-[10px]">{creativeReferenceKindLabel[String(reference.kind)] ?? String(reference.kind)}</Badge>}
            {reference.importance && <Badge variant="secondary" className="text-[10px]">{String(reference.importance) === 'main' ? '主要' : String(reference.importance) === 'supporting' ? '辅助' : '背景'}</Badge>}
            {reference.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(reference.status)])}>{statusLabel[String(reference.status)] ?? String(reference.status)}</Badge>}
          </div>
          {reference.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{String(reference.description)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/cr:opacity-100">
          <button type="button" onClick={() => onEdit('creativeReferences', reference)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这条创作资料？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && reference.description && (
        <div className="ml-6 border-l border-border/50 pb-2 pl-3">
          <div className="px-2 py-2">
            <p className="text-[10px] text-muted-foreground">描述</p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground">{String(reference.description)}</p>
          </div>
          {reference.alias && <div className="px-2 pb-2"><DetailField label="别名" value={String(reference.alias)} /></div>}
        </div>
      )}
    </div>
  )
}

function AssetSlotRow({ slot, projectId, queryKey, expandedIds, onToggleExpand, onEdit }: { slot: AssetSlotRecord } & SharedRowProps) {
  const queryClient = useQueryClient()
  const expandId = `asset_slot-${slot.ID}`
  const expanded = expandedIds.has(expandId)

  const deleteMutation = useMutation({
    mutationFn: () => deleteSemanticEntity(projectId!, semanticEntityConfig('assetSlots'), slot.ID),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('素材需求已删除') },
    onError: () => toast.error('删除失败'),
  })

  return (
    <div className={cn('group/as', expanded && 'bg-muted/20')}>
      <div className="flex items-start gap-2 px-4 py-2">
        <button type="button" onClick={() => onToggleExpand(expandId)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-foreground">{String(slot.name ?? `素材 #${slot.ID}`)}</span>
            {slot.kind && <Badge variant="secondary" className="text-[10px]">{String(slot.kind)}</Badge>}
            {slot.priority && <Badge variant="secondary" className="text-[10px]">{statusLabel[String(slot.priority)] ?? String(slot.priority)}</Badge>}
            {slot.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(slot.status)])}>{statusLabel[String(slot.status)] ?? String(slot.status)}</Badge>}
          </div>
          {slot.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{String(slot.description)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/as:opacity-100">
          <button type="button" onClick={() => onEdit('assetSlots', slot)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这个素材需求？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ml-6 border-l border-border/50 pb-2 pl-3">
          {slot.description && (
            <div className="px-2 py-2">
              <p className="text-[10px] text-muted-foreground">用途说明</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">{String(slot.description)}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-2 pb-2 text-xs md:grid-cols-3">
            {slot.owner_type && <DetailField label="归属类型" value={String(slot.owner_type)} />}
            {slot.owner_id && <DetailField label="归属ID" value={String(slot.owner_id)} />}
          </div>
        </div>
      )}
    </div>
  )
}

function ContentUnitRow({ unit, segments, sceneMoments, projectId, queryKey, expandedIds, onToggleExpand, onEdit }: { unit: ContentUnitRecord; segments: SegmentRecord[]; sceneMoments: SceneMomentRecord[] } & SharedRowProps) {
  const queryClient = useQueryClient()
  const expandId = `content_unit-${unit.ID}`
  const expanded = expandedIds.has(expandId)
  const parentSegment = segments.find((s) => s.ID === unit.segment_id)
  const parentSceneMoment = sceneMoments.find((sm) => sm.ID === unit.scene_moment_id)

  const deleteMutation = useMutation({
    mutationFn: () => deleteSemanticEntity(projectId!, semanticEntityConfig('contentUnits'), unit.ID),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('内容单元已删除') },
    onError: () => toast.error('删除失败'),
  })

  return (
    <div className={cn('group/cu', expanded && 'bg-muted/20')}>
      <div className="flex items-start gap-2 px-4 py-2">
        <button type="button" onClick={() => onToggleExpand(expandId)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-foreground">{String(unit.title ?? `内容单元 #${unit.ID}`)}</span>
            {unit.kind && <Badge variant="secondary" className="text-[10px]">{contentUnitKindLabel[String(unit.kind)] ?? String(unit.kind)}</Badge>}
            {unit.duration_sec && <span className="text-[10px] text-muted-foreground">{unit.duration_sec}s</span>}
            {unit.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(unit.status)])}>{statusLabel[String(unit.status)] ?? String(unit.status)}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {unit.shot_size && <span>景别: {String(unit.shot_size)}</span>}
            {unit.camera_angle && <span>机位: {String(unit.camera_angle)}</span>}
            {unit.camera_motion && <span>运镜: {String(unit.camera_motion)}</span>}
            {parentSegment && <span>片段: {String(parentSegment.title ?? `#${parentSegment.ID}`)}</span>}
            {parentSceneMoment && <span>情节: {String(parentSceneMoment.title ?? `#${parentSceneMoment.ID}`)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/cu:opacity-100">
          <button type="button" onClick={() => onEdit('contentUnits', unit)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这个内容单元？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ml-6 border-l border-border/50 pb-2 pl-3">
          {unit.description && (
            <div className="px-2 py-2">
              <p className="text-[10px] text-muted-foreground">描述</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">{String(unit.description)}</p>
            </div>
          )}
          {unit.prompt && (
            <div className="px-2 pb-2">
              <p className="text-[10px] text-muted-foreground">生成提示</p>
              <p className="mt-0.5 font-mono text-xs leading-relaxed text-foreground">{String(unit.prompt)}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-2 pb-2 text-xs md:grid-cols-3">
            {unit.shot_size && <DetailField label="景别" value={String(unit.shot_size)} />}
            {unit.camera_angle && <DetailField label="机位角度" value={String(unit.camera_angle)} />}
            {unit.camera_motion && <DetailField label="运镜方式" value={String(unit.camera_motion)} />}
            {unit.duration_sec && <DetailField label="时长" value={`${unit.duration_sec}s`} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI candidate rows
// ─────────────────────────────────────────────────────────────────────────────

function CandidateActions({ onAccept, onReject, loading }: { onAccept: () => void; onReject: () => void; loading?: boolean }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" disabled={loading} onClick={onAccept} className="flex items-center gap-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40">
        <Check size={11} />采纳
      </button>
      <button type="button" onClick={onReject} className="flex items-center gap-0.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
        <X size={11} />忽略
      </button>
    </div>
  )
}

function AISegmentRow({ candidate, onAccept, onReject }: { candidate: AISegmentCandidate; onAccept: () => Promise<void>; onReject: () => void }) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
      <Sparkle size={13} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.title}</span>
        {candidate.summary && <p className="mt-0.5 text-xs text-muted-foreground">{candidate.summary}</p>}
      </div>
      <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />
    </div>
  )
}

function AISceneMomentRow({ candidate, onAccept, onReject }: { candidate: AISceneMomentCandidate; onAccept: () => Promise<void>; onReject: () => void }) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
      <Sparkle size={13} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.title}</span>
        <div className="mt-0.5 flex gap-3 text-[11px] text-muted-foreground">
          {candidate.time_text && <span>{candidate.time_text}</span>}
          {candidate.location_text && <span>{candidate.location_text}</span>}
          {candidate.mood && <span>{candidate.mood}</span>}
        </div>
        {candidate.action_text && <p className="mt-0.5 text-xs text-muted-foreground">{candidate.action_text}</p>}
      </div>
      <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />
    </div>
  )
}

function AICreativeReferenceRow({ candidate, onAccept, onReject }: { candidate: AICreativeReferenceCandidate; onAccept: () => Promise<void>; onReject: () => void }) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
      <Sparkle size={13} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.name}</span>
        <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
          <span>{creativeReferenceKindLabel[candidate.type] ?? candidate.type}</span>
          <span>{candidate.importance === 'main' ? '主要' : candidate.importance === 'supporting' ? '辅助' : '背景'}</span>
        </div>
        {candidate.description && <p className="mt-0.5 text-xs text-muted-foreground">{candidate.description}</p>}
      </div>
      <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />
    </div>
  )
}

function AIAssetSlotRow({ candidate, onAccept, onReject }: { candidate: AIAssetSlotCandidate; onAccept: () => Promise<void>; onReject: () => void }) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
      <Sparkle size={13} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.name}</span>
        <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
          <span>{candidate.type}</span>
          <span>{statusLabel[candidate.priority] ?? candidate.priority}</span>
        </div>
        {candidate.description && <p className="mt-0.5 text-xs text-muted-foreground">{candidate.description}</p>}
      </div>
      <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />
    </div>
  )
}

function AIContentUnitRow({ candidate, onAccept, onReject }: { candidate: AIContentUnitCandidate; onAccept: () => Promise<void>; onReject: () => void }) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
      <Sparkle size={13} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.description ?? `内容单元 #${candidate.order}`}</span>
        <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
          <span>{contentUnitKindLabel[candidate.type] ?? candidate.type}</span>
          {candidate.shot_size && <span>景别: {candidate.shot_size}</span>}
          {candidate.camera_angle && <span>角度: {candidate.camera_angle}</span>}
        </div>
      </div>
      <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI analysis panel
// ─────────────────────────────────────────────────────────────────────────────

function AIAnalysisPanel({ projectId, onClose, onResult }: { projectId?: number; onClose: () => void; onResult: (result: AIAnalysisResult) => void }) {
  const [scriptText, setScriptText] = useState('')
  const [selectedModelId, setSelectedModelId] = useState('')

  const modelsQuery = useQuery<ModelConfig[]>({
    queryKey: ['models', 'text', 'production_orchestrate'],
    queryFn: () => api.get('/models?capability=text&feature=production_orchestrate').then((r) => r.data as ModelConfig[]),
  })
  const models = modelsQuery.data ?? []

  const analysisMutation = useMutation({
    mutationFn: async () => {
      if (!scriptText.trim()) throw new Error('请先输入剧本文本')
      const modelId = selectedModelId ? Number(selectedModelId) : models[0]?.id
      if (!modelId) throw new Error('没有可用的文本生成模型')
      const resp = await api.post('/ai/chat', {
        model_config_id: modelId,
        messages: [{ role: 'user', content: scriptText.trim() }],
      })
      const content = (resp.data as { content: string }).content
      const parsed = JSON.parse(content) as AIAnalysisResult
      return parsed
    },
    onSuccess: (result) => onResult(result),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'AI分析失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">AI 制作编排分析</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
          <p className="text-xs leading-5 text-muted-foreground">
            粘贴剧本文本，AI 将自动提取片段、情节、创作资料、素材需求和内容单元候选。分析完成后，可在列表中逐条查看并选择采纳或忽略。
          </p>

          {models.length > 1 && (
            <div className="mt-4">
              <Label className="text-xs font-medium">选择模型</Label>
              <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                <SelectTrigger className="mt-1.5 h-8 text-xs">
                  <SelectValue placeholder={models[0] ? String(models[0].display_name ?? models[0].name ?? `模型 ${models[0].id}`) : '自动选择'} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {String(m.display_name ?? m.name ?? `模型 ${m.id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="mt-4 flex-1">
            <Label className="text-xs font-medium">剧本文本</Label>
            <Textarea
              className="mt-1.5 min-h-[220px] resize-none font-mono text-xs leading-relaxed"
              placeholder="粘贴剧本内容……"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {analysisMutation.isPending ? 'AI 分析中，请稍候…' : `${scriptText.length} 字符`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
              <Button size="sm" disabled={!scriptText.trim() || analysisMutation.isPending} loading={analysisMutation.isPending} onClick={() => analysisMutation.mutate()} className="gap-1.5">
                <Wand2 size={13} />
                开始分析
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility components
// ─────────────────────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-foreground">{value}</p>
    </div>
  )
}

function EmptySection({ text, onAdd }: { text: string; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <button type="button" onClick={onAdd} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
        <Plus size={12} />新增
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function byOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  const ao = typeof a.order === 'number' ? a.order : a.ID
  const bo = typeof b.order === 'number' ? b.order : b.ID
  return ao - bo
}

function countPending<T>(list: TrackedCandidate<T>[]) {
  return list.filter((c) => c.status === 'pending').length
}

function createDefaultsForType(type: EntityFilter, productionId: number): Record<string, string | number | boolean | null> {
  if (type === 'assetSlots') return { status: 'missing', production_id: productionId || 0 }
  if (type === 'contentUnits') return { status: 'draft', production_id: productionId || 0 }
  if (type === 'segments') return { status: 'draft', kind: 'section' }
  if (type === 'sceneMoments') return { status: 'draft' }
  if (type === 'creativeReferences') return { status: 'draft', importance: 'main' }
  return {}
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Boxes,
  Bot,
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
  ScrollText,
  Sparkles,
  Sparkle,
  Trash2,
  Wand2,
  X,
  CheckCheck,
  Check,
  Diff,
  LayoutList,
  AlertCircle,
  CheckCircle2,
  ChevronUp,
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
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import { LocalAgentClient, type AgentManifest, type AgentRun, type AgentRunStep } from '@/lib/localAgentClient'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { Badge, Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@movscript/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EntityFilter = 'all' | 'segments' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'

type SegmentRecord = SemanticEntityRecord & {
  production_id?: number
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
  productions: (SemanticEntityRecord & { script_version_id?: number; name?: string })[]
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  creativeReferenceUsages: SemanticEntityRecord[]
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
  const [productions, segments, sceneMoments, creativeReferences, creativeReferenceUsages, assetSlots, contentUnits] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('productions')),
    listSemanticEntities(projectId, semanticEntityConfig('segments')),
    listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferences')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferenceUsages')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
  ])
  return {
    productions,
    segments: segments as SegmentRecord[],
    sceneMoments: sceneMoments as SceneMomentRecord[],
    creativeReferences: creativeReferences as CreativeReferenceRecord[],
    creativeReferenceUsages,
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
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const productionId = Number(searchParams.get('productionId')) || 0

  const [filter, setFilter] = useState<EntityFilter>('all')
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
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

  const allSegments = useMemo(
    () => filterSegmentsForProduction(data?.segments ?? [], effectiveProductionId).sort(byOrder),
    [data?.segments, effectiveProductionId]
  )
  const currentSegmentIds = useMemo(() => new Set(allSegments.map((segment) => segment.ID)), [allSegments])
  const allSceneMoments = useMemo(
    () => filterSceneMomentsForSegments(data?.sceneMoments ?? [], currentSegmentIds).sort(byOrder),
    [currentSegmentIds, data?.sceneMoments]
  )
  const currentSceneMomentIds = useMemo(() => new Set(allSceneMoments.map((moment) => moment.ID)), [allSceneMoments])
  const allContentUnits = useMemo(
    () => filterContentUnitsForProduction(data?.contentUnits ?? [], effectiveProductionId, currentSegmentIds, currentSceneMomentIds).sort(byOrder),
    [currentSceneMomentIds, currentSegmentIds, data?.contentUnits, effectiveProductionId]
  )
  const currentContentUnitIds = useMemo(() => new Set(allContentUnits.map((unit) => unit.ID)), [allContentUnits])
  const allAssetSlots = useMemo(
    () => filterAssetSlotsForProduction(data?.assetSlots ?? [], effectiveProductionId, currentSegmentIds, currentSceneMomentIds, currentContentUnitIds),
    [currentContentUnitIds, currentSceneMomentIds, currentSegmentIds, data?.assetSlots, effectiveProductionId]
  )
  const allCreativeReferences = useMemo(
    () => filterCreativeReferencesForProduction(data?.creativeReferences ?? [], data?.creativeReferenceUsages ?? [], allAssetSlots, currentSegmentIds, currentSceneMomentIds, currentContentUnitIds),
    [allAssetSlots, currentContentUnitIds, currentSceneMomentIds, currentSegmentIds, data?.creativeReferenceUsages, data?.creativeReferences]
  )
  const selectedSegment = allSegments.find((segment) => segment.ID === selectedSegmentId) ?? allSegments[0] ?? null
  const selectedSceneMoment = selectedSegment ? allSceneMoments.find((moment) => moment.segment_id === selectedSegment.ID) ?? null : null

  useEffect(() => {
    if (selectedSegmentId && !allSegments.some((segment) => segment.ID === selectedSegmentId)) {
      setSelectedSegmentId(null)
    }
  }, [allSegments, selectedSegmentId])

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

  function resolvedCandidateSegmentId(clientId?: string) {
    const text = String(clientId ?? '')
    if (!text) return selectedSegment?.ID
    const candidate = candidates?.segments.find((item) => item.data.client_id === text)?.data
    if (!candidate) return selectedSegment?.ID
    return allSegments.find((segment) => segment.order === candidate.order || segment.title === candidate.title)?.ID ?? selectedSegment?.ID
  }

  function resolvedCandidateSceneMomentId(clientId?: string, segmentId?: number) {
    const text = String(clientId ?? '')
    if (!text) return selectedSceneMoment?.ID
    const candidate = candidates?.scene_moments.find((item) => item.data.client_id === text)?.data
    const scopedMoments = segmentId ? allSceneMoments.filter((moment) => moment.segment_id === segmentId) : allSceneMoments
    if (!candidate) return scopedMoments[0]?.ID ?? selectedSceneMoment?.ID
    return scopedMoments.find((moment) => moment.order === candidate.order || moment.title === candidate.title)?.ID ?? scopedMoments[0]?.ID ?? selectedSceneMoment?.ID
  }

  async function linkReferenceToCurrentSegment(referenceId: number, evidence?: string) {
    if (!projectId || !selectedSegment?.ID) return
    await createSemanticEntity(projectId, semanticEntityConfig('creativeReferenceUsages'), {
      owner_type: 'segment',
      owner_id: selectedSegment.ID,
      creative_reference_id: referenceId,
      role: 'supporting',
      source: 'manual',
      status: 'draft',
      evidence: evidence ?? '',
    })
  }

  async function acceptSegmentCandidate(data: AISegmentCandidate) {
    const saved = await createSemanticEntity(projectId!, semanticEntityConfig('segments'), {
      production_id: effectiveProductionId || 0,
      title: data.title,
      summary: data.summary,
      kind: 'section',
      status: 'draft',
      order: data.order,
    })
    handleAcceptCandidate('segments', data.client_id)
    toast.success(`片段「${saved.title}」已创建`)
    refetch()
  }

  async function acceptSceneMomentCandidate(data: AISceneMomentCandidate) {
    const segmentId = resolvedCandidateSegmentId(data.segment_id)
    const saved = await createSemanticEntity(projectId!, semanticEntityConfig('sceneMoments'), {
      segment_id: segmentId ?? null,
      title: data.title,
      time_text: data.time_text ?? '',
      location_text: data.location_text ?? '',
      action_text: data.action_text ?? '',
      mood: data.mood ?? '',
      status: 'draft',
      order: data.order,
    })
    handleAcceptCandidate('scene_moments', data.client_id)
    toast.success(`情节「${saved.title}」已创建`)
    refetch()
  }

  async function acceptCreativeReferenceCandidate(data: AICreativeReferenceCandidate) {
    const saved = await createSemanticEntity(projectId!, semanticEntityConfig('creativeReferences'), {
      name: data.name,
      kind: data.type,
      importance: data.importance,
      description: data.description ?? '',
      status: 'draft',
    })
    await linkReferenceToCurrentSegment(saved.ID, data.description)
    handleAcceptCandidate('creative_references', data.client_id)
    toast.success(`创作资料「${saved.name}」已创建`)
    refetch()
  }

  async function acceptAssetSlotCandidate(data: AIAssetSlotCandidate) {
    const segmentId = resolvedCandidateSegmentId(data.segment_id)
    const saved = await createSemanticEntity(projectId!, semanticEntityConfig('assetSlots'), {
      name: data.name,
      kind: data.type,
      priority: data.priority,
      description: data.description ?? '',
      status: 'missing',
      production_id: effectiveProductionId || null,
      owner_type: segmentId ? 'segment' : '',
      owner_id: segmentId ?? null,
    })
    handleAcceptCandidate('asset_slots', data.client_id)
    toast.success(`素材需求「${saved.name}」已创建`)
    refetch()
  }

  async function acceptContentUnitCandidate(data: AIContentUnitCandidate) {
    const segmentId = resolvedCandidateSegmentId(data.segment_id)
    const sceneMomentId = resolvedCandidateSceneMomentId(data.scene_moment_id, segmentId)
    const saved = await createSemanticEntity(projectId!, semanticEntityConfig('contentUnits'), {
      title: data.description ?? `镜头 ${data.order}`,
      kind: data.type,
      description: data.description ?? '',
      shot_size: data.shot_size ?? '',
      camera_angle: data.camera_angle ?? '',
      order: data.order,
      status: 'draft',
      production_id: effectiveProductionId || null,
      segment_id: segmentId ?? null,
      scene_moment_id: sceneMomentId ?? null,
    })
    handleAcceptCandidate('content_units', data.client_id)
    toast.success(`内容单元「${saved.title}」已创建`)
    refetch()
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
            <Button
              size="sm"
              variant={aiPanelOpen ? 'secondary' : 'default'}
              className="h-7 gap-1.5 text-xs"
              onClick={() => setAIPanelOpen((v) => !v)}
            >
              <Bot size={13} />
              AI 对话
            </Button>
          </div>
        </div>
      </header>

      {/* Body: director-style orchestration workspace + optional agent sidebar */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <OrchestrationRail
          segments={allSegments}
          sceneMoments={allSceneMoments}
          contentUnits={allContentUnits}
          filter={filter}
          filterCounts={filterCounts}
          pendingCandidateCount={pendingCandidateCount}
          selectedSegmentId={selectedSegment?.ID ?? null}
          onFilterChange={setFilter}
          onSelectSegment={(segmentId) => {
            setSelectedSegmentId(segmentId)
            setFilter('all')
            setExpandedIds((prev) => new Set(prev).add(`segment-${segmentId}`))
          }}
          onAddSegment={() => setCreateType('segments')}
        />

        {/* Main content */}
        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              加载中…
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
              <WorkspaceHeader
                filter={filter}
                selectedSegment={selectedSegment}
                segments={allSegments}
                sceneMoments={allSceneMoments}
                assetSlots={allAssetSlots}
                contentUnits={allContentUnits}
                candidates={candidates}
                onAdd={() => setCreateType(filter === 'all' ? 'segments' : filter)}
                onOpenAI={() => setAIPanelOpen(true)}
              />
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {filter === 'all' ? (
                  <AllView
                    segments={selectedSegment ? [selectedSegment] : allSegments}
                    sceneMoments={allSceneMoments}
                    creativeReferences={allCreativeReferences}
                    assetSlots={allAssetSlots}
                    contentUnits={allContentUnits}
                    onAddSegment={() => setCreateType('segments')}
                    onAddReference={() => setCreateType('creativeReferences')}
                    onAddAsset={() => setCreateType('assetSlots')}
                    onAcceptSegmentCandidate={acceptSegmentCandidate}
                    onAcceptCreativeReferenceCandidate={acceptCreativeReferenceCandidate}
                    onAcceptAssetSlotCandidate={acceptAssetSlotCandidate}
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
                          await acceptSegmentCandidate(data)
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
                          await acceptSceneMomentCandidate(data)
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
                          await acceptCreativeReferenceCandidate(data)
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
                          await acceptAssetSlotCandidate(data)
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
                          await acceptContentUnitCandidate(data)
                        }} onReject={() => handleRejectCandidate('content_units', data.client_id)} />
                      )
                    }}
                    onAdd={() => setCreateType('contentUnits')}
                  />
                ) : null}
              </div>
            </div>
          )}
        </main>

        <DecisionPanel
          selectedSegment={selectedSegment}
          segments={allSegments}
          sceneMoments={allSceneMoments}
          creativeReferences={allCreativeReferences}
          assetSlots={allAssetSlots}
          contentUnits={allContentUnits}
          candidates={candidates}
          onOpenAI={() => setAIPanelOpen(true)}
          onAddReference={() => setCreateType('creativeReferences')}
          onAddAsset={() => setCreateType('assetSlots')}
          onAddContentUnit={() => setCreateType('contentUnits')}
        />

        {/* Agent chat sidebar */}
        {aiPanelOpen && (
          <AgentChatSidebar
            projectId={projectId}
            production={selectedProduction}
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
              toast.success(`AI分析完成：${result.segments.length} 片段，${result.scene_moments.length} 情节，${result.creative_references.length} 资料，${result.asset_slots.length} 素材，${result.content_units.length} 内容单元`)
            }}
          />
        )}
      </div>

      {/* CRUD dialogs */}
      {createType && createType !== 'all' && (
        <SemanticEntityCrudDialog
          open
          mode="create"
          projectId={projectId}
          config={semanticEntityConfig(createType)}
          defaults={createDefaultsForType(createType, effectiveProductionId, selectedSegment?.ID, selectedSceneMoment?.ID)}
          queryKey={queryKey}
          title={`新增${filterDefs.find((f) => f.key === createType)?.label ?? ''}`}
          onOpenChange={(open) => { if (!open) setCreateType(null) }}
          onSaved={(record) => {
            if (createType === 'creativeReferences') {
              linkReferenceToCurrentSegment(record.ID, String(record.description ?? '')).finally(() => {
                queryClient.invalidateQueries({ queryKey })
                refetch()
              })
            }
            setCreateType(null)
          }}
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
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Director workspace shell
// ─────────────────────────────────────────────────────────────────────────────

interface OrchestrationRailProps {
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  contentUnits: ContentUnitRecord[]
  filter: EntityFilter
  filterCounts: Record<Exclude<EntityFilter, 'all'>, number>
  pendingCandidateCount: number
  selectedSegmentId: number | null
  onFilterChange: (filter: EntityFilter) => void
  onSelectSegment: (segmentId: number) => void
  onAddSegment: () => void
}

function OrchestrationRail({ segments, sceneMoments, contentUnits, filter, filterCounts, pendingCandidateCount, selectedSegmentId, onFilterChange, onSelectSegment, onAddSegment }: OrchestrationRailProps) {
  const confirmedContentUnits = contentUnits.filter((unit) => ['confirmed', 'accepted', 'locked'].includes(String(unit.status))).length
  const missingSegments = Math.max(segments.length - new Set(sceneMoments.map((moment) => moment.segment_id).filter(Boolean)).size, 0)

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">结构导航</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">按剧本片段推进制作确认</p>
          </div>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onAddSegment}>
            <Plus size={13} />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <RailMetric label="片段" value={segments.length} />
          <RailMetric label="情节" value={sceneMoments.length} />
          <RailMetric label="镜头" value={contentUnits.length} />
        </div>
      </div>

      <div className="border-b border-border p-2">
        <button
          type="button"
          onClick={() => onFilterChange('all')}
          className={cn(
            'flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-xs font-medium transition-colors',
            filter === 'all' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <span className="flex items-center gap-1.5"><LayoutList size={13} />编排工作区</span>
          {pendingCandidateCount > 0 && <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">{pendingCandidateCount}</span>}
        </button>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {filterDefs.filter((item) => item.key !== 'all').map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onFilterChange(key)}
              className={cn(
                'flex h-8 items-center justify-between rounded-md px-2 text-xs transition-colors',
                filter === key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon size={12} className="shrink-0" />
                <span className="truncate">{label}</span>
              </span>
              <span className="text-[10px] tabular-nums">{filterCounts[key as Exclude<EntityFilter, 'all'>]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {segments.length === 0 ? (
          <button
            type="button"
            onClick={onAddSegment}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <GitBranch size={18} />
            新增第一个片段
          </button>
        ) : (
          <div className="space-y-1">
            {segments.map((segment) => {
              const childMoments = sceneMoments.filter((moment) => moment.segment_id === segment.ID)
              const childUnits = contentUnits.filter((unit) => unit.segment_id === segment.ID)
              const active = selectedSegmentId === segment.ID && filter === 'all'
              return (
                <button
                  key={segment.ID}
                  type="button"
                  onClick={() => onSelectSegment(segment.ID)}
                  className={cn(
                    'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                    active ? 'border-primary/40 bg-primary/8' : 'border-transparent hover:border-border hover:bg-muted/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{String(segment.title ?? `片段 #${segment.ID}`)}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{String(segment.summary ?? segment.content ?? '暂无摘要')}</p>
                    </div>
                    {segment.status && <StatusDot status={String(segment.status)} />}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{childMoments.length} 情节</span>
                    <span>{childUnits.length} 单元</span>
                    {childMoments.length === 0 && <span className="text-amber-600 dark:text-amber-400">待拆解</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="space-y-2">
          <CheckRowTiny ok={segments.length > 0} label="已有剧本片段" detail={`${segments.length} 条`} />
          <CheckRowTiny ok={missingSegments === 0 && segments.length > 0} label="片段已拆情节" detail={missingSegments > 0 ? `${missingSegments} 段待补` : `${sceneMoments.length} 条情节`} />
          <CheckRowTiny ok={confirmedContentUnits > 0} label="可执行内容" detail={confirmedContentUnits > 0 ? `${confirmedContentUnits} 条已确认` : '等待确认'} />
        </div>
      </div>
    </aside>
  )
}

function RailMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function WorkspaceHeader({
  filter,
  selectedSegment,
  segments,
  sceneMoments,
  assetSlots,
  contentUnits,
  candidates,
  onAdd,
  onOpenAI,
}: {
  filter: EntityFilter
  selectedSegment: SegmentRecord | null
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  candidates: TrackedCandidates | null
  onAdd: () => void
  onOpenAI: () => void
}) {
  const filterLabel = filterDefs.find((item) => item.key === filter)?.label ?? '编排'
  const title = filter === 'all'
    ? selectedSegment ? String(selectedSegment.title ?? `片段 #${selectedSegment.ID}`) : '编排工作区'
    : `${filterLabel}总览`
  const selectedMoments = selectedSegment ? sceneMoments.filter((moment) => moment.segment_id === selectedSegment.ID) : sceneMoments
  const selectedUnits = selectedSegment ? contentUnits.filter((unit) => unit.segment_id === selectedSegment.ID) : contentUnits
  const missingAssetCount = assetSlots.filter((slot) => ['missing', 'blocked'].includes(String(slot.status))).length
  const pending = candidates
    ? countPending(candidates.segments) + countPending(candidates.scene_moments) + countPending(candidates.creative_references) + countPending(candidates.asset_slots) + countPending(candidates.content_units)
    : 0

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Route size={12} />
            {filter === 'all' ? `${segments.length} 个片段中的当前焦点` : filterLabel}
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold text-foreground">{title}</h1>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {filter === 'all'
              ? selectedSegment?.summary || selectedSegment?.content || '选择片段后，在这里确认情节、内容单元和素材缺口。'
              : '按实体类型批量检查和维护生产结构。'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onAdd}>
            <Plus size={13} />
            新增
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onOpenAI}>
            <Bot size={13} />
            AI 分析
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <DecisionMetric icon={Route} label="当前情节" value={selectedMoments.length} />
        <DecisionMetric icon={Film} label="内容单元" value={selectedUnits.length} />
        <DecisionMetric icon={PackageCheck} label="素材缺口" value={missingAssetCount} tone={missingAssetCount > 0 ? 'warn' : 'ok'} />
        <DecisionMetric icon={Sparkle} label="AI 待确认" value={pending} tone={pending > 0 ? 'warn' : 'muted'} />
      </div>
    </section>
  )
}

function DecisionPanel({
  selectedSegment,
  sceneMoments,
  creativeReferences,
  assetSlots,
  contentUnits,
  candidates,
  onOpenAI,
  onAddReference,
  onAddAsset,
  onAddContentUnit,
}: {
  selectedSegment: SegmentRecord | null
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  candidates: TrackedCandidates | null
  onOpenAI: () => void
  onAddReference: () => void
  onAddAsset: () => void
  onAddContentUnit: () => void
}) {
  const selectedMoments = selectedSegment ? sceneMoments.filter((moment) => moment.segment_id === selectedSegment.ID) : []
  const selectedUnits = selectedSegment ? contentUnits.filter((unit) => unit.segment_id === selectedSegment.ID) : []
  const missingAssets = assetSlots.filter((slot) => ['missing', 'blocked'].includes(String(slot.status)))
  const pending = candidates
    ? countPending(candidates.segments) + countPending(candidates.scene_moments) + countPending(candidates.creative_references) + countPending(candidates.asset_slots) + countPending(candidates.content_units)
    : 0
  const nextAction = pending > 0
    ? '审核 AI 候选'
    : selectedMoments.length === 0
      ? '补充情节'
      : selectedUnits.length === 0
        ? '创建内容单元'
        : missingAssets.length > 0
          ? '补齐素材'
          : '确认生产包'

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border bg-card xl:flex">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">决策面板</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">围绕当前片段处理下一步</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <CheckCheck size={14} className="text-primary" />
            <p className="text-xs font-semibold text-foreground">下一步</p>
          </div>
          <p className="mt-2 text-base font-semibold text-foreground">{nextAction}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pending > 0 ? (
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onOpenAI}>
                <Sparkle size={12} />
                查看候选
              </Button>
            ) : selectedUnits.length === 0 ? (
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onAddContentUnit}>
                <Film size={12} />
                新增单元
              </Button>
            ) : missingAssets.length > 0 ? (
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onAddAsset}>
                <PackageCheck size={12} />
                新增素材
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onAddReference}>
                <Sparkles size={12} />
                补资料
              </Button>
            )}
          </div>
        </section>

        <section className="mt-4">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">当前片段检查</p>
          <div className="space-y-2">
            <DecisionCheck ok={Boolean(selectedSegment)} label="已选择片段" detail={selectedSegment ? String(selectedSegment.title ?? `#${selectedSegment.ID}`) : '未选择'} />
            <DecisionCheck ok={selectedMoments.length > 0} label="有情节上下文" detail={`${selectedMoments.length} 条`} />
            <DecisionCheck ok={selectedUnits.length > 0} label="有可执行内容" detail={`${selectedUnits.length} 条`} />
            <DecisionCheck ok={missingAssets.length === 0} label="素材无阻塞" detail={missingAssets.length > 0 ? `${missingAssets.length} 个缺口` : '无缺口'} />
          </div>
        </section>

        <section className="mt-4">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">生产上下文</p>
          <div className="space-y-2">
            <ContextLine icon={Sparkles} label="创作资料" value={`${creativeReferences.length} 条`} />
            <ContextLine icon={PackageCheck} label="素材需求" value={`${assetSlots.length} 条`} />
            <ContextLine icon={Sparkle} label="AI 候选" value={`${pending} 条待处理`} />
          </div>
        </section>
      </div>
    </aside>
  )
}

function DecisionMetric({ icon: Icon, label, value, tone = 'muted' }: { icon: LucideIcon; label: string; value: number; tone?: 'muted' | 'ok' | 'warn' }) {
  const toneClass = tone === 'ok'
    ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-foreground'
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon size={12} />
        {label}
      </div>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', toneClass)}>{value}</p>
    </div>
  )
}

function DecisionCheck({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2">
      {ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" /> : <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-500" />}
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function CheckRowTiny({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {ok ? <Check size={11} className="shrink-0 text-emerald-500" /> : <AlertCircle size={11} className="shrink-0 text-amber-500" />}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-muted-foreground">{detail}</span>
    </div>
  )
}

function ContextLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={12} />
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const cls = ['confirmed', 'locked', 'accepted'].includes(status)
    ? 'bg-emerald-500'
    : ['blocked', 'rejected'].includes(status)
      ? 'bg-rose-500'
      : ['missing', 'candidate'].includes(status)
        ? 'bg-amber-500'
        : 'bg-muted-foreground/40'
  return <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', cls)} />
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
  onAcceptSegmentCandidate: (candidate: AISegmentCandidate) => Promise<void>
  onAcceptCreativeReferenceCandidate: (candidate: AICreativeReferenceCandidate) => Promise<void>
  onAcceptAssetSlotCandidate: (candidate: AIAssetSlotCandidate) => Promise<void>
  candidates: TrackedCandidates | null
  showDiff: boolean
  onAcceptCandidate: (key: keyof TrackedCandidates, clientId: string) => void
  onRejectCandidate: (key: keyof TrackedCandidates, clientId: string) => void
}

function AllView({ segments, sceneMoments, creativeReferences, assetSlots, contentUnits, projectId, productionId, queryKey, expandedIds, onToggleExpand, onEdit, onAddSegment, onAddReference, onAddAsset, onAcceptSegmentCandidate, onAcceptCreativeReferenceCandidate, onAcceptAssetSlotCandidate, candidates, showDiff, onAcceptCandidate, onRejectCandidate }: AllViewProps) {
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
                  await onAcceptSegmentCandidate(c.data)
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
                  await onAcceptCreativeReferenceCandidate(c.data)
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
                  await onAcceptAssetSlotCandidate(c.data)
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
// Agent chat sidebar
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_AI_ANALYSIS: AIAnalysisResult = {
  segments: [],
  scene_moments: [],
  creative_references: [],
  asset_slots: [],
  content_units: [],
}

function buildOrchestrationAnalysisPrompt(scriptText: string): string {
  return [
    '任务：把下面剧本文本整理为制作编排候选，而不是总结项目进度或给执行建议。',
    '',
    '必须产出的五类数据：',
    '1. 片段 segments：按叙事/制作块拆分，保留 order、title、summary、source_range。',
    '2. 情节 scene_moments：从片段中提取可用于生成画面/声音/字幕的具体时刻。',
    '3. 创作资料 creative_references：人物、地点、道具、产品、品牌、风格、世界规则、时代背景、限制条件。',
    '4. 素材需求 asset_slots：每段生产所需的 image/video/audio/text 素材缺口。',
    '5. 内容单元 content_units：可直接进入制作的镜头/视觉段/旁白/转场/字幕卡等生产目标。',
    '',
    '输出要求：',
    '- 只输出一个 JSON 对象，不要 Markdown，不要解释，不要复盘，不要下一步建议。',
    '- JSON 顶层必须包含且只包含：segments, scene_moments, creative_references, asset_slots, content_units。',
    '- 所有数组即使为空也必须返回 []。',
    '- client_id 必须稳定并可互相关联，例如 s1、sm1、cr1、as1、cu1。',
    '- segment_id 和 scene_moment_id 使用上面生成的 client_id，不要使用数据库 ID。',
    '',
    'JSON 格式：',
    JSON.stringify(EMPTY_AI_ANALYSIS, null, 2),
    '',
    '剧本文本：',
    scriptText,
  ].join('\n')
}

function parseAIAnalysisResult(content: string): AIAnalysisResult | null {
  for (const jsonText of extractJSONObjectCandidates(content)) {
    try {
      const parsed = JSON.parse(jsonText)
      const normalized = normalizeAIAnalysisResult(parsed)
      if (normalized) return normalized
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

function extractJSONObjectCandidates(content: string): string[] {
  const candidates: string[] = []
  const trimmed = content.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) candidates.push(trimmed)

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  const balanced = extractFirstBalancedObject(trimmed)
  if (balanced) candidates.push(balanced)

  return Array.from(new Set(candidates))
}

function extractFirstBalancedObject(text: string): string | null {
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = inString
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function normalizeAIAnalysisResult(value: unknown): AIAnalysisResult | null {
  if (!isPlainRecord(value)) return null
  return {
    segments: normalizeSegments(value.segments),
    scene_moments: normalizeSceneMoments(value.scene_moments),
    creative_references: normalizeCreativeReferences(value.creative_references),
    asset_slots: normalizeAssetSlots(value.asset_slots),
    content_units: normalizeContentUnits(value.content_units),
  }
}

function normalizeSegments(value: unknown): AISegmentCandidate[] {
  return normalizeArray(value).map((item, index) => {
    const row = isPlainRecord(item) ? item : {}
    const order = toFiniteNumber(row.order) ?? index + 1
    return {
      ...row,
      client_id: toText(row.client_id) || `s${order}`,
      order,
      title: toText(row.title) || `片段 ${order}`,
      summary: toText(row.summary) || toText(row.content) || toText(row.description) || '',
      ...(toText(row.source_range) ? { source_range: toText(row.source_range) } : {}),
    }
  })
}

function normalizeSceneMoments(value: unknown): AISceneMomentCandidate[] {
  return normalizeArray(value).map((item, index) => {
    const row = isPlainRecord(item) ? item : {}
    const order = toFiniteNumber(row.order) ?? index + 1
    return {
      ...row,
      client_id: toText(row.client_id) || `sm${order}`,
      segment_id: toText(row.segment_id) || `s${order}`,
      order,
      title: toText(row.title) || `情节 ${order}`,
      ...(toText(row.time_text) ? { time_text: toText(row.time_text) } : {}),
      ...(toText(row.location_text) ? { location_text: toText(row.location_text) } : {}),
      ...(toText(row.action_text) ? { action_text: toText(row.action_text) } : {}),
      ...(toText(row.mood) ? { mood: toText(row.mood) } : {}),
    }
  })
}

function normalizeCreativeReferences(value: unknown): AICreativeReferenceCandidate[] {
  return normalizeArray(value).map((item, index) => {
    const row = isPlainRecord(item) ? item : {}
    return {
      ...row,
      client_id: toText(row.client_id) || `cr${index + 1}`,
      name: toText(row.name) || `创作资料 ${index + 1}`,
      type: normalizeReferenceType(toText(row.type) || toText(row.kind)),
      importance: normalizeImportance(toText(row.importance)),
      ...(toText(row.description) ? { description: toText(row.description) } : {}),
    }
  })
}

function normalizeAssetSlots(value: unknown): AIAssetSlotCandidate[] {
  return normalizeArray(value).map((item, index) => {
    const row = isPlainRecord(item) ? item : {}
    return {
      ...row,
      client_id: toText(row.client_id) || `as${index + 1}`,
      ...(toText(row.segment_id) ? { segment_id: toText(row.segment_id) } : {}),
      name: toText(row.name) || `素材需求 ${index + 1}`,
      type: normalizeAssetType(toText(row.type) || toText(row.kind)),
      ...(toText(row.description) ? { description: toText(row.description) } : {}),
      priority: normalizePriority(toText(row.priority)),
    }
  })
}

function normalizeContentUnits(value: unknown): AIContentUnitCandidate[] {
  return normalizeArray(value).map((item, index) => {
    const row = isPlainRecord(item) ? item : {}
    const order = toFiniteNumber(row.order) ?? index + 1
    return {
      ...row,
      client_id: toText(row.client_id) || `cu${order}`,
      ...(toText(row.segment_id) ? { segment_id: toText(row.segment_id) } : {}),
      ...(toText(row.scene_moment_id) ? { scene_moment_id: toText(row.scene_moment_id) } : {}),
      order,
      type: normalizeContentUnitType(toText(row.type) || toText(row.kind)),
      ...(toText(row.description) ? { description: toText(row.description) } : {}),
      ...(toText(row.shot_size) ? { shot_size: toText(row.shot_size) } : {}),
      ...(toText(row.camera_angle) ? { camera_angle: toText(row.camera_angle) } : {}),
    }
  })
}

function buildLocalAnalysisResult(scriptText: string): AIAnalysisResult {
  const chunks = splitScriptIntoChunks(scriptText)
  const segments: AISegmentCandidate[] = chunks.map((chunk, index) => ({
    client_id: `s${index + 1}`,
    order: index + 1,
    title: inferTitle(chunk, index),
    summary: summarizeText(chunk.text, 140),
    source_range: chunk.range,
  }))

  const scene_moments: AISceneMomentCandidate[] = chunks.map((chunk, index) => ({
    client_id: `sm${index + 1}`,
    segment_id: `s${index + 1}`,
    order: index + 1,
    title: inferMomentTitle(chunk.text, index),
    time_text: inferTimeText(chunk.text),
    location_text: inferLocationText(chunk.text),
    action_text: summarizeText(chunk.text, 120),
    mood: inferMood(chunk.text),
  }))

  const creative_references = extractCreativeReferences(scriptText)
  const asset_slots = buildAssetSlots(segments, creative_references)
  const content_units = segments.map((segment, index) => ({
    client_id: `cu${index + 1}`,
    segment_id: segment.client_id,
    scene_moment_id: `sm${index + 1}`,
    order: index + 1,
    type: 'shot',
    description: segment.summary,
    shot_size: inferShotSize(segment.summary),
    camera_angle: '平视',
  }))

  return { segments, scene_moments, creative_references, asset_slots, content_units }
}

function hasAnyAnalysisCandidate(result: AIAnalysisResult): boolean {
  return result.segments.length + result.scene_moments.length + result.creative_references.length + result.asset_slots.length + result.content_units.length > 0
}

function splitScriptIntoChunks(scriptText: string): Array<{ text: string; range: string }> {
  const paragraphs = scriptText
    .split(/\n{2,}|(?=第[一二三四五六七八九十百千万\d]+[集场幕章])/)
    .map((part) => part.trim())
    .filter(Boolean)

  const source = paragraphs.length > 1 ? paragraphs : scriptText.split(/(?<=[。！？!?])\s*/).map((part) => part.trim()).filter(Boolean)
  const chunks: Array<{ text: string; range: string }> = []
  let offset = 0

  for (const part of source) {
    const start = scriptText.indexOf(part, offset)
    const resolvedStart = start >= 0 ? start : offset
    const end = resolvedStart + part.length
    chunks.push({ text: part, range: `${resolvedStart}-${end}` })
    offset = end
  }

  if (chunks.length === 0 && scriptText.trim()) {
    chunks.push({ text: scriptText.trim(), range: `0-${scriptText.trim().length}` })
  }
  return chunks
}

function extractCreativeReferences(scriptText: string): AICreativeReferenceCandidate[] {
  const refs: AICreativeReferenceCandidate[] = []
  const seen = new Set<string>()

  const add = (name: string, type: string, description: string, importance: string = 'normal') => {
    const normalized = name.trim()
    if (!normalized || seen.has(`${type}:${normalized}`)) return
    seen.add(`${type}:${normalized}`)
    refs.push({
      client_id: `cr${refs.length + 1}`,
      name: normalized,
      type,
      importance,
      description,
    })
  }

  for (const match of scriptText.matchAll(/(?:^|\n)\s*([\u4e00-\u9fa5A-Za-z0-9·]{2,12})[：:]/g)) {
    if (match[1]) add(match[1], 'person', `台词角色：${match[1]}`, 'high')
  }

  const placeKeywords = ['筒子楼', '钟楼', '餐馆', '饭店', '市场', '村', '巷', '街', '厂', '厨房', '院子', '摊位', '货车', '晒椒场']
  for (const keyword of placeKeywords) {
    if (scriptText.includes(keyword)) add(keyword, keyword === '货车' ? 'prop' : 'place', `剧本中出现的${keyword}`, 'normal')
  }

  const propKeywords = ['戒指', '辣子油', '鸡毛掸子', '凉皮', '水脉', '账本', '收音机', '自行车', '卡车']
  for (const keyword of propKeywords) {
    if (scriptText.includes(keyword)) add(keyword, keyword === '凉皮' ? 'product' : 'prop', `关键生产元素：${keyword}`, 'normal')
  }

  if (/80年代|八十年代|198[0-9]/.test(scriptText)) add('80年代质感', 'time_period', '时代背景与美术约束：80年代生活环境、服装和道具', 'high')
  return refs
}

function buildAssetSlots(segments: AISegmentCandidate[], references: AICreativeReferenceCandidate[]): AIAssetSlotCandidate[] {
  const slots: AIAssetSlotCandidate[] = []
  for (const segment of segments) {
    slots.push({
      client_id: `as${slots.length + 1}`,
      segment_id: segment.client_id,
      name: `${segment.title} 画面素材`,
      type: 'image',
      description: `用于制作「${segment.title}」的关键画面/参考图：${segment.summary}`,
      priority: 'high',
    })
    slots.push({
      client_id: `as${slots.length + 1}`,
      segment_id: segment.client_id,
      name: `${segment.title} 声音素材`,
      type: 'audio',
      description: `对白、环境声或情绪音乐需求：${segment.summary}`,
      priority: 'normal',
    })
  }
  for (const ref of references.filter((item) => ['person', 'place', 'prop', 'product'].includes(item.type)).slice(0, 24)) {
    slots.push({
      client_id: `as${slots.length + 1}`,
      name: `${ref.name} 参考素材`,
      type: ref.type === 'person' || ref.type === 'place' ? 'image' : 'image',
      description: ref.description || `创作资料「${ref.name}」所需参考素材`,
      priority: ref.importance === 'high' ? 'high' : 'normal',
    })
  }
  return slots
}

function inferTitle(chunk: { text: string }, index: number): string {
  const explicit = chunk.text.match(/第[一二三四五六七八九十百千万\d]+[集场幕章][：:\s-]*([^\n。！？!?]{2,24})/)
  if (explicit?.[1]) return explicit[1].trim()
  const firstLine = chunk.text.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine ? summarizeText(firstLine, 24) : `片段 ${index + 1}`
}

function inferMomentTitle(text: string, index: number): string {
  const location = inferLocationText(text)
  const action = summarizeText(text, 24)
  return location ? `${location}：${action}` : `情节 ${index + 1}`
}

function inferTimeText(text: string): string {
  const match = text.match(/(清晨|早上|上午|中午|午后|下午|傍晚|晚上|夜里|深夜|第二天|当天|80年代|八十年代|198[0-9]年?)/)
  return match?.[1] ?? ''
}

function inferLocationText(text: string): string {
  const match = text.match(/([\u4e00-\u9fa5A-Za-z0-9·]{0,8}(?:筒子楼|钟楼|餐馆|饭店|市场|村|巷|街|厂|厨房|院子|摊位|货车|晒椒场))/)
  return match?.[1] ?? ''
}

function inferMood(text: string): string {
  if (/争|怒|骂|打|找茬|冲突|逼/.test(text)) return '紧张冲突'
  if (/哭|难过|委屈|绝望/.test(text)) return '压抑悲伤'
  if (/笑|热闹|成功|赚钱|爽|赢/.test(text)) return '高亢爽感'
  if (/温柔|抱|戒指|妻女|家/.test(text)) return '温情'
  return '叙事推进'
}

function inferShotSize(text: string): string {
  if (/全景|市场|街|村|厂|院子/.test(text)) return '全景'
  if (/表情|眼神|戒指|账本|辣子油/.test(text)) return '特写'
  return '中景'
}

function summarizeText(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function normalizeReferenceType(value: string): string {
  return ['person', 'place', 'prop', 'product', 'brand', 'style', 'world_rule', 'time_period', 'restriction'].includes(value) ? value : 'world_rule'
}

function normalizeImportance(value: string): string {
  return ['high', 'normal', 'low', 'main', 'supporting', 'background'].includes(value) ? value : 'normal'
}

function normalizeAssetType(value: string): string {
  return ['image', 'video', 'audio', 'text'].includes(value) ? value : 'image'
}

function normalizePriority(value: string): string {
  return ['critical', 'high', 'normal', 'low'].includes(value) ? value : 'normal'
}

function normalizeContentUnitType(value: string): string {
  return ['shot', 'visual_segment', 'product_showcase', 'caption_card', 'narration', 'transition', 'music_beat'].includes(value) ? value : 'shot'
}

type AnalysisPhase = 'input' | 'running' | 'done' | 'error'

function AgentChatSidebar({
  projectId,
  production,
  onClose,
  onResult,
}: {
  projectId?: number
  production?: SemanticEntityRecord & { script_version_id?: number; name?: string }
  onClose: () => void
  onResult: (result: AIAnalysisResult) => void
}) {
  const scriptVersionId = Number(production?.script_version_id) || 0

  const { data: allVersions, isLoading: loadingScript } = useQuery<ScriptVersion[]>({
    queryKey: ['script-versions-for-orchestrate', projectId],
    queryFn: () => listScriptVersions(projectId!),
    enabled: !!projectId && !!scriptVersionId,
  })
  const linkedVersion = allVersions?.find((v) => v.ID === scriptVersionId) ?? null

  const [manualMode, setManualMode] = useState(false)
  const [scriptText, setScriptText] = useState('')
  const [phase, setPhase] = useState<AnalysisPhase>('input')
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null)
  const [receivedData, setReceivedData] = useState<{ message: string; context?: Record<string, unknown> } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [rawAgentResponse, setRawAgentResponse] = useState('')
  const [outputResult, setOutputResult] = useState<AIAnalysisResult | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [showReceived, setShowReceived] = useState(false)
  const agentClientRef = useRef(new LocalAgentClient())

  // When switching to manual mode, pre-fill with linked version content
  useEffect(() => {
    if (manualMode && linkedVersion && !scriptText) {
      setScriptText(linkedVersion.content || linkedVersion.raw_source || '')
    }
  }, [manualMode, linkedVersion])

  function toggleStep(id: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function startAnalysis(text: string) {
    if (!text.trim()) return
    setPhase('running')
    setAgentRun(null)
    setReceivedData(null)
    setErrorMsg('')
    setRawAgentResponse('')
    setOutputResult(null)

    const client = agentClientRef.current
    const analysisPrompt = buildOrchestrationAnalysisPrompt(text.trim())
    try {
      await client.ensureRunning()

      const thread = await client.createThread({ projectId })
      await client.addMessage(thread.id, analysisPrompt, {
        message: '整理当前剧本的片段、情节、创作资料、素材需求和内容单元',
        uiSnapshot: {
          route: { pathname: '/production-orchestrate', search: window.location.search },
          project: projectId ? { id: projectId } : undefined,
          selection: production?.ID ? { entityType: 'production', entityId: production.ID, label: String(production.name ?? `制作 #${production.ID}`) } : null,
          labels: ['production-orchestrate', 'json-output-required'],
        },
      })

      setReceivedData({
        message: text.trim(),
        context: { projectId, threadId: thread.id, scriptVersionId: scriptVersionId || undefined, promptLength: analysisPrompt.length },
      })

      const run = await client.createRun(thread.id, { agentManifest: ORCHESTRATE_AGENT_MANIFEST })
      setAgentRun(run)

      const finalRun = await client.waitForRun(run.id, {
        timeoutMs: 180_000,
        pollMs: 600,
        onRunUpdate: (updated) => setAgentRun({ ...updated }),
      })
      setAgentRun(finalRun)

      if (finalRun.status === 'failed') {
        throw new Error(finalRun.error || 'Agent 运行失败')
      }

      const finalThread = await client.getThread(thread.id)
      const assistantMsg = [...finalThread.messages].reverse().find((m) => m.role === 'assistant')
      if (!assistantMsg) throw new Error('Agent 未返回分析结果')

      const parsed = parseAIAnalysisResult(assistantMsg.content) ?? buildLocalAnalysisResult(text.trim())
      if (!parseAIAnalysisResult(assistantMsg.content)) setRawAgentResponse(assistantMsg.content)

      setOutputResult(parsed)
      setPhase('done')
      onResult(parsed)
    } catch (err) {
      const fallback = buildLocalAnalysisResult(text.trim())
      if (hasAnyAnalysisCandidate(fallback)) {
        setRawAgentResponse(err instanceof Error ? err.message : 'Agent 分析失败，已使用本地整理结果')
        setOutputResult(fallback)
        setPhase('done')
        onResult(fallback)
        return
      }
      setErrorMsg(err instanceof Error ? err.message : '分析失败')
      setPhase('error')
    }
  }

  const effectiveText = manualMode ? scriptText : (linkedVersion?.content || linkedVersion?.raw_source || '')

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-card">
      {/* Sidebar header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">AI 对话</span>
          {phase === 'running' && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
          {phase === 'done' && <CheckCircle2 size={12} className="text-emerald-500" />}
          {phase === 'error' && <AlertCircle size={12} className="text-rose-500" />}
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
          <X size={14} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Input phase */}
        {phase === 'input' && (
          <div className="flex flex-col gap-3 p-4">
            {/* Linked script version card */}
            {loadingScript && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                加载关联剧本…
              </div>
            )}

            {linkedVersion && !manualMode && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ScrollText size={13} className="shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        {linkedVersion.title || `剧本版本 v${linkedVersion.version_number}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        v{linkedVersion.version_number} · {(linkedVersion.content || linkedVersion.raw_source).length} 字符
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">已关联</Badge>
                </div>
                <p className="mt-2 line-clamp-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {(linkedVersion.content || linkedVersion.raw_source).slice(0, 200)}…
                </p>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="mt-2 text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  手动输入其他文本
                </button>
              </div>
            )}

            {/* No linked script — show manual input */}
            {!linkedVersion && !loadingScript && !manualMode && (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center">
                <ScrollText size={16} className="mx-auto text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {production ? '当前制作未关联剧本版本' : '未选择制作'}
                </p>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  手动粘贴剧本文本
                </button>
              </div>
            )}

            {/* Manual text input */}
            {manualMode && (
              <div className="flex flex-col gap-2">
                {linkedVersion && (
                  <button
                    type="button"
                    onClick={() => { setManualMode(false); setScriptText('') }}
                    className="flex items-center gap-1 self-start text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <ChevronRight size={10} className="rotate-180" />
                    使用关联剧本
                  </button>
                )}
                <Textarea
                  className="min-h-[240px] resize-none font-mono text-xs leading-relaxed"
                  placeholder="粘贴剧本内容……"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        {/* Running / done / error — conversation view */}
        {phase !== 'input' && (
          <div className="flex flex-col gap-3 p-4">
            {/* User bubble */}
            {receivedData && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground">你</span>
                <div className="rounded-lg bg-primary/8 px-3 py-2">
                  <p className="text-xs leading-5 text-foreground">
                    {receivedData.message.slice(0, 120)}{receivedData.message.length > 120 ? '…' : ''}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{receivedData.message.length} 字符</p>
                </div>
              </div>
            )}

            {/* Received data (collapsible) */}
            {receivedData && (
              <div className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setShowReceived((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    <Bot size={11} />
                    Agent 收到的数据
                  </span>
                  {showReceived ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                {showReceived && (
                  <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">输入文本（前 400 字）</p>
                      <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[10px] leading-relaxed text-foreground">
                        {receivedData.message.slice(0, 400)}{receivedData.message.length > 400 ? '…' : ''}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">上下文</p>
                      <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[10px] text-foreground">
                        {JSON.stringify(receivedData.context, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Agent 指令（soul）</p>
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[10px] text-foreground">
                        {ORCHESTRATE_AGENT_MANIFEST.soul}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Agent thinking steps */}
            {agentRun && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground">Agent 思考过程</span>
                <div className="rounded-lg border border-border">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-[11px] font-medium text-foreground">运行步骤</span>
                    <AgentRunStatusBadge status={agentRun.status} />
                  </div>
                  <div className="divide-y divide-border">
                    {agentRun.steps.length === 0 && phase === 'running' && (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-muted-foreground">
                        <Loader2 size={11} className="animate-spin" />
                        Agent 正在规划…
                      </div>
                    )}
                    {agentRun.steps.map((step) => (
                      <AgentStepRow
                        key={step.id}
                        step={step}
                        expanded={expandedSteps.has(step.id)}
                        onToggle={() => toggleStep(step.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Error bubble */}
            {phase === 'error' && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-800/50 dark:bg-rose-950/30">
                <AlertCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />
                <div className="flex flex-col gap-1.5 min-w-0">
                  <p className="text-xs text-rose-700 dark:text-rose-300">{errorMsg}</p>
                  {rawAgentResponse && (
                    <pre className="whitespace-pre-wrap break-all rounded bg-rose-100/60 p-2 text-[10px] text-rose-800 dark:bg-rose-900/30 dark:text-rose-200 max-h-48 overflow-y-auto">
                      {rawAgentResponse}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* Done bubble */}
            {phase === 'done' && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">产出结果已生成，候选已加载到左侧列表。</p>
                </div>
                {outputResult && (
                  <div className="mt-2 grid grid-cols-5 gap-1.5 text-center text-[10px] text-emerald-700 dark:text-emerald-300">
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">片段 {outputResult.segments.length}</span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">情节 {outputResult.scene_moments.length}</span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">资料 {outputResult.creative_references.length}</span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">素材 {outputResult.asset_slots.length}</span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">单元 {outputResult.content_units.length}</span>
                  </div>
                )}
                {rawAgentResponse && (
                  <p className="mt-2 text-[10px] leading-4 text-emerald-700/80 dark:text-emerald-300/80">
                    Agent 原始回复未直接作为结构化结果使用，页面已完成可采纳候选整理。
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {phase === 'input' && !manualMode && linkedVersion && `${effectiveText.length} 字符`}
            {phase === 'input' && manualMode && `${scriptText.length} 字符`}
            {phase === 'running' && 'Agent 分析中…'}
            {phase === 'done' && '分析完成'}
            {phase === 'error' && '分析失败'}
          </p>
          <div className="flex gap-2">
            {phase === 'error' && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPhase('input'); setRawAgentResponse('') }}>
                重试
              </Button>
            )}
            {phase === 'done' && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPhase('input'); setScriptText(''); setManualMode(false) }}>
                新对话
              </Button>
            )}
            {phase === 'input' && (
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!effectiveText.trim() || loadingScript}
                onClick={() => startAnalysis(effectiveText)}
              >
                <Bot size={12} />
                开始分析
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}


const ORCHESTRATE_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.v1',
  id: 'production-orchestrate-analyzer',
  version: '1.0.0',
  name: '制作编排分析',
  description: '从剧本文本中提取五类制作编排候选',
  soul: `你是专业制作编排分析助手。从用户提供的剧本文本中提取五类制作编排候选：片段（segments）、情节（scene_moments）、创作资料（creative_references）、素材需求（asset_slots）、内容单元（content_units）。直接输出JSON对象，禁止输出JSON以外的任何内容。

输出格式：
{
  "segments": [{"client_id": "s1", "order": 1, "title": "片段标题", "summary": "摘要", "source_range": "来源范围"}],
  "scene_moments": [{"client_id": "sm1", "segment_id": "s1", "order": 1, "title": "情节标题", "time_text": "时间", "location_text": "地点", "action_text": "动作", "mood": "氛围"}],
  "creative_references": [{"client_id": "cr1", "name": "名称", "type": "person|place|prop|product|brand|style|world_rule", "importance": "high|normal|low", "description": "描述"}],
  "asset_slots": [{"client_id": "as1", "segment_id": "s1", "name": "名称", "type": "image|video|audio|text", "description": "描述", "priority": "critical|high|normal|low"}],
  "content_units": [{"client_id": "cu1", "segment_id": "s1", "scene_moment_id": "sm1", "order": 1, "type": "shot|visual_segment|product_showcase|caption_card|narration|transition|music_beat", "description": "描述", "shot_size": "景别", "camera_angle": "角度"}]
}`,
  permissions: [],
  tools: [],
}

function AgentRunStatusBadge({ status }: { status: AgentRun['status'] }) {
  const map: Record<AgentRun['status'], { label: string; cls: string }> = {
    queued:                  { label: '排队中', cls: 'bg-slate-500/10 text-slate-600' },
    in_progress:             { label: '运行中', cls: 'bg-blue-500/10 text-blue-600' },
    requires_action:         { label: '等待确认', cls: 'bg-amber-500/10 text-amber-600' },
    completed:               { label: '已完成', cls: 'bg-emerald-500/10 text-emerald-600' },
    completed_with_warnings: { label: '完成(有警告)', cls: 'bg-amber-500/10 text-amber-600' },
    failed:                  { label: '失败', cls: 'bg-rose-500/10 text-rose-600' },
  }
  const meta = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' }
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', meta.cls)}>{meta.label}</span>
}

function AgentStepRow({ step, expanded, onToggle }: { step: AgentRunStep; expanded: boolean; onToggle: () => void }) {
  const hasDetail = step.args || step.result || step.error
  const typeLabel: Record<string, string> = {
    planning: '规划', subagent: '子 Agent', tool_call: '工具调用', message: '消息',
  }
  return (
    <div className="px-3 py-2">
      <button
        type="button"
        onClick={hasDetail ? onToggle : undefined}
        className={cn('flex w-full items-start gap-2 text-left', hasDetail && 'cursor-pointer')}
      >
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          {step.status === 'in_progress' && <Loader2 size={11} className="animate-spin text-blue-500" />}
          {step.status === 'completed' && <Check size={11} className="text-emerald-500" />}
          {step.status === 'failed' && <AlertCircle size={11} className="text-rose-500" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{step.title ?? typeLabel[step.type] ?? step.type}</span>
            <span className="text-[10px] text-muted-foreground">{typeLabel[step.type] ?? step.type}</span>
            {step.toolName && <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">{step.toolName}</span>}
          </div>
          {step.error && <p className="mt-0.5 text-[11px] text-rose-500">{step.error}</p>}
        </div>
        {hasDetail && (
          <span className="mt-0.5 shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}
      </button>
      {expanded && hasDetail && (
        <div className="ml-6 mt-2 space-y-1.5">
          {step.args && (
            <div>
              <p className="text-[10px] text-muted-foreground">参数</p>
              <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[10px] text-foreground">
                {JSON.stringify(step.args, null, 2)}
              </pre>
            </div>
          )}
          {step.result !== undefined && (
            <div>
              <p className="text-[10px] text-muted-foreground">结果</p>
              <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[10px] text-foreground">
                {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
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

function createDefaultsForType(type: EntityFilter, productionId: number, segmentId?: number, sceneMomentId?: number): Record<string, string | number | boolean | null> {
  if (type === 'assetSlots') return { status: 'missing', production_id: productionId || 0, owner_type: segmentId ? 'segment' : '', owner_id: segmentId ?? null }
  if (type === 'contentUnits') return { status: 'draft', production_id: productionId || 0, segment_id: segmentId ?? null, scene_moment_id: sceneMomentId ?? null }
  if (type === 'segments') return { status: 'draft', kind: 'section', production_id: productionId || 0 }
  if (type === 'sceneMoments') return { status: 'draft', segment_id: segmentId ?? null }
  if (type === 'creativeReferences') return { status: 'draft', importance: 'main' }
  return {}
}

function filterSegmentsForProduction(segments: SegmentRecord[], productionId: number) {
  if (!productionId) return segments.slice()
  return segments.filter((segment) => Number(segment.production_id) === productionId)
}

function filterSceneMomentsForSegments(sceneMoments: SceneMomentRecord[], segmentIds: Set<number>) {
  return sceneMoments.filter((moment) => segmentIds.has(Number(moment.segment_id)))
}

function filterContentUnitsForProduction(contentUnits: ContentUnitRecord[], productionId: number, segmentIds: Set<number>, sceneMomentIds: Set<number>) {
  if (!productionId) return contentUnits.slice()
  return contentUnits.filter((unit) => (
    Number(unit.production_id) === productionId ||
    segmentIds.has(Number(unit.segment_id)) ||
    sceneMomentIds.has(Number(unit.scene_moment_id))
  ))
}

function filterAssetSlotsForProduction(assetSlots: AssetSlotRecord[], productionId: number, segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>) {
  if (!productionId) return assetSlots.slice()
  return assetSlots.filter((slot) => (
    Number(slot.production_id) === productionId ||
    (slot.owner_type === 'segment' && segmentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'scene_moment' && sceneMomentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'content_unit' && contentUnitIds.has(Number(slot.owner_id)))
  ))
}

function filterCreativeReferencesForProduction(
  references: CreativeReferenceRecord[],
  usages: SemanticEntityRecord[],
  assetSlots: AssetSlotRecord[],
  segmentIds: Set<number>,
  sceneMomentIds: Set<number>,
  contentUnitIds: Set<number>,
) {
  const referenceIds = new Set<number>()
  for (const usage of usages) {
    if (
      (usage.owner_type === 'segment' && segmentIds.has(Number(usage.owner_id))) ||
      (usage.owner_type === 'scene_moment' && sceneMomentIds.has(Number(usage.owner_id))) ||
      (usage.owner_type === 'content_unit' && contentUnitIds.has(Number(usage.owner_id)))
    ) {
      addEntityId(referenceIds, usage.creative_reference_id)
    }
  }
  for (const slot of assetSlots) addEntityId(referenceIds, slot.creative_reference_id)
  return references.filter((reference) => referenceIds.has(reference.ID))
}

function addEntityId(target: Set<number>, value: unknown) {
  const id = Number(value)
  if (Number.isFinite(id) && id > 0) target.add(id)
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  ChevronDown,
  ChevronRight,
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
  Wand2,
  Trash2,
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
import { cn } from '@/lib/utils'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import { LocalAgentClient, type AgentManifest, type AgentRun, type AgentRunStep } from '@/lib/localAgentClient'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@movscript/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EntityFilter = 'all' | 'segments' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'
type AnalysisScope = 'production' | 'segments' | 'segmentAnalysis' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'

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
interface AISceneMomentCandidate {
  [k: string]: unknown
  client_id: string
  segment_id: string
  order: number
  title: string
  time_text?: string
  location_text?: string
  action_text?: string
  mood?: string
  creative_reference_ids?: string[]
  asset_slot_ids?: string[]
  content_unit_ids?: string[]
}
interface AICreativeReferenceCandidate {
  [k: string]: unknown
  client_id: string
  name: string
  type: string
  importance: string
  description?: string
  segment_ids?: string[]
  scene_moment_ids?: string[]
  content_unit_ids?: string[]
  required_asset_slot_ids?: string[]
}
interface AIAssetSlotCandidate {
  [k: string]: unknown
  client_id: string
  segment_id?: string
  scene_moment_id?: string
  content_unit_id?: string
  creative_reference_id?: string
  name: string
  type: string
  description?: string
  priority: string
}
interface AIContentUnitCandidate {
  [k: string]: unknown
  client_id: string
  segment_id?: string
  scene_moment_id?: string
  creative_reference_ids?: string[]
  asset_slot_ids?: string[]
  order: number
  type: string
  description?: string
  shot_size?: string
  camera_angle?: string
}

interface AIAnalysisResult {
  segments: AISegmentCandidate[]
  scene_moments: AISceneMomentCandidate[]
  creative_references: AICreativeReferenceCandidate[]
  asset_slots: AIAssetSlotCandidate[]
  content_units: AIContentUnitCandidate[]
}

type CandidateStatus =
  | 'pending'            // no conflict, awaiting user review
  | 'accepted'           // user accepted
  | 'rejected'           // user rejected
  | 'conflict_pending'   // duplicate detected, awaiting user decision
  | 'conflict_overwrite' // user chose to overwrite existing entity
  | 'conflict_parallel'  // user chose to create alongside existing entity

interface ConflictInfo {
  conflict_status?: 'none' | 'duplicate' | 'supersedes'
  conflict_entity_id?: number
  conflict_entity_name?: string
  conflict_similarity?: number
}

interface TrackedCandidate<T> {
  data: T & ConflictInfo
  status: CandidateStatus
}

interface TrackedCandidates {
  segments: TrackedCandidate<AISegmentCandidate>[]
  scene_moments: TrackedCandidate<AISceneMomentCandidate>[]
  creative_references: TrackedCandidate<AICreativeReferenceCandidate>[]
  asset_slots: TrackedCandidate<AIAssetSlotCandidate>[]
  content_units: TrackedCandidate<AIContentUnitCandidate>[]
}

type GuideCounts = Record<keyof TrackedCandidates, number>

interface AnalysisTarget {
  scope: AnalysisScope
  entityId?: number | null
}

const analysisScopeLabels: Record<AnalysisScope, string> = {
  production: '总编排',
  segments: '片段拆分',
  segmentAnalysis: '片段分析',
  sceneMoments: '情节分析',
  creativeReferences: '创作资料分析',
  assetSlots: '素材需求',
  contentUnits: '内容单元分析',
}

interface OrchestrationLookup {
  scriptText: string
  scriptVersionTitle: string
  segmentById: Map<number, SegmentRecord>
  sceneMomentById: Map<number, SceneMomentRecord>
  contentUnitById: Map<number, ContentUnitRecord>
  creativeReferenceById: Map<number, CreativeReferenceRecord>
  usagesByOwnerKey: Map<string, SemanticEntityRecord[]>
  usagesByReferenceId: Map<number, SemanticEntityRecord[]>
  assetSlotsByOwnerKey: Map<string, AssetSlotRecord[]>
  assetSlotsByReferenceId: Map<number, AssetSlotRecord[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const filterDefs: { key: EntityFilter; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: '总编排', icon: LayoutList },
  { key: 'segments', label: '片段拆分', icon: GitBranch },
  { key: 'sceneMoments', label: '情节分析', icon: Route },
  { key: 'creativeReferences', label: '创作资料分析', icon: Sparkles },
  { key: 'assetSlots', label: '素材需求', icon: PackageCheck },
  { key: 'contentUnits', label: '内容单元分析', icon: Film },
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
  const [analysisTarget, setAnalysisTarget] = useState<AnalysisTarget>({ scope: 'production' })

  const queryKey = ['production-orchestrate', projectId] as const
  const scriptVersionsQueryKey = ['production-orchestrate-script-versions', projectId] as const
  const { data, isLoading, isFetching, refetch } = useQuery<OrchestrationData>({
    queryKey,
    queryFn: () => loadOrchestrationData(projectId!),
    enabled: !!projectId,
  })
  const { data: scriptVersions = [], isFetching: isFetchingScriptVersions } = useQuery<ScriptVersion[]>({
    queryKey: scriptVersionsQueryKey,
    queryFn: () => listScriptVersions(projectId!),
    enabled: !!projectId,
  })

  const productions = data?.productions ?? []
  const selectedProduction = productions.find((p) => p.ID === productionId) ?? productions[0]
  const effectiveProductionId = selectedProduction?.ID ?? 0
  const selectedScriptVersion = useMemo(
    () => scriptVersions.find((version) => version.ID === Number(selectedProduction?.script_version_id)) ?? null,
    [scriptVersions, selectedProduction?.script_version_id],
  )
  const scriptText = (selectedScriptVersion?.content || selectedScriptVersion?.raw_source || '').trim()

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
  const allSegmentsById = useMemo(() => new Map(allSegments.map((segment) => [segment.ID, segment])), [allSegments])
  const lookup = useMemo(() => buildOrchestrationLookup({
    scriptText,
    scriptVersionTitle: selectedScriptVersion?.title ?? '',
    segments: allSegments,
    sceneMoments: allSceneMoments,
    creativeReferences: allCreativeReferences,
    creativeReferenceUsages: data?.creativeReferenceUsages ?? [],
    assetSlots: allAssetSlots,
    contentUnits: allContentUnits,
  }), [allAssetSlots, allCreativeReferences, allContentUnits, allSceneMoments, allSegments, data?.creativeReferenceUsages, scriptText, selectedScriptVersion?.title])
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
  const guideCounts: GuideCounts = {
    segments: allSegments.length,
    creative_references: allCreativeReferences.length,
    scene_moments: allSceneMoments.length,
    asset_slots: allAssetSlots.length,
    content_units: allContentUnits.length,
  }
  const guidePendingCounts: GuideCounts = {
    segments: candidates ? countPending(candidates.segments) : 0,
    creative_references: candidates ? countPending(candidates.creative_references) : 0,
    scene_moments: candidates ? countPending(candidates.scene_moments) : 0,
    asset_slots: candidates ? countPending(candidates.asset_slots) : 0,
    content_units: candidates ? countPending(candidates.content_units) : 0,
  }

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

  function handleConflictDecision(key: keyof TrackedCandidates, clientId: string, decision: 'overwrite' | 'parallel') {
    setCandidates((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: (prev[key] as TrackedCandidate<{ client_id: string }>[]).map((c) =>
          c.data.client_id === clientId
            ? { ...c, status: (decision === 'overwrite' ? 'conflict_overwrite' : 'conflict_parallel') as CandidateStatus }
            : c
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

  function handleAnalyzeTarget(target: AnalysisTarget) {
    setAnalysisTarget(target)
    setAIPanelOpen(true)
  }

  function handleClearCandidates() {
    setCandidates(null)
    setShowDiff(false)
  }

  function resolvedCandidateSegmentId(clientId?: string) {
    const text = String(clientId ?? '')
    if (!text) return selectedSegment?.ID
    const numericId = Number(text)
    if (Number.isFinite(numericId) && allSegmentsById.has(numericId)) return numericId
    const candidate = candidates?.segments.find((item) => item.data.client_id === text)?.data
    if (!candidate) return selectedSegment?.ID
    return allSegments.find((segment) => segment.order === candidate.order || segment.title === candidate.title)?.ID ?? selectedSegment?.ID
  }

  function resolvedCandidateSceneMomentId(clientId?: string, segmentId?: number) {
    const text = String(clientId ?? '')
    if (!text) return selectedSceneMoment?.ID
    const numericId = Number(text)
    if (Number.isFinite(numericId) && lookup.sceneMomentById.has(numericId)) return numericId
    const candidate = candidates?.scene_moments.find((item) => item.data.client_id === text)?.data
    const scopedMoments = segmentId ? allSceneMoments.filter((moment) => moment.segment_id === segmentId) : allSceneMoments
    if (!candidate) return scopedMoments[0]?.ID ?? selectedSceneMoment?.ID
    return scopedMoments.find((moment) => moment.order === candidate.order || moment.title === candidate.title)?.ID ?? scopedMoments[0]?.ID ?? selectedSceneMoment?.ID
  }

  function resolvedCandidateCreativeReferenceId(clientIdOrName?: string) {
    const text = String(clientIdOrName ?? '').trim()
    if (!text) return null
    const numericId = Number(text)
    if (Number.isFinite(numericId) && lookup.creativeReferenceById.has(numericId)) return numericId
    const candidate = candidates?.creative_references.find((item) => item.data.client_id === text || item.data.name === text)?.data
    const name = candidate?.name ?? text
    const type = candidate?.type
    return allCreativeReferences.find((reference) => (
      String(reference.name ?? '') === name &&
      (!type || String(reference.kind ?? '') === type)
    ))?.ID ?? null
  }

  function resolvedCandidateContentUnitId(clientIdOrTitle?: string, segmentId?: number, sceneMomentId?: number) {
    const text = String(clientIdOrTitle ?? '').trim()
    if (!text) return null
    const numericId = Number(text)
    if (Number.isFinite(numericId) && lookup.contentUnitById.has(numericId)) return numericId
    const candidate = candidates?.content_units.find((item) => item.data.client_id === text || item.data.description === text)?.data
    const scopedUnits = allContentUnits.filter((unit) => (
      (!segmentId || Number(unit.segment_id) === segmentId) &&
      (!sceneMomentId || Number(unit.scene_moment_id) === sceneMomentId)
    ))
    if (!candidate) return scopedUnits.find((unit) => titleOfRecord(unit) === text)?.ID ?? null
    return scopedUnits.find((unit) => (
      Number(unit.order) === candidate.order ||
      String(unit.description ?? unit.title ?? '') === String(candidate.description ?? '')
    ))?.ID ?? null
  }

  async function linkReferenceToOwner(ownerType: string, ownerId: number | null | undefined, referenceId: number | null | undefined, evidence?: string, role = 'supporting') {
    if (!projectId || !ownerId || !referenceId) return
    await createSemanticEntity(projectId, semanticEntityConfig('creativeReferenceUsages'), {
      owner_type: ownerType,
      owner_id: ownerId,
      creative_reference_id: referenceId,
      role,
      source: 'ai',
      status: 'draft',
      evidence: evidence ?? '',
    })
  }

  async function linkCandidateReferencesToOwner(ownerType: string, ownerId: number | null | undefined, clientIds: string[] | undefined, evidence?: string) {
    const referenceIds = uniqueNumbers((clientIds ?? []).map((clientId) => resolvedCandidateCreativeReferenceId(clientId)).filter(isPositiveNumber))
    for (const referenceId of referenceIds) {
      await linkReferenceToOwner(ownerType, ownerId, referenceId, evidence)
    }
  }

  async function linkReferenceToCurrentSegment(referenceId: number, evidence?: string) {
    await linkReferenceToOwner('segment', selectedSegment?.ID, referenceId, evidence, 'supporting')
  }

  async function acceptSegmentCandidate(data: AISegmentCandidate, overwriteId?: number) {
    const payload = {
      production_id: effectiveProductionId || 0,
      title: data.title,
      summary: data.summary,
      kind: 'section',
      status: 'draft',
      order: data.order,
    }
    const saved = overwriteId
      ? await updateSemanticEntity(projectId!, semanticEntityConfig('segments'), overwriteId, payload)
      : await createSemanticEntity(projectId!, semanticEntityConfig('segments'), payload)
    handleAcceptCandidate('segments', data.client_id)
    toast.success(overwriteId ? `片段「${saved.title}」已覆盖更新` : `片段「${saved.title}」已创建`)
    refetch()
  }

  async function acceptSceneMomentCandidate(data: AISceneMomentCandidate, overwriteId?: number) {
    const segmentId = resolvedCandidateSegmentId(data.segment_id)
    const payload = {
      segment_id: segmentId ?? null,
      title: data.title,
      time_text: data.time_text ?? '',
      location_text: data.location_text ?? '',
      action_text: data.action_text ?? '',
      mood: data.mood ?? '',
      status: 'draft',
      order: data.order,
    }
    const saved = overwriteId
      ? await updateSemanticEntity(projectId!, semanticEntityConfig('sceneMoments'), overwriteId, payload)
      : await createSemanticEntity(projectId!, semanticEntityConfig('sceneMoments'), payload)
    handleAcceptCandidate('scene_moments', data.client_id)
    await linkCandidateReferencesToOwner('scene_moment', saved.ID, data.creative_reference_ids, data.action_text ?? data.title)
    toast.success(overwriteId ? `情节「${saved.title}」已覆盖更新` : `情节「${saved.title}」已创建`)
    refetch()
  }

  async function acceptCreativeReferenceCandidate(data: AICreativeReferenceCandidate, overwriteId?: number) {
    const payload = {
      name: data.name,
      kind: data.type,
      importance: data.importance,
      description: data.description ?? '',
      status: 'draft',
    }
    const saved = overwriteId
      ? await updateSemanticEntity(projectId!, semanticEntityConfig('creativeReferences'), overwriteId, payload)
      : await createSemanticEntity(projectId!, semanticEntityConfig('creativeReferences'), payload)
    const segmentIds = uniqueNumbers([
      ...((data.segment_ids ?? []).map((clientId) => resolvedCandidateSegmentId(clientId)).filter(isPositiveNumber)),
      ...(data.segment_ids?.length ? [] : [selectedSegment?.ID].filter(isPositiveNumber)),
    ])
    const sceneMomentIds = uniqueNumbers((data.scene_moment_ids ?? []).map((clientId) => resolvedCandidateSceneMomentId(clientId)).filter(isPositiveNumber))
    const contentUnitIds = uniqueNumbers((data.content_unit_ids ?? []).map((clientId) => resolvedCandidateContentUnitId(clientId)).filter(isPositiveNumber))
    for (const segmentId of segmentIds) await linkReferenceToOwner('segment', segmentId, saved.ID, data.description)
    for (const sceneMomentId of sceneMomentIds) await linkReferenceToOwner('scene_moment', sceneMomentId, saved.ID, data.description)
    for (const contentUnitId of contentUnitIds) await linkReferenceToOwner('content_unit', contentUnitId, saved.ID, data.description)
    handleAcceptCandidate('creative_references', data.client_id)
    toast.success(overwriteId ? `创作资料「${saved.name}」已覆盖更新` : `创作资料「${saved.name}」已创建`)
    refetch()
  }

  async function acceptAssetSlotCandidate(data: AIAssetSlotCandidate, overwriteId?: number) {
    const segmentId = resolvedCandidateSegmentId(data.segment_id)
    const sceneMomentId = resolvedCandidateSceneMomentId(data.scene_moment_id, segmentId)
    const contentUnitId = resolvedCandidateContentUnitId(data.content_unit_id, segmentId, sceneMomentId ?? undefined)
    const ownerType = contentUnitId ? 'content_unit' : sceneMomentId ? 'scene_moment' : segmentId ? 'segment' : ''
    const ownerId = contentUnitId ?? sceneMomentId ?? segmentId ?? null
    const creativeReferenceId = resolvedCandidateCreativeReferenceId(data.creative_reference_id)
    const payload = {
      name: data.name,
      kind: data.type,
      priority: data.priority,
      description: data.description ?? '',
      status: 'missing',
      production_id: effectiveProductionId || null,
      owner_type: ownerType,
      owner_id: ownerId,
      creative_reference_id: creativeReferenceId,
    }
    const saved = overwriteId
      ? await updateSemanticEntity(projectId!, semanticEntityConfig('assetSlots'), overwriteId, payload)
      : await createSemanticEntity(projectId!, semanticEntityConfig('assetSlots'), payload)
    handleAcceptCandidate('asset_slots', data.client_id)
    toast.success(overwriteId ? `素材需求「${saved.name}」已覆盖更新` : `素材需求「${saved.name}」已创建`)
    refetch()
  }

  async function acceptContentUnitCandidate(data: AIContentUnitCandidate, overwriteId?: number) {
    const segmentId = resolvedCandidateSegmentId(data.segment_id)
    const sceneMomentId = resolvedCandidateSceneMomentId(data.scene_moment_id, segmentId)
    const payload = {
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
    }
    const saved = overwriteId
      ? await updateSemanticEntity(projectId!, semanticEntityConfig('contentUnits'), overwriteId, payload)
      : await createSemanticEntity(projectId!, semanticEntityConfig('contentUnits'), payload)
    handleAcceptCandidate('content_units', data.client_id)
    await linkCandidateReferencesToOwner('content_unit', saved.ID, data.creative_reference_ids, data.description)
    toast.success(overwriteId ? `内容单元「${saved.title}」已覆盖更新` : `内容单元「${saved.title}」已创建`)
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
    onAnalyze: handleAnalyzeTarget,
    candidates,
    showDiff,
    onAcceptCandidate: handleAcceptCandidate,
    onRejectCandidate: handleRejectCandidate,
    onConflictDecision: handleConflictDecision,
    lookup,
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
              onClick={() => {
                setAnalysisTarget({ scope: 'production' })
                setFilter('all')
                setAIPanelOpen((v) => !v)
              }}
            >
              <Sparkles size={13} />
              总编排
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
                onOpenAI={() => {
                  setAnalysisTarget({ scope: 'production' })
                  setFilter('all')
                  setAIPanelOpen(true)
                }}
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
                    pendingCandidates={(showDiff ? (candidates?.segments.filter((c) => c.status === 'pending' || c.status === 'conflict_pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
                    renderCandidate={(c) => {
                      const data = c.data as AISegmentCandidate & ConflictInfo
                      return (
                        <AISegmentRow key={data.client_id} candidate={data} status={c.status}
                          onAccept={async () => { await acceptSegmentCandidate(data) }}
                          onReject={() => handleRejectCandidate('segments', data.client_id)}
                          onOverwrite={async () => { await acceptSegmentCandidate(data, data.conflict_entity_id) }}
                          onParallel={async () => { await acceptSegmentCandidate(data) }} />
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
                    pendingCandidates={(showDiff ? (candidates?.scene_moments.filter((c) => c.status === 'pending' || c.status === 'conflict_pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
                    renderCandidate={(c) => {
                      const data = c.data as AISceneMomentCandidate & ConflictInfo
                      return (
                        <AISceneMomentRow key={data.client_id} candidate={data} status={c.status}
                          onAccept={async () => { await acceptSceneMomentCandidate(data) }}
                          onReject={() => handleRejectCandidate('scene_moments', data.client_id)}
                          onOverwrite={async () => { await acceptSceneMomentCandidate(data, data.conflict_entity_id) }}
                          onParallel={async () => { await acceptSceneMomentCandidate(data) }} />
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
                    pendingCandidates={(showDiff ? (candidates?.creative_references.filter((c) => c.status === 'pending' || c.status === 'conflict_pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
                    renderCandidate={(c) => {
                      const data = c.data as AICreativeReferenceCandidate & ConflictInfo
                      return (
                        <AICreativeReferenceRow key={data.client_id} candidate={data} status={c.status}
                          onAccept={async () => { await acceptCreativeReferenceCandidate(data) }}
                          onReject={() => handleRejectCandidate('creative_references', data.client_id)}
                          onOverwrite={async () => { await acceptCreativeReferenceCandidate(data, data.conflict_entity_id) }}
                          onParallel={async () => { await acceptCreativeReferenceCandidate(data) }} />
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
                    pendingCandidates={(showDiff ? (candidates?.asset_slots.filter((c) => c.status === 'pending' || c.status === 'conflict_pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
                    renderCandidate={(c) => {
                      const data = c.data as AIAssetSlotCandidate & ConflictInfo
                      return (
                        <AIAssetSlotRow key={data.client_id} candidate={data} status={c.status}
                          onAccept={async () => { await acceptAssetSlotCandidate(data) }}
                          onReject={() => handleRejectCandidate('asset_slots', data.client_id)}
                          onOverwrite={async () => { await acceptAssetSlotCandidate(data, data.conflict_entity_id) }}
                          onParallel={async () => { await acceptAssetSlotCandidate(data) }} />
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
                    pendingCandidates={(showDiff ? (candidates?.content_units.filter((c) => c.status === 'pending' || c.status === 'conflict_pending') ?? []) : []) as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]}
                    renderCandidate={(c) => {
                      const data = c.data as AIContentUnitCandidate & ConflictInfo
                      return (
                        <AIContentUnitRow key={data.client_id} candidate={data} status={c.status}
                          onAccept={async () => { await acceptContentUnitCandidate(data) }}
                          onReject={() => handleRejectCandidate('content_units', data.client_id)}
                          onOverwrite={async () => { await acceptContentUnitCandidate(data, data.conflict_entity_id) }}
                          onParallel={async () => { await acceptContentUnitCandidate(data) }} />
                      )
                    }}
                    onAdd={() => setCreateType('contentUnits')}
                  />
                ) : null}
              </div>
            </div>
          )}
        </main>

        {/* Agent chat sidebar */}
        {aiPanelOpen && (
          <AgentChatSidebar
            projectId={projectId}
            production={selectedProduction}
            selectedSegment={selectedSegment}
            segments={allSegments}
            sceneMoments={allSceneMoments}
            creativeReferences={allCreativeReferences}
            assetSlots={allAssetSlots}
            contentUnits={allContentUnits}
            guideCounts={guideCounts}
            pendingCounts={guidePendingCounts}
            analysisTarget={analysisTarget}
            onAnalysisTargetChange={setAnalysisTarget}
            onClose={() => setAIPanelOpen(false)}
            onResult={(result) => {
              const toStatus = (d: unknown): CandidateStatus => {
                const cs = (d as { conflict_status?: string }).conflict_status
                return cs === 'duplicate' || cs === 'supersedes' ? 'conflict_pending' : 'pending'
              }
              setCandidates({
                segments: result.segments.map((d) => ({ data: d as AISegmentCandidate & ConflictInfo, status: toStatus(d) })),
                scene_moments: result.scene_moments.map((d) => ({ data: d as AISceneMomentCandidate & ConflictInfo, status: toStatus(d) })),
                creative_references: result.creative_references.map((d) => ({ data: d as AICreativeReferenceCandidate & ConflictInfo, status: toStatus(d) })),
                asset_slots: result.asset_slots.map((d) => ({ data: d as AIAssetSlotCandidate & ConflictInfo, status: toStatus(d) })),
                content_units: result.content_units.map((d) => ({ data: d as AIContentUnitCandidate & ConflictInfo, status: toStatus(d) })),
              })
              setShowDiff(true)
              const conflictCount = [
                ...result.segments, ...result.scene_moments, ...result.creative_references,
                ...result.asset_slots, ...result.content_units,
              ].filter((d) => d.conflict_status === 'duplicate' || d.conflict_status === 'supersedes').length
              const msg = `AI分析完成：${result.segments.length} 片段，${result.scene_moments.length} 情节，${result.creative_references.length} 资料，${result.asset_slots.length} 素材，${result.content_units.length} 内容单元`
              if (conflictCount > 0) {
                toast.info(`${msg}（${conflictCount} 个与已有实体冲突，请选择覆盖或并行）`)
              } else {
                toast.success(msg)
              }
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
          <span className="flex items-center gap-1.5"><LayoutList size={13} />总编排工作区</span>
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
            <Sparkles size={13} />
            总编排
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <DecisionMetric icon={Route} label="当前情节" value={selectedMoments.length} />
        <DecisionMetric icon={Film} label="内容单元" value={selectedUnits.length} />
        <DecisionMetric icon={PackageCheck} label="素材缺口" value={missingAssetCount} tone={missingAssetCount > 0 ? 'warn' : 'ok'} />
        <DecisionMetric icon={Sparkle} label="阶段候选" value={pending} tone={pending > 0 ? 'warn' : 'muted'} />
      </div>
    </section>
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
  lookup: OrchestrationLookup
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
  onAcceptSegmentCandidate: (candidate: AISegmentCandidate, overwriteId?: number) => Promise<void>
  onAcceptCreativeReferenceCandidate: (candidate: AICreativeReferenceCandidate, overwriteId?: number) => Promise<void>
  onAcceptAssetSlotCandidate: (candidate: AIAssetSlotCandidate, overwriteId?: number) => Promise<void>
  candidates: TrackedCandidates | null
  showDiff: boolean
  onAcceptCandidate: (key: keyof TrackedCandidates, clientId: string) => void
  onRejectCandidate: (key: keyof TrackedCandidates, clientId: string) => void
  onConflictDecision: (key: keyof TrackedCandidates, clientId: string, decision: 'overwrite' | 'parallel') => void
  onAnalyze: (target: AnalysisTarget) => void
}

function AllView({ segments, sceneMoments, creativeReferences, assetSlots, contentUnits, lookup, projectId, productionId, queryKey, expandedIds, onToggleExpand, onEdit, onAddSegment, onAddReference, onAddAsset, onAcceptSegmentCandidate, onAcceptCreativeReferenceCandidate, onAcceptAssetSlotCandidate, candidates, showDiff, onAcceptCandidate, onRejectCandidate, onConflictDecision, onAnalyze }: AllViewProps) {
  const sharedEntityProps = {
    projectId,
    productionId,
    queryKey,
    expandedIds,
    onToggleExpand,
    onEdit,
    onCreateChild: () => {},
    onAnalyze,
    candidates,
    showDiff,
    onAcceptCandidate,
    onRejectCandidate,
    lookup,
  }

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
        {showDiff && candidates && candidates.segments.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 新增候选</p>
            {candidates.segments.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').map((c) => (
              <AISegmentRow key={c.data.client_id} candidate={c.data} status={c.status}
                onAccept={async () => { await onAcceptSegmentCandidate(c.data) }}
                onReject={() => onRejectCandidate('segments', c.data.client_id)}
                onOverwrite={async () => { await onAcceptSegmentCandidate(c.data, c.data.conflict_entity_id) }}
                onParallel={async () => { await onAcceptSegmentCandidate(c.data) }}
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
        {showDiff && candidates && candidates.creative_references.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 新增候选</p>
            {candidates.creative_references.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').map((c) => (
              <AICreativeReferenceRow key={c.data.client_id} candidate={c.data} status={c.status}
                onAccept={async () => { await onAcceptCreativeReferenceCandidate(c.data) }}
                onReject={() => onRejectCandidate('creative_references', c.data.client_id)}
                onOverwrite={async () => { await onAcceptCreativeReferenceCandidate(c.data, c.data.conflict_entity_id) }}
                onParallel={async () => { await onAcceptCreativeReferenceCandidate(c.data) }}
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
        {showDiff && candidates && candidates.asset_slots.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 新增候选</p>
            {candidates.asset_slots.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').map((c) => (
              <AIAssetSlotRow key={c.data.client_id} candidate={c.data} status={c.status}
                onAccept={async () => { await onAcceptAssetSlotCandidate(c.data) }}
                onReject={() => onRejectCandidate('asset_slots', c.data.client_id)}
                onOverwrite={async () => { await onAcceptAssetSlotCandidate(c.data, c.data.conflict_entity_id) }}
                onParallel={async () => { await onAcceptAssetSlotCandidate(c.data) }}
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

function TypeSection({ label, items, renderRow, pendingCandidates, renderCandidate, onAdd }: TypeSectionProps) {
  return (
    <div className="divide-y divide-border/50">
      {pendingCandidates.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50/50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-2">
            <Sparkle size={13} className="text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">阶段候选 · {pendingCandidates.length} 条待确认</span>
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
  onAnalyze: (target: AnalysisTarget) => void
  candidates: TrackedCandidates | null
  showDiff: boolean
  onAcceptCandidate: (key: keyof TrackedCandidates, clientId: string) => void
  onRejectCandidate: (key: keyof TrackedCandidates, clientId: string) => void
  lookup: OrchestrationLookup
}

function SegmentRow({ segment, sceneMoments, contentUnits, projectId, queryKey, expandedIds, onToggleExpand, onEdit, onAnalyze, lookup }: { segment: SegmentRecord; sceneMoments: SceneMomentRecord[]; contentUnits: ContentUnitRecord[] } & SharedRowProps) {
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
          <button type="button" onClick={() => onAnalyze({ scope: 'segmentAnalysis', entityId: segment.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="单项分析">
            <Wand2 size={13} />
          </button>
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
              <p className="text-[10px] text-muted-foreground">剧本正文</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{String(segment.content)}</p>
            </div>
          )}
          {!segment.content && lookup.scriptText && segment.source_range && renderScriptExcerpt(lookup.scriptText, String(segment.source_range), segment)}
          {!segment.content && segment.summary && (
            <div className="px-2 pb-2">
              <p className="text-[10px] text-muted-foreground">摘要</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{String(segment.summary)}</p>
            </div>
          )}
          <RelationBlock label="出现的情节" items={childSceneMoments.map((item) => titleOfRecord(item))} />
          <RelationBlock label="出现的内容单元" items={childContentUnits.map((item) => titleOfRecord(item))} />
          {/* Child scene moments */}
          {childSceneMoments.length > 0 && (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">情节</p>
              {childSceneMoments.map((sm) => (
                <SceneMomentRow key={sm.ID} moment={sm} segments={[]} projectId={projectId} productionId={0} queryKey={queryKey} expandedIds={expandedIds} onToggleExpand={onToggleExpand} onEdit={onEdit} onCreateChild={() => {}} onAnalyze={onAnalyze} lookup={lookup} candidates={null} showDiff={false} onAcceptCandidate={() => {}} onRejectCandidate={() => {}} />
              ))}
            </div>
          )}
          {/* Child content units */}
          {childContentUnits.length > 0 && (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">内容单元</p>
              {childContentUnits.map((cu) => (
                <ContentUnitRow key={cu.ID} unit={cu} segments={[]} sceneMoments={[]} projectId={projectId} productionId={0} queryKey={queryKey} expandedIds={expandedIds} onToggleExpand={onToggleExpand} onEdit={onEdit} onCreateChild={() => {}} onAnalyze={onAnalyze} lookup={lookup} candidates={null} showDiff={false} onAcceptCandidate={() => {}} onRejectCandidate={() => {}} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SceneMomentRow({ moment, segments, projectId, queryKey, expandedIds, onToggleExpand, onEdit, onAnalyze, lookup }: { moment: SceneMomentRecord; segments: SegmentRecord[] } & SharedRowProps) {
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
          <button type="button" onClick={() => onAnalyze({ scope: 'sceneMoments', entityId: moment.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="单项分析">
            <Wand2 size={13} />
          </button>
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
              <p className="text-[10px] text-muted-foreground">情节文字</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">{String(moment.description)}</p>
            </div>
          )}
          {lookup.assetSlotsByOwnerKey.has(ownerKey('scene_moment', moment.ID)) && (
            <RelationBlock
              label="出现的素材"
              items={lookup.assetSlotsByOwnerKey.get(ownerKey('scene_moment', moment.ID))?.map((item) => titleOfRecord(item)) ?? []}
            />
          )}
        </div>
      )}
    </div>
  )
}

function CreativeReferenceRow({ reference, projectId, queryKey, expandedIds, onToggleExpand, onEdit, onAnalyze, lookup }: { reference: CreativeReferenceRecord } & SharedRowProps) {
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
          <button type="button" onClick={() => onAnalyze({ scope: 'creativeReferences', entityId: reference.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="单项分析">
            <Wand2 size={13} />
          </button>
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
            <p className="text-[10px] text-muted-foreground">资料文字</p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground">{String(reference.description)}</p>
          </div>
          {reference.alias && <div className="px-2 pb-2"><DetailField label="别名" value={String(reference.alias)} /></div>}
          <RelationBlock
            label="出现于"
            items={[
              ...((lookup.usagesByReferenceId.get(reference.ID) ?? []).map((usage) => {
                const ownerLabel = formatOwnerLabel(String(usage.owner_type ?? ''), Number(usage.owner_id ?? 0), lookup)
                return ownerLabel ? `${ownerLabel}${usage.role ? ` · ${String(usage.role)}` : ''}` : ''
              }).filter(Boolean)),
              ...((lookup.assetSlotsByReferenceId.get(reference.ID) ?? []).map((slot) => formatAssetSlotLabel(slot, lookup)).filter(Boolean)),
            ]}
          />
        </div>
      )}
    </div>
  )
}

function AssetSlotRow({ slot, projectId, queryKey, expandedIds, onToggleExpand, onEdit, onAnalyze, lookup }: { slot: AssetSlotRecord } & SharedRowProps) {
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
          <button type="button" onClick={() => onAnalyze({ scope: 'assetSlots', entityId: slot.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="单项分析">
            <Wand2 size={13} />
          </button>
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
          <RelationBlock
            label="出现于"
            items={assetSlotAppearances(slot, lookup)}
          />
        </div>
      )}
    </div>
  )
}

function ContentUnitRow({ unit, segments, sceneMoments, projectId, queryKey, expandedIds, onToggleExpand, onEdit, onAnalyze, lookup }: { unit: ContentUnitRecord; segments: SegmentRecord[]; sceneMoments: SceneMomentRecord[] } & SharedRowProps) {
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
          <button type="button" onClick={() => onAnalyze({ scope: 'contentUnits', entityId: unit.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="单项分析">
            <Wand2 size={13} />
          </button>
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
          <RelationBlock label="对应片段/情节" items={contentUnitAppearances(unit, lookup)} />
          <RelationBlock label="相关资料" items={contentUnitReferences(unit, lookup)} />
          <RelationBlock label="相关素材" items={contentUnitAssetSlots(unit, lookup)} />
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

function AISegmentRow({
  candidate,
  status,
  onAccept,
  onReject,
  onOverwrite,
  onParallel,
}: {
  candidate: AISegmentCandidate & ConflictInfo
  status?: CandidateStatus
  onAccept: () => Promise<void>
  onReject: () => void
  onOverwrite?: () => Promise<void>
  onParallel?: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  const isConflict = status === 'conflict_pending'
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border p-2.5',
      isConflict
        ? 'border-rose-200 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/20'
        : 'border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30',
    )}>
      <Sparkle size={13} className={cn('mt-0.5 shrink-0', isConflict ? 'text-rose-500' : 'text-amber-500')} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.title}</span>
        {candidate.summary && <p className="mt-0.5 text-xs text-muted-foreground">{candidate.summary}</p>}
        {isConflict && onOverwrite && onParallel && (
          <ConflictBanner
            conflictEntityId={candidate.conflict_entity_id}
            conflictEntityName={candidate.conflict_entity_name}
            conflictSimilarity={candidate.conflict_similarity}
            onOverwrite={onOverwrite}
            onParallel={onParallel}
            onReject={onReject}
          />
        )}
      </div>
      {!isConflict && <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />}
    </div>
  )
}

function AISceneMomentRow({
  candidate,
  status,
  onAccept,
  onReject,
  onOverwrite,
  onParallel,
}: {
  candidate: AISceneMomentCandidate & ConflictInfo
  status?: CandidateStatus
  onAccept: () => Promise<void>
  onReject: () => void
  onOverwrite?: () => Promise<void>
  onParallel?: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  const isConflict = status === 'conflict_pending'
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border p-2.5',
      isConflict
        ? 'border-rose-200 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/20'
        : 'border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30',
    )}>
      <Sparkle size={13} className={cn('mt-0.5 shrink-0', isConflict ? 'text-rose-500' : 'text-amber-500')} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.title}</span>
        <div className="mt-0.5 flex gap-3 text-[11px] text-muted-foreground">
          {candidate.time_text && <span>{candidate.time_text}</span>}
          {candidate.location_text && <span>{candidate.location_text}</span>}
          {candidate.mood && <span>{candidate.mood}</span>}
        </div>
        {candidate.action_text && <p className="mt-0.5 text-xs text-muted-foreground">{candidate.action_text}</p>}
        <CandidateRelationLine
          refs={candidate.creative_reference_ids}
          assets={candidate.asset_slot_ids}
          units={candidate.content_unit_ids}
        />
        {isConflict && onOverwrite && onParallel && (
          <ConflictBanner
            conflictEntityId={candidate.conflict_entity_id}
            conflictEntityName={candidate.conflict_entity_name}
            conflictSimilarity={candidate.conflict_similarity}
            onOverwrite={onOverwrite}
            onParallel={onParallel}
            onReject={onReject}
          />
        )}
      </div>
      {!isConflict && <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />}
    </div>
  )
}

function AICreativeReferenceRow({
  candidate,
  status,
  onAccept,
  onReject,
  onOverwrite,
  onParallel,
}: {
  candidate: AICreativeReferenceCandidate & ConflictInfo
  status?: CandidateStatus
  onAccept: () => Promise<void>
  onReject: () => void
  onOverwrite?: () => Promise<void>
  onParallel?: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  const isConflict = status === 'conflict_pending'
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border p-2.5',
      isConflict
        ? 'border-rose-200 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/20'
        : 'border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30',
    )}>
      <Sparkle size={13} className={cn('mt-0.5 shrink-0', isConflict ? 'text-rose-500' : 'text-amber-500')} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.name}</span>
        <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
          <span>{creativeReferenceKindLabel[candidate.type] ?? candidate.type}</span>
          <span>{candidate.importance === 'main' ? '主要' : candidate.importance === 'supporting' ? '辅助' : '背景'}</span>
        </div>
        {candidate.description && <p className="mt-0.5 text-xs text-muted-foreground">{candidate.description}</p>}
        <CandidateRelationLine
          segments={candidate.segment_ids}
          moments={candidate.scene_moment_ids}
          units={candidate.content_unit_ids}
          assets={candidate.required_asset_slot_ids}
        />
        {isConflict && onOverwrite && onParallel && (
          <ConflictBanner
            conflictEntityId={candidate.conflict_entity_id}
            conflictEntityName={candidate.conflict_entity_name}
            conflictSimilarity={candidate.conflict_similarity}
            onOverwrite={onOverwrite}
            onParallel={onParallel}
            onReject={onReject}
          />
        )}
      </div>
      {!isConflict && <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />}
    </div>
  )
}

function AIAssetSlotRow({
  candidate,
  status,
  onAccept,
  onReject,
  onOverwrite,
  onParallel,
}: {
  candidate: AIAssetSlotCandidate & ConflictInfo
  status?: CandidateStatus
  onAccept: () => Promise<void>
  onReject: () => void
  onOverwrite?: () => Promise<void>
  onParallel?: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  const isConflict = status === 'conflict_pending'
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border p-2.5',
      isConflict
        ? 'border-rose-200 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/20'
        : 'border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30',
    )}>
      <Sparkle size={13} className={cn('mt-0.5 shrink-0', isConflict ? 'text-rose-500' : 'text-amber-500')} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.name}</span>
        <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
          <span>{candidate.type}</span>
          <span>{statusLabel[candidate.priority] ?? candidate.priority}</span>
        </div>
        {candidate.description && <p className="mt-0.5 text-xs text-muted-foreground">{candidate.description}</p>}
        <CandidateRelationLine
          segments={candidate.segment_id ? [candidate.segment_id] : []}
          moments={candidate.scene_moment_id ? [candidate.scene_moment_id] : []}
          units={candidate.content_unit_id ? [candidate.content_unit_id] : []}
          refs={candidate.creative_reference_id ? [candidate.creative_reference_id] : []}
        />
        {isConflict && onOverwrite && onParallel && (
          <ConflictBanner
            conflictEntityId={candidate.conflict_entity_id}
            conflictEntityName={candidate.conflict_entity_name}
            conflictSimilarity={candidate.conflict_similarity}
            onOverwrite={onOverwrite}
            onParallel={onParallel}
            onReject={onReject}
          />
        )}
      </div>
      {!isConflict && <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />}
    </div>
  )
}

function AIContentUnitRow({
  candidate,
  status,
  onAccept,
  onReject,
  onOverwrite,
  onParallel,
}: {
  candidate: AIContentUnitCandidate & ConflictInfo
  status?: CandidateStatus
  onAccept: () => Promise<void>
  onReject: () => void
  onOverwrite?: () => Promise<void>
  onParallel?: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  async function handleAccept() { setLoading(true); try { await onAccept() } finally { setLoading(false) } }
  const isConflict = status === 'conflict_pending'
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border p-2.5',
      isConflict
        ? 'border-rose-200 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/20'
        : 'border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30',
    )}>
      <Sparkle size={13} className={cn('mt-0.5 shrink-0', isConflict ? 'text-rose-500' : 'text-amber-500')} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{candidate.description ?? `内容单元 #${candidate.order}`}</span>
        <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
          <span>{contentUnitKindLabel[candidate.type] ?? candidate.type}</span>
          {candidate.shot_size && <span>景别: {candidate.shot_size}</span>}
          {candidate.camera_angle && <span>角度: {candidate.camera_angle}</span>}
        </div>
        <CandidateRelationLine
          segments={candidate.segment_id ? [candidate.segment_id] : []}
          moments={candidate.scene_moment_id ? [candidate.scene_moment_id] : []}
          refs={candidate.creative_reference_ids}
          assets={candidate.asset_slot_ids}
        />
        {isConflict && onOverwrite && onParallel && (
          <ConflictBanner
            conflictEntityId={candidate.conflict_entity_id}
            conflictEntityName={candidate.conflict_entity_name}
            conflictSimilarity={candidate.conflict_similarity}
            onOverwrite={onOverwrite}
            onParallel={onParallel}
            onReject={onReject}
          />
        )}
      </div>
      {!isConflict && <CandidateActions onAccept={handleAccept} onReject={onReject} loading={loading} />}
    </div>
  )
}

function CandidateRelationLine({
  segments = [],
  moments = [],
  refs = [],
  assets = [],
  units = [],
}: {
  segments?: string[]
  moments?: string[]
  refs?: string[]
  assets?: string[]
  units?: string[]
}) {
  const items = [
    segments.length > 0 ? `片段 ${segments.join('/')}` : '',
    moments.length > 0 ? `情节 ${moments.join('/')}` : '',
    refs.length > 0 ? `资料 ${refs.join('/')}` : '',
    assets.length > 0 ? `素材 ${assets.join('/')}` : '',
    units.length > 0 ? `单元 ${units.join('/')}` : '',
  ].filter(Boolean)
  if (items.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
          {item}
        </span>
      ))}
    </div>
  )
}

function ConflictBanner({
  conflictEntityId,
  conflictEntityName,
  conflictSimilarity,
  onOverwrite,
  onParallel,
  onReject,
}: {
  conflictEntityId?: number
  conflictEntityName?: string
  conflictSimilarity?: number
  onOverwrite: () => Promise<void>
  onParallel: () => Promise<void>
  onReject: () => void
}) {
  const [loading, setLoading] = useState<'overwrite' | 'parallel' | null>(null)
  const similarityPct = conflictSimilarity !== undefined ? Math.round(conflictSimilarity * 100) : null

  async function handleOverwrite() {
    setLoading('overwrite')
    try { await onOverwrite() } finally { setLoading(null) }
  }
  async function handleParallel() {
    setLoading('parallel')
    try { await onParallel() } finally { setLoading(null) }
  }

  return (
    <div className="mt-2 rounded-md border border-rose-200 bg-rose-50/80 p-2 dark:border-rose-800/50 dark:bg-rose-950/30">
      <div className="flex items-start gap-1.5">
        <AlertCircle size={12} className="mt-0.5 shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
            与已有实体冲突
            {similarityPct !== null && <span className="ml-1 font-normal text-rose-500">（相似度 {similarityPct}%）</span>}
          </p>
          {conflictEntityName && (
            <p className="mt-0.5 truncate text-[10px] text-rose-600 dark:text-rose-400">
              已有：{conflictEntityName}{conflictEntityId ? ` #${conflictEntityId}` : ''}
            </p>
          )}
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={!!loading}
              onClick={handleOverwrite}
              className="flex items-center gap-1 rounded bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-500/25 disabled:opacity-50 dark:text-rose-300"
            >
              {loading === 'overwrite' && <Loader2 size={9} className="animate-spin" />}
              覆盖已有
            </button>
            <button
              type="button"
              disabled={!!loading}
              onClick={handleParallel}
              className="flex items-center gap-1 rounded bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-500/25 disabled:opacity-50 dark:text-blue-300"
            >
              {loading === 'parallel' && <Loader2 size={9} className="animate-spin" />}
              并行创建
            </button>
            <button
              type="button"
              disabled={!!loading}
              onClick={onReject}
              className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/80 disabled:opacity-50"
            >
              忽略
            </button>
          </div>
        </div>
      </div>
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

function buildOrchestrationAnalysisPrompt(scriptText: string, productionId?: number): string {
  const projectIdNote = productionId
    ? `当前制作 ID：${productionId}。`
    : ''
  return [
    `任务：对以下剧本进行递归、全面的制作编排分析。${projectIdNote}`,
    '',
    '执行步骤（必须按顺序，每步都要调用对应工具）：',
    '',
    '1. 调用 movscript.read_production_context 读取当前制作已有的实体和剧本文本。',
    '   - 参数：projectId（从上下文获取）、productionId（从上下文获取）、includeScriptText: true',
    '   - 目的：了解已有片段/情节/资料/素材/内容单元，为去重做准备',
    '',
    '2. 基于剧本文本，按叙事节奏（情绪弧线、时空跳跃、节奏变化）拆分片段。',
    '   - 片段是剧集级的，不是简单段落分割',
    '   - 每个片段：client_id（s1/s2...）、order、title、summary、source_range',
    '',
    '3. 对每个片段，递归分析其内部情节（scene_moments）。',
    '   - 每个情节必须带 segment_id（指向片段 client_id）',
    '   - 记录 time_text、location_text、action_text、mood',
    '',
    '4. 扫描全文提取创作资料（人物/地点/道具/产品/品牌/风格/世界规则）。',
    '   - 创作资料是项目级的，必须与已有资料对比去重',
    '   - 建立关系：segment_ids、scene_moment_ids、content_unit_ids',
    '',
    '5. 基于资料和情节，推断素材需求（asset_slots）。',
    '   - 素材也是项目级的，必须与已有素材对比去重',
    '   - 每个素材必须有 owner_type 和对应 owner client_id',
    '',
    '6. 对每个情节，递归分析内容单元（content_units）。',
    '   - 每个内容单元必须带 segment_id 和 scene_moment_id',
    '   - 记录 type、shot_size、camera_angle',
    '   - 关联 creative_reference_ids 和 asset_slot_ids',
    '',
    '7. 调用 movscript.check_entity_conflicts 检查所有候选的冲突情况。',
    '   - 传入所有五类候选',
    '   - 获取每个候选的 conflict_status',
    '',
    '8. 调用 movscript.propose_production_entities 写入最终候选。',
    '   - 传入带 conflict_status 的完整候选列表',
    '   - 包含 summary 字段描述分析结果',
    '',
    '关系完整性要求：',
    '- scene_moment.segment_id → 必须指向有效的 segment client_id',
    '- content_unit.segment_id + scene_moment_id → 必须指向有效的 client_id',
    '- asset_slot.owner_type + owner_id → 必须指向有效的 client_id',
    '',
    '剧本文本（如果 read_production_context 已返回剧本文本，以工具返回的为准）：',
    scriptText.length > 6000 ? scriptText.slice(0, 6000) + '\n...[剧本过长，已截断，请以工具读取的完整版本为准]' : scriptText,
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
      creative_reference_ids: toTextArray(row.creative_reference_ids),
      asset_slot_ids: toTextArray(row.asset_slot_ids),
      content_unit_ids: toTextArray(row.content_unit_ids),
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
      segment_ids: toTextArray(row.segment_ids),
      scene_moment_ids: toTextArray(row.scene_moment_ids),
      content_unit_ids: toTextArray(row.content_unit_ids),
      required_asset_slot_ids: toTextArray(row.required_asset_slot_ids),
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
      ...(toText(row.scene_moment_id) ? { scene_moment_id: toText(row.scene_moment_id) } : {}),
      ...(toText(row.content_unit_id) ? { content_unit_id: toText(row.content_unit_id) } : {}),
      ...(toText(row.creative_reference_id) ? { creative_reference_id: toText(row.creative_reference_id) } : {}),
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
      creative_reference_ids: toTextArray(row.creative_reference_ids),
      asset_slot_ids: toTextArray(row.asset_slot_ids),
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
    creative_reference_ids: creative_references.slice(0, 4).map((reference) => reference.client_id),
    asset_slot_ids: asset_slots.filter((slot) => slot.segment_id === segment.client_id).map((slot) => slot.client_id),
    order: index + 1,
    type: 'shot',
    description: segment.summary,
    shot_size: inferShotSize(segment.summary),
    camera_angle: '平视',
  }))

  for (const moment of scene_moments) {
    const segmentRefs = creative_references.filter((reference) => scriptText.includes(reference.name)).slice(0, 6)
    moment.creative_reference_ids = segmentRefs.map((reference) => reference.client_id)
    moment.asset_slot_ids = asset_slots.filter((slot) => slot.segment_id === moment.segment_id).map((slot) => slot.client_id)
    moment.content_unit_ids = content_units.filter((unit) => unit.scene_moment_id === moment.client_id).map((unit) => unit.client_id)
  }

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
      creative_reference_id: ref.client_id,
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

function toTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean)
  if (typeof value === 'string') return value.split(/[,\s，、]+/).map((item) => item.trim()).filter(Boolean)
  return []
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
  selectedSegment,
  segments,
  sceneMoments,
  creativeReferences,
  assetSlots,
  contentUnits,
  guideCounts,
  pendingCounts,
  analysisTarget,
  onAnalysisTargetChange,
  onClose,
  onResult,
}: {
  projectId?: number
  production?: SemanticEntityRecord & { script_version_id?: number; name?: string }
  selectedSegment: SegmentRecord | null
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  guideCounts: GuideCounts
  pendingCounts: GuideCounts
  analysisTarget: AnalysisTarget
  onAnalysisTargetChange: (target: AnalysisTarget) => void
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
    const productionId = production?.ID ?? 0

    // Build a concise prompt that instructs the agent to use its tools
    const analysisPrompt = buildOrchestrationAnalysisPrompt(text.trim(), productionId)

    try {
      await client.ensureRunning()

      const thread = await client.createThread({ projectId })
      await client.addMessage(thread.id, analysisPrompt, {
        message: '递归分析剧本，提取片段、情节、创作资料、素材需求和内容单元，去重并建立关系图',
        uiSnapshot: {
          route: { pathname: '/production-orchestrate', search: window.location.search },
          project: projectId ? { id: projectId } : undefined,
          selection: production?.ID
            ? { entityType: 'production', entityId: production.ID, label: String(production.name ?? `制作 #${production.ID}`) }
            : null,
          labels: ['production-orchestrate', 'recursive-analysis', 'tool-driven'],
        },
      })

      setReceivedData({
        message: text.trim(),
        context: {
          projectId,
          productionId,
          threadId: thread.id,
          scriptVersionId: scriptVersionId || undefined,
          promptLength: analysisPrompt.length,
          mode: 'tool-driven',
        },
      })

      const run = await client.createRun(thread.id, { agentManifest: ORCHESTRATE_AGENT_MANIFEST })
      setAgentRun(run)

      const finalRun = await client.waitForRun(run.id, {
        timeoutMs: 300_000,
        pollMs: 800,
        onRunUpdate: (updated) => setAgentRun({ ...updated }),
      })
      setAgentRun(finalRun)

      if (finalRun.status === 'failed') {
        throw new Error(finalRun.error || 'Agent 运行失败')
      }

      // Try to read the proposal draft written by the agent via propose_production_entities
      const proposalResult = await tryReadProposalDraft(client, projectId, productionId)
      if (proposalResult) {
        setOutputResult(proposalResult)
        setPhase('done')
        onResult(proposalResult)
        return
      }

      // Fallback: parse assistant message content as JSON (old behavior)
      const finalThread = await client.getThread(thread.id)
      const assistantMsg = [...finalThread.messages].reverse().find((m) => m.role === 'assistant')
      if (assistantMsg) {
        const parsed = parseAIAnalysisResult(assistantMsg.content)
        if (parsed) {
          setOutputResult(parsed)
          setPhase('done')
          onResult(parsed)
          return
        }
        setRawAgentResponse(assistantMsg.content)
      }

      throw new Error('制作编排未产出模型候选：Agent 没有写入候选草稿，也没有返回可解析的 JSON。已禁止本地分析兜底。')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '分析失败')
      setPhase('error')
    }
  }

  async function tryReadProposalDraft(
    client: LocalAgentClient,
    projectId: number | undefined,
    productionId: number,
  ): Promise<AIAnalysisResult | null> {
    if (!projectId) return null
    try {
      const { drafts } = await client.listDrafts({ projectId, kind: 'pipeline', status: 'draft', limit: 5 })
      // Find the most recent proposal draft for this production
      const proposal = drafts
        .filter((d) => {
          try {
            const content = JSON.parse(d.content)
            return content.productionId === productionId && content.candidates
          } catch {
            return false
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

      if (!proposal) return null

      const content = JSON.parse(proposal.content)
      const candidates = content.candidates
      if (!candidates) return null

      return normalizeAIAnalysisResult(candidates)
    } catch {
      return null
    }
  }

  const effectiveText = getAnalysisText(analysisTarget, {
    manualText: scriptText,
    linkedVersion,
    production,
    selectedSegment,
    segments,
    sceneMoments,
    creativeReferences,
    assetSlots,
    contentUnits,
  })
  const pendingTotal = Object.values(pendingCounts).reduce((sum, count) => sum + count, 0)
  const outputCounts = {
    segments: guideCounts.segments + pendingCounts.segments,
    sceneMoments: guideCounts.scene_moments + pendingCounts.scene_moments,
    creativeReferences: guideCounts.creative_references + pendingCounts.creative_references,
    assetSlots: guideCounts.asset_slots + pendingCounts.asset_slots,
    contentUnits: guideCounts.content_units + pendingCounts.content_units,
  }
  const isWholeScope = analysisTarget.scope === 'production' || analysisTarget.scope === 'segments'

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-border bg-card">
      {/* Sidebar header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">总编排</span>
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
        <div className="border-b border-border px-4 py-3">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">
              {production ? String(production.name ?? `制作 #${production.ID}`) : '未选择制作'}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              总编排负责串联全部子功能；点击任一阶段或实体的分析按钮，可进入对应子功能。
            </p>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] font-medium text-muted-foreground">分析范围</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(['production', 'segments', 'segmentAnalysis', 'sceneMoments', 'creativeReferences', 'assetSlots', 'contentUnits'] as AnalysisScope[]).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => onAnalysisTargetChange({ scope, entityId: scope === analysisTarget.scope && scope !== 'segments' ? analysisTarget.entityId : null })}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors',
                    analysisTarget.scope === scope
                      ? 'border-primary/40 bg-primary/8 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className="block font-medium">{analysisScopeLabels[scope]}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {scope === 'production' || scope === 'segments' ? '产出结果' : '选择对象后产出结果'}
                  </span>
                </button>
              ))}
            </div>
            {!isWholeScope && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground">单项目标</p>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  <TargetPicker
                    scope={analysisTarget.scope}
                    value={analysisTarget.entityId ?? null}
                    selectedSegment={selectedSegment}
                    segments={segments}
                    sceneMoments={sceneMoments}
                    creativeReferences={creativeReferences}
                    assetSlots={assetSlots}
                    contentUnits={contentUnits}
                    onChange={(entityId) => onAnalysisTargetChange({ scope: analysisTarget.scope, entityId })}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <CheckCheck size={14} className="text-primary" />
              <p className="text-xs font-semibold text-foreground">目标</p>
            </div>
            <p className="mt-2 text-base font-semibold text-foreground">产出结果</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              所有分析都产出同一组候选：片段、情节、创作资料、素材、内容单元；单项分析中不适用的类别会返回 0 条。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ContextLine icon={GitBranch} label="片段" value={`${outputCounts.segments}`} />
              <ContextLine icon={Route} label="情节" value={`${outputCounts.sceneMoments}`} />
              <ContextLine icon={Sparkles} label="资料" value={`${outputCounts.creativeReferences}`} />
              <ContextLine icon={PackageCheck} label="素材" value={`${outputCounts.assetSlots}`} />
              <ContextLine icon={Film} label="内容单元" value={`${outputCounts.contentUnits}`} />
              <ContextLine icon={Sparkle} label="待审候选" value={`${pendingTotal}`} />
            </div>
          </div>
        </div>

        {/* Input phase */}
        {phase === 'input' && (
          <div className="flex flex-col gap-3 p-4">
            {/* Linked script version card */}
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <Sparkle size={13} className="text-primary" />
                <p className="text-xs font-semibold text-foreground">重新生成候选</p>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                可在任意阶段重新整理剧本，生成的新候选会进入待审状态；已采纳的片段、资料、情节、素材和内容单元不会被覆盖。
              </p>
            </div>

            {loadingScript && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                读取关联剧本…
              </div>
            )}

            {linkedVersion && !manualMode && (
              <div className="rounded-lg border border-border bg-background p-3">
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
                  placeholder="粘贴剧本内容，向导会先拆片段，再补创作资料、情节、素材和内容单元。"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        {/* Running / done / error */}
        {phase !== 'input' && (
          <div className="flex flex-col gap-3 p-4">
            {receivedData && (
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">输入剧本</span>
                  <span className="text-[10px] text-muted-foreground">{receivedData.message.length} 字符</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground">
                  {receivedData.message.slice(0, 160)}{receivedData.message.length > 160 ? '…' : ''}
                </p>
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
                    <ScrollText size={11} />
                    向导输入明细
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
                <span className="text-[10px] font-medium text-muted-foreground">结构化处理进度</span>
                <div className="rounded-lg border border-border">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-[11px] font-medium text-foreground">候选生成</span>
                    <AgentRunStatusBadge status={agentRun.status} />
                  </div>
                  <div className="divide-y divide-border">
                    {agentRun.steps.length === 0 && phase === 'running' && (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-muted-foreground">
                        <Loader2 size={11} className="animate-spin" />
                        正在整理阶段候选…
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
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">阶段候选已生成，按五步加载到编排列表。</p>
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
                    原始回复未直接作为结构化结果使用，页面已完成可采纳候选整理。
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
            {phase === 'input' && `${effectiveText.length} 字符`}
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
                再生成一轮
              </Button>
            )}
            {phase === 'input' && (
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!effectiveText.trim() || loadingScript}
                onClick={() => startAnalysis(effectiveText)}
              >
                <Sparkles size={12} />
                生成阶段候选
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}


const ORCHESTRATE_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'production-orchestrate-analyzer',
  version: '2.0.0',
  name: '制作编排分析',
  description: '递归分析剧本，提取五类制作编排候选，去重并建立完整关系图',
  soul: `你是专业制作编排分析助手，负责对剧本进行递归、全面的制作编排分析。

## 分析流程（必须严格按顺序执行）

### Step 1：读取现有上下文
调用 movscript.read_production_context，获取当前制作已有的片段、情节、创作资料（项目级）、素材（项目级）、内容单元，以及关联剧本文本。这是去重的基础，不可跳过。

### Step 2：片段拆分（剧集级）
把剧本按叙事节奏拆分为片段。片段不是简单的段落分割，而是基于：
- 情绪弧线的起伏（铺垫→冲突→高潮→收尾）
- 时间/空间的跳跃
- 叙事视角的切换
- 节奏的明显变化（快节奏动作段 vs 慢节奏情感段）
每个片段必须有 order、title、summary、source_range（字符偏移范围）。

### Step 3：情节分析（递归，每个片段都要分析）
对每个片段，分析其内部的情节（scene_moments）：
- 每个情节必须带 segment_id（指向所属片段的 client_id）
- 记录 time_text、location_text、action_text、mood
- 情节是片段内的最小叙事单元，一个片段通常有 2-6 个情节

### Step 4：创作资料分析（项目级，必须去重）
扫描全文提取所有创作资料（人物/地点/道具/产品/品牌/风格/世界规则）：
- 创作资料是项目级的，不属于某个制作，所有制作共享
- 必须与已有 creative_references 对比：名称相同或高度相似的不要重复创建
- 建立关系：每个资料关联到用到它的 segment_ids、scene_moment_ids、content_unit_ids

### Step 5：素材需求分析（项目级，必须去重）
基于创作资料和情节，推断需要哪些素材（asset_slots）：
- 素材也是项目级的，必须与已有 asset_slots 对比去重
- 每个素材必须有 owner_type（segment/scene_moment/content_unit）和对应的 owner client_id
- 关联 creative_reference_id（如果该素材是为某个资料准备的）

### Step 6：内容单元分析（递归，每个情节都要分析）
对每个情节，分析其内部的内容单元（content_units）：
- 每个内容单元必须带 segment_id 和 scene_moment_id
- 记录 type（shot/visual_segment/product_showcase/caption_card/narration/transition/music_beat）
- 记录 shot_size（特写/近景/中景/全景/远景）和 camera_angle
- 关联 creative_reference_ids 和 asset_slot_ids

### Step 7：冲突检查
调用 movscript.check_entity_conflicts，传入所有候选，获取每个候选的 conflict_status。

### Step 8：写入候选
调用 movscript.propose_production_entities，传入带 conflict_status 的完整候选列表和关系图。

## 关系完整性要求
- scene_moment.segment_id → 必须指向有效的 segment client_id
- content_unit.segment_id + content_unit.scene_moment_id → 必须指向有效的 client_id
- asset_slot.owner_type + asset_slot.owner_id → 必须指向有效的 client_id
- creative_reference 的 segment_ids/scene_moment_ids/content_unit_ids → 必须指向有效的 client_id

## 去重规则
- 名称完全相同：标记为 conflict_status: “duplicate”，附上已有实体 ID
- 名称高度相似（包含关系或词汇重叠 ≥70%）：同上
- 创作资料和素材是项目级的，去重范围是整个项目，不限于当前制作
- 片段和情节是制作级的，去重范围是当前制作

## 分析深度要求
- 必须尽可能全面，不要因为”差不多”就省略
- 每个片段至少分析出 2 个情节
- 每个情节至少分析出 1 个内容单元
- 创作资料要覆盖所有出现的人物、地点、关键道具/产品`,
  permissions: ['project.read', 'draft.read', 'draft.write'],
  tools: [
    { name: 'movscript.read_production_context', mode: 'allow', approval: 'never' },
    { name: 'movscript.check_entity_conflicts', mode: 'allow', approval: 'never' },
    { name: 'movscript.propose_production_entities', mode: 'allow', approval: 'never' },
    { name: 'movscript.read_project_structure', mode: 'allow', approval: 'never' },
    { name: 'movscript.search_entities', mode: 'allow', approval: 'never' },
    { name: 'movscript.read_entity', mode: 'allow', approval: 'never' },
    { name: 'movscript.list_drafts', mode: 'allow', approval: 'never' },
  ],
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
    tool_call: '工具调用', message: '消息',
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
  return list.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').length
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter(isPositiveNumber)))
}

function createDefaultsForType(type: EntityFilter, productionId: number, segmentId?: number, sceneMomentId?: number): Record<string, string | number | boolean | null> {
  if (type === 'assetSlots') return { status: 'missing', production_id: productionId || 0, owner_type: segmentId ? 'segment' : '', owner_id: segmentId ?? null }
  if (type === 'contentUnits') return { status: 'draft', production_id: productionId || 0, segment_id: segmentId ?? null, scene_moment_id: sceneMomentId ?? null }
  if (type === 'segments') return { status: 'draft', kind: 'section', production_id: productionId || 0 }
  if (type === 'sceneMoments') return { status: 'draft', segment_id: segmentId ?? null }
  if (type === 'creativeReferences') return { status: 'draft', importance: 'main' }
  return {}
}

function buildOrchestrationLookup(input: {
  scriptText: string
  scriptVersionTitle: string
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  creativeReferenceUsages: SemanticEntityRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
}): OrchestrationLookup {
  const usagesByOwnerKey = new Map<string, SemanticEntityRecord[]>()
  const usagesByReferenceId = new Map<number, SemanticEntityRecord[]>()
  const assetSlotsByOwnerKey = new Map<string, AssetSlotRecord[]>()
  const assetSlotsByReferenceId = new Map<number, AssetSlotRecord[]>()

  for (const usage of input.creativeReferenceUsages) {
    if (usage.owner_type && usage.owner_id) {
      const key = ownerKey(String(usage.owner_type), Number(usage.owner_id))
      pushGroupedRecord(usagesByOwnerKey, key, usage)
    }
    if (usage.creative_reference_id) {
      pushGroupedRecord(usagesByReferenceId, Number(usage.creative_reference_id), usage)
    }
  }

  for (const slot of input.assetSlots) {
    if (slot.owner_type && slot.owner_id) {
      pushGroupedRecord(assetSlotsByOwnerKey, ownerKey(String(slot.owner_type), Number(slot.owner_id)), slot)
    }
    if (slot.creative_reference_id) {
      pushGroupedRecord(assetSlotsByReferenceId, Number(slot.creative_reference_id), slot)
    }
  }

  return {
    scriptText: input.scriptText,
    scriptVersionTitle: input.scriptVersionTitle,
    segmentById: new Map(input.segments.map((item) => [item.ID, item])),
    sceneMomentById: new Map(input.sceneMoments.map((item) => [item.ID, item])),
    contentUnitById: new Map(input.contentUnits.map((item) => [item.ID, item])),
    creativeReferenceById: new Map(input.creativeReferences.map((item) => [item.ID, item])),
    usagesByOwnerKey,
    usagesByReferenceId,
    assetSlotsByOwnerKey,
    assetSlotsByReferenceId,
  }
}

function pushGroupedRecord<T>(map: Map<string | number, T[]>, key: string | number, value: T) {
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}

function ownerKey(ownerType: string, ownerId: number) {
  return `${ownerType}:${ownerId}`
}

function titleOfRecord(record: SemanticEntityRecord | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}

function formatOwnerLabel(ownerType?: string, ownerId?: number, lookup?: OrchestrationLookup) {
  if (!ownerType || !ownerId || !lookup) return ''
  const key = ownerKey(ownerType, ownerId)
  if (ownerType === 'segment') return lookup.segmentById.get(ownerId) ? `片段 · ${titleOfRecord(lookup.segmentById.get(ownerId))}` : `片段 #${ownerId}`
  if (ownerType === 'scene_moment') return lookup.sceneMomentById.get(ownerId) ? `情节 · ${titleOfRecord(lookup.sceneMomentById.get(ownerId))}` : `情节 #${ownerId}`
  if (ownerType === 'content_unit') return lookup.contentUnitById.get(ownerId) ? `内容单元 · ${titleOfRecord(lookup.contentUnitById.get(ownerId))}` : `内容单元 #${ownerId}`
  if (ownerType === 'creative_reference') return lookup.creativeReferenceById.get(ownerId) ? `资料 · ${titleOfRecord(lookup.creativeReferenceById.get(ownerId))}` : `资料 #${ownerId}`
  return `${ownerType} #${ownerId}`
}

function formatAssetSlotLabel(slot: AssetSlotRecord, lookup: OrchestrationLookup) {
  const title = titleOfRecord(slot)
  const owner = formatOwnerLabel(String(slot.owner_type ?? ''), Number(slot.owner_id ?? 0), lookup)
  return owner ? `${title} · ${owner}` : title
}

function contentUnitAppearances(unit: ContentUnitRecord, lookup: OrchestrationLookup) {
  const items: string[] = []
  const segment = unit.segment_id ? lookup.segmentById.get(Number(unit.segment_id)) : null
  const moment = unit.scene_moment_id ? lookup.sceneMomentById.get(Number(unit.scene_moment_id)) : null
  if (segment) items.push(`片段 · ${titleOfRecord(segment)}`)
  if (moment) items.push(`情节 · ${titleOfRecord(moment)}`)
  return items
}

function contentUnitReferences(unit: ContentUnitRecord, lookup: OrchestrationLookup) {
  const refs = lookup.usagesByOwnerKey.get(ownerKey('content_unit', unit.ID)) ?? []
  return refs.map((usage) => {
    const reference = usage.creative_reference_id ? lookup.creativeReferenceById.get(Number(usage.creative_reference_id)) : null
    const ownerLabel = reference ? `资料 · ${titleOfRecord(reference)}` : `资料 #${usage.creative_reference_id ?? ''}`
    return usage.role ? `${ownerLabel} · ${String(usage.role)}` : ownerLabel
  })
}

function contentUnitAssetSlots(unit: ContentUnitRecord, lookup: OrchestrationLookup) {
  return (lookup.assetSlotsByOwnerKey.get(ownerKey('content_unit', unit.ID)) ?? []).map((slot) => formatAssetSlotLabel(slot, lookup))
}

function assetSlotAppearances(slot: AssetSlotRecord, lookup: OrchestrationLookup) {
  const items: string[] = []
  if (slot.owner_type && slot.owner_id) {
    const owner = formatOwnerLabel(String(slot.owner_type), Number(slot.owner_id), lookup)
    if (owner) items.push(owner)
  }
  if (slot.creative_reference_id) {
    const reference = lookup.creativeReferenceById.get(Number(slot.creative_reference_id))
    if (reference) items.push(`资料 · ${titleOfRecord(reference)}`)
  }
  return items
}

function RelationBlock({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="px-2 pb-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function renderScriptExcerpt(scriptText: string, sourceRange: string, segment: SegmentRecord) {
  const [startRaw, endRaw] = sourceRange.split('-')
  const start = Number(startRaw)
  const end = Number(endRaw)
  const excerpt = Number.isFinite(start) && Number.isFinite(end)
    ? scriptText.slice(Math.max(0, start), Math.max(Math.max(0, start), end))
    : ''
  if (!excerpt.trim()) return null
  return (
    <div className="px-2 pb-2">
      <p className="text-[10px] text-muted-foreground">剧本正文</p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{excerpt.trim()}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">来源：{segment.source_range}</p>
    </div>
  )
}

function getAnalysisText(target: AnalysisTarget, input: {
  manualText: string
  linkedVersion: ScriptVersion | null
  selectedSegment: SegmentRecord | null
  production?: SemanticEntityRecord & { script_version_id?: number; name?: string }
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
}) {
  const baseText = input.manualText.trim() || (input.linkedVersion?.content || input.linkedVersion?.raw_source || '').trim()
  if (target.scope === 'production') return baseText

  if (target.scope === 'segments') {
    return baseText
  }

  if (target.scope === 'segmentAnalysis') {
    const segment = input.segments.find((item) => item.ID === target.entityId) ?? input.selectedSegment
    if (!segment) return baseText
    const moments = input.sceneMoments.filter((moment) => moment.segment_id === segment.ID)
    const units = input.contentUnits.filter((unit) => unit.segment_id === segment.ID)
    const refs = collectReferencesFromUnitsAndMoments(input.creativeReferences, input.assetSlots, moments, units)
    const slots = collectAssetSlotsFromSegment(input.assetSlots, segment.ID, moments, units)
    return [
      `片段：${titleOfRecord(segment)}`,
      segment.summary ? `摘要：${segment.summary}` : '',
      segment.content ? `剧本正文：\n${segment.content}` : '',
      moments.length > 0 ? `情节：\n${moments.map(serializeSceneMoment).join('\n\n')}` : '',
      units.length > 0 ? `内容单元：\n${units.map(serializeContentUnit).join('\n\n')}` : '',
      refs.length > 0 ? `相关资料：\n${refs.map(serializeCreativeReference).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  if (target.scope === 'sceneMoments') {
    const moment = input.sceneMoments.find((item) => item.ID === target.entityId) ?? null
    if (!moment) return baseText
    const segmentRecord = input.segments.find((item) => item.ID === moment.segment_id) ?? null
    const units = input.contentUnits.filter((unit) => unit.scene_moment_id === moment.ID)
    const refs = collectReferencesFromUnitsAndMoments(input.creativeReferences, input.assetSlots, [moment], units)
    const slots = input.assetSlots.filter((slot) => (
      (slot.owner_type === 'scene_moment' && slot.owner_id === moment.ID) ||
      units.some((unit) => slot.owner_type === 'content_unit' && slot.owner_id === unit.ID)
    ))
    return [
      `情节：${titleOfRecord(moment)}`,
      moment.description ? `描述：${moment.description}` : '',
      moment.time_text ? `时间：${moment.time_text}` : '',
      moment.location_text ? `地点：${moment.location_text}` : '',
      moment.action_text ? `动作：${moment.action_text}` : '',
      moment.mood ? `情绪：${moment.mood}` : '',
      segmentRecord ? `所属片段：${titleOfRecord(segmentRecord)}` : '',
      units.length > 0 ? `内容单元：\n${units.map(serializeContentUnit).join('\n\n')}` : '',
      refs.length > 0 ? `相关资料：\n${refs.map(serializeCreativeReference).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  if (target.scope === 'creativeReferences') {
    const reference = input.creativeReferences.find((item) => item.ID === target.entityId) ?? null
    if (!reference) return baseText
    const usageKeys = new Set<string>()
    input.assetSlots
      .filter((slot) => slot.creative_reference_id === reference.ID)
      .forEach((slot) => {
        if (slot.owner_type === 'segment' && slot.owner_id) usageKeys.add(ownerKey('segment', Number(slot.owner_id)))
        if (slot.owner_type === 'scene_moment' && slot.owner_id) usageKeys.add(ownerKey('scene_moment', Number(slot.owner_id)))
        if (slot.owner_type === 'content_unit' && slot.owner_id) usageKeys.add(ownerKey('content_unit', Number(slot.owner_id)))
      })
    const relatedMoments = input.sceneMoments.filter((moment) => usageKeys.has(ownerKey('scene_moment', moment.ID)))
    const relatedUnits = input.contentUnits.filter((unit) => usageKeys.has(ownerKey('content_unit', unit.ID)))
    const slots = input.assetSlots.filter((slot) => slot.creative_reference_id === reference.ID)
    return [
      `创作资料：${titleOfRecord(reference)}`,
      reference.alias ? `别名：${reference.alias}` : '',
      reference.description ? `描述：${reference.description}` : '',
      reference.content ? `资料正文：\n${reference.content}` : '',
      relatedMoments.length > 0 ? `出现情节：${relatedMoments.map((item) => titleOfRecord(item)).join(' / ')}` : '',
      relatedUnits.length > 0 ? `相关内容单元：${relatedUnits.map((item) => titleOfRecord(item)).join(' / ')}` : '',
      slots.length > 0 ? `相关素材：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  if (target.scope === 'assetSlots') {
    const slot = input.assetSlots.find((item) => item.ID === target.entityId) ?? null
    if (!slot) return baseText
    const ownerLabel = formatOwnerLabel(String(slot.owner_type ?? ''), Number(slot.owner_id ?? 0), {
      scriptText: '',
      scriptVersionTitle: '',
      segmentById: new Map(input.segments.map((item) => [item.ID, item])),
      sceneMomentById: new Map(input.sceneMoments.map((item) => [item.ID, item])),
      contentUnitById: new Map(input.contentUnits.map((item) => [item.ID, item])),
      creativeReferenceById: new Map(input.creativeReferences.map((item) => [item.ID, item])),
      usagesByOwnerKey: new Map(),
      usagesByReferenceId: new Map(),
      assetSlotsByOwnerKey: new Map(),
      assetSlotsByReferenceId: new Map(),
    })
    const reference = slot.creative_reference_id ? input.creativeReferences.find((item) => item.ID === slot.creative_reference_id) ?? null : null
    return [
      `素材：${titleOfRecord(slot)}`,
      slot.kind ? `类型：${slot.kind}` : '',
      slot.priority ? `优先级：${slot.priority}` : '',
      slot.description ? `说明：${slot.description}` : '',
      slot.prompt_hint ? `生成提示：${slot.prompt_hint}` : '',
      ownerLabel ? `归属：${ownerLabel}` : '',
      reference ? `关联资料：${titleOfRecord(reference)}` : '',
    ].filter(Boolean).join('\n\n')
  }

  if (target.scope === 'contentUnits') {
    const unit = input.contentUnits.find((item) => item.ID === target.entityId) ?? null
    if (!unit) return baseText
    const segmentRecord = input.segments.find((item) => item.ID === unit.segment_id) ?? null
    const moment = input.sceneMoments.find((item) => item.ID === unit.scene_moment_id) ?? null
    const refs = collectReferencesFromUnitsAndMoments(input.creativeReferences, input.assetSlots, moment ? [moment] : [], [unit])
    const slots = input.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && slot.owner_id === unit.ID)
    return [
      `内容单元：${titleOfRecord(unit)}`,
      unit.kind ? `类型：${unit.kind}` : '',
      unit.description ? `描述：${unit.description}` : '',
      unit.prompt ? `提示：${unit.prompt}` : '',
      unit.shot_size ? `景别：${unit.shot_size}` : '',
      unit.camera_angle ? `机位角度：${unit.camera_angle}` : '',
      unit.camera_motion ? `运镜：${unit.camera_motion}` : '',
      segmentRecord ? `所属片段：${titleOfRecord(segmentRecord)}` : '',
      moment ? `所属情节：${titleOfRecord(moment)}` : '',
      refs.length > 0 ? `相关资料：\n${refs.map(serializeCreativeReference).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  return baseText
}

function collectReferencesFromUnitsAndMoments(
  creativeReferences: CreativeReferenceRecord[],
  assetSlots: AssetSlotRecord[],
  moments: SceneMomentRecord[],
  units: ContentUnitRecord[],
) {
  const referenceIds = new Set<number>()
  const unitIds = new Set(units.map((item) => item.ID))
  const momentIds = new Set(moments.map((item) => item.ID))
  for (const slot of assetSlots) {
    if (slot.creative_reference_id && (
      (slot.owner_type === 'scene_moment' && slot.owner_id && momentIds.has(Number(slot.owner_id))) ||
      (slot.owner_type === 'content_unit' && slot.owner_id && unitIds.has(Number(slot.owner_id))) ||
      (slot.owner_type === 'segment' && slot.owner_id && moments.some((moment) => moment.segment_id === Number(slot.owner_id)))
    )) {
      referenceIds.add(Number(slot.creative_reference_id))
    }
  }
  return creativeReferences.filter((reference) => referenceIds.has(reference.ID))
}

function collectAssetSlotsFromSegment(assetSlots: AssetSlotRecord[], segmentId: number, moments: SceneMomentRecord[], units: ContentUnitRecord[]) {
  const momentIds = new Set(moments.map((item) => item.ID))
  const unitIds = new Set(units.map((item) => item.ID))
  return assetSlots.filter((slot) => (
    (slot.owner_type === 'segment' && slot.owner_id === segmentId) ||
    (slot.owner_type === 'scene_moment' && slot.owner_id && momentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'content_unit' && slot.owner_id && unitIds.has(Number(slot.owner_id)))
  ))
}

function serializeSceneMoment(moment: SceneMomentRecord) {
  return [
    `- ${titleOfRecord(moment)}`,
    moment.time_text ? `时间：${moment.time_text}` : '',
    moment.location_text ? `地点：${moment.location_text}` : '',
    moment.action_text ? `动作：${moment.action_text}` : '',
    moment.description ? `描述：${moment.description}` : '',
  ].filter(Boolean).join('，')
}

function serializeCreativeReference(reference: CreativeReferenceRecord) {
  return [
    `- ${titleOfRecord(reference)}`,
    reference.kind ? `类型：${reference.kind}` : '',
    reference.importance ? `重要性：${reference.importance}` : '',
    reference.description ? `描述：${reference.description}` : '',
    reference.content ? `正文：${reference.content}` : '',
  ].filter(Boolean).join('，')
}

function serializeAssetSlot(slot: AssetSlotRecord) {
  return [
    `- ${titleOfRecord(slot)}`,
    slot.kind ? `类型：${slot.kind}` : '',
    slot.priority ? `优先级：${slot.priority}` : '',
    slot.description ? `说明：${slot.description}` : '',
    slot.prompt_hint ? `提示：${slot.prompt_hint}` : '',
  ].filter(Boolean).join('，')
}

function serializeContentUnit(unit: ContentUnitRecord) {
  return [
    `- ${titleOfRecord(unit)}`,
    unit.kind ? `类型：${unit.kind}` : '',
    unit.description ? `描述：${unit.description}` : '',
    unit.prompt ? `提示：${unit.prompt}` : '',
    unit.shot_size ? `景别：${unit.shot_size}` : '',
    unit.camera_angle ? `机位：${unit.camera_angle}` : '',
  ].filter(Boolean).join('，')
}

function TargetPicker({
  scope,
  value,
  selectedSegment,
  segments,
  sceneMoments,
  creativeReferences,
  assetSlots,
  contentUnits,
  onChange,
}: {
  scope: AnalysisScope
  value: number | null
  selectedSegment: SegmentRecord | null
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  onChange: (value: number | null) => void
}) {
  const selectClass = 'h-8 text-xs'
  if (scope === 'segments' || scope === 'segmentAnalysis') {
    return (
      <Select value={value ? String(value) : ''} onValueChange={(next) => onChange(next ? Number(next) : null)}>
        <SelectTrigger className={selectClass}><SelectValue placeholder="选择片段" /></SelectTrigger>
        <SelectContent>
          {segments.map((segment) => <SelectItem key={segment.ID} value={String(segment.ID)}>{titleOfRecord(segment)}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  if (scope === 'sceneMoments') {
    const options = selectedSegment ? sceneMoments.filter((moment) => moment.segment_id === selectedSegment.ID) : sceneMoments
    return (
      <Select value={value ? String(value) : ''} onValueChange={(next) => onChange(next ? Number(next) : null)}>
        <SelectTrigger className={selectClass}><SelectValue placeholder="选择情节" /></SelectTrigger>
        <SelectContent>
          {options.map((moment) => <SelectItem key={moment.ID} value={String(moment.ID)}>{titleOfRecord(moment)}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  if (scope === 'creativeReferences') {
    return (
      <Select value={value ? String(value) : ''} onValueChange={(next) => onChange(next ? Number(next) : null)}>
        <SelectTrigger className={selectClass}><SelectValue placeholder="选择资料" /></SelectTrigger>
        <SelectContent>
          {creativeReferences.map((reference) => <SelectItem key={reference.ID} value={String(reference.ID)}>{titleOfRecord(reference)}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  if (scope === 'assetSlots') {
    return (
      <Select value={value ? String(value) : ''} onValueChange={(next) => onChange(next ? Number(next) : null)}>
        <SelectTrigger className={selectClass}><SelectValue placeholder="选择素材" /></SelectTrigger>
        <SelectContent>
          {assetSlots.map((slot) => <SelectItem key={slot.ID} value={String(slot.ID)}>{titleOfRecord(slot)}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  return (
    <Select value={value ? String(value) : ''} onValueChange={(next) => onChange(next ? Number(next) : null)}>
      <SelectTrigger className={selectClass}><SelectValue placeholder="选择内容单元" /></SelectTrigger>
      <SelectContent>
        {contentUnits.map((unit) => <SelectItem key={unit.ID} value={String(unit.ID)}>{titleOfRecord(unit)}</SelectItem>)}
      </SelectContent>
    </Select>
  )
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

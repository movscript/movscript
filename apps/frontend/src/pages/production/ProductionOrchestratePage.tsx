import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Film,
  GitBranch,
  ImageIcon,
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
  LayoutList,
  AlertCircle,
  CheckCircle2,
  ChevronUp,
  Layers3,
  Target,
  Eye,
} from 'lucide-react'

import {
  applyProductionProposal,
  createSemanticEntity,
  deleteSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import { cn } from '@/lib/utils'
import { buildCommandFirstClientInput, buildPageKey } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import {
  buildEmptyProjectProposalDraftContent,
  buildProjectProposalDraftContractPrompt,
} from '@/lib/projectProposalDraft'
import { localAgentClient, type AgentDraft, type AgentManifest, type AgentRun, type AgentRunStep } from '@/lib/localAgentClient'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@movscript/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EntityFilter = 'all' | 'segments' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'
type AnalysisScope = 'production' | 'segments' | 'segmentAnalysis' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'
type ProposalReviewTab = 'structure' | 'context' | 'impact'
type RailItem = {
  id: number
  title: string
  detail: string
  meta: string[]
  status: string
}

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

// Tree-form proposal types used by the production_proposal draft.
interface ProposalContentUnitNode {
  action: 'create' | 'reuse' | 'update'
  id?: number
  client_id?: string
  title?: string
  kind?: string
  description?: string
  shot_size?: string
  camera_angle?: string
  duration_sec?: number
  order?: number
  status?: string
  before?: Record<string, unknown>
  keyframes?: ProposalKeyframeNode[]
}
interface ProposalKeyframeNode {
  action: 'create' | 'reuse' | 'update'
  id?: number
  client_id?: string
  title?: string
  description?: string
  prompt?: string
  order?: number
  status?: string
  before?: Record<string, unknown>
}
interface ProposalCreativeRefNode {
  action: 'create' | 'reuse' | 'update'
  id?: number
  client_id?: string
  name?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
}
interface ProposalAssetSlotNode {
  action: 'create' | 'reuse' | 'update'
  id?: number
  client_id?: string
  name?: string
  kind?: string
  description?: string
  priority?: string
  source_label?: string
}
interface ProposalSceneMomentNode {
  action: 'create' | 'reuse' | 'update'
  id?: number
  client_id?: string
  title?: string
  time_text?: string
  location_text?: string
  action_text?: string
  mood?: string
  description?: string
  order?: number
  status?: string
  content_units?: ProposalContentUnitNode[]
  creative_references?: ProposalCreativeRefNode[]
  asset_slots?: ProposalAssetSlotNode[]
  keyframes?: ProposalKeyframeNode[]
  rationale?: string
  before?: Record<string, unknown>
}
interface ProposalSegmentNode {
  action: 'create' | 'reuse' | 'update'
  id?: number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  status?: string
  scene_moments?: ProposalSceneMomentNode[]
  rationale?: string
  before?: Record<string, unknown>
}
interface ProposalDraftContent {
  productionId: number
  analysisScope?: string
  summary?: string
  proposal: { segments: ProposalSegmentNode[] }
  proposedAt?: string
  draftId?: string
  draftTitle?: string
  draftUpdatedAt?: string
}

interface ProposalSimulationResult {
  acceptedNodes: number
  rejectedNodes: number
  unresolvedNodes: number
  counts: {
    segments_created: number
    scene_moments_created: number
    content_units_created: number
    asset_slots_created: number
    keyframes_created: number
    creative_references_created: number
    creative_reference_usages: number
  }
  actions: { create: number; reuse: number; update: number }
}

interface ProposalConflictEntities {
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
}

interface ProposalReplacementPreview {
  proposal: { segments: ProposalSegmentNode[] }
  replaced: {
    segments: number
    sceneMoments: number
    creativeReferences: number
    assetSlots: number
    contentUnits: number
  }
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
type ProposalNodeDecision = 'accepted' | 'rejected'
type ProposalNodeDecisions = Record<string, ProposalNodeDecision>

interface AnalysisTarget {
  scope: AnalysisScope
  entityId?: number | null
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

interface OverviewMetric {
  icon: LucideIcon
  label: string
  value: number | string
  tone?: 'muted' | 'ok' | 'warn'
}

interface ContextOverview {
  position: string[]
  sourceLabel: string
  source: string[]
  relations: string[]
  nextStep: string[]
  primaryActionLabel: string
  primaryActionIcon: LucideIcon
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const filterDefs: { key: EntityFilter; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: '全局结构', icon: LayoutList },
  { key: 'segments', label: '编排段结构', icon: GitBranch },
  { key: 'sceneMoments', label: '情景结构', icon: Route },
  { key: 'creativeReferences', label: '设定资料梳理', icon: Sparkles },
  { key: 'assetSlots', label: '素材需求缺口', icon: PackageCheck },
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
  draft: '草稿', candidate: '候选', missing: '缺素材需求', ignored: '已忽略',
  rejected: '已拒绝', blocked: '阻塞', in_production: '生产中',
  low: '低', normal: '普通', high: '高', critical: '紧急',
}

const segmentKindLabel: Record<string, string> = {
  emotional_function: '情绪功能',
  rhythm_shift: '节奏变化',
  dramatic_function: '戏剧功能',
  setup: '铺垫',
  escalation: '升级',
  release: '释放',
  reversal: '反转',
  transition: '转场',
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
  const openedDraftId = searchParams.get('draftId')?.trim() || ''

  const [filter, setFilter] = useState<EntityFilter>('all')
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [createType, setCreateType] = useState<EntityFilter | null>(null)
  const [editEntry, setEditEntry] = useState<{ type: EntityFilter; record: SemanticEntityRecord } | null>(null)
  const [candidates, setCandidates] = useState<TrackedCandidates | null>(null)
  const [orchestrationPrompt, setOrchestrationPrompt] = useState('')
  const [proposalPreviewDraft, setProposalPreviewDraft] = useState<ProposalDraftContent | null>(null)
  const [proposalNodeDecisions, setProposalNodeDecisions] = useState<ProposalNodeDecisions>({})
  const [analysisLaunchToken, setAnalysisLaunchToken] = useState(0)
  const [projectProposalLaunching, setProjectProposalLaunching] = useState(false)

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
  useEffect(() => {
    if (!openedDraftId) {
      setProposalPreviewDraft(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const draft = await localAgentClient.getDraft(openedDraftId)
        if (cancelled || draft.kind !== 'production_proposal') return
        const content = attachProposalDraftMeta(JSON.parse(draft.content) as ProposalDraftContent, draft)
        if (!content || typeof content !== 'object' || !content.proposal) return
        if (Number.isFinite(content.productionId) && content.productionId > 0 && content.productionId !== productionId) {
          setSearchParams((current) => {
            const next = new URLSearchParams(current)
            next.set('productionId', String(content.productionId))
            next.set('draftId', draft.id)
            return next
          }, { replace: true })
          return
        }
        setProposalPreviewDraft(content)
      } catch {
        if (!cancelled) {
          setProposalPreviewDraft(null)
          setSearchParams((current) => {
            const next = new URLSearchParams(current)
            if (next.get('draftId') === openedDraftId) next.delete('draftId')
            return next
          }, { replace: true })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openedDraftId, productionId, setSearchParams])

  useEffect(() => {
    if (proposalPreviewDraft) {
      setProposalNodeDecisions({})
    }
  }, [proposalPreviewDraft])
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
  const selectedSegment = filter === 'segments' || filter === 'all' ? allSegments.find((segment) => segment.ID === selectedEntityId) ?? null : null
  const selectedSceneMoment = filter === 'sceneMoments' ? allSceneMoments.find((moment) => moment.ID === selectedEntityId) ?? null : null
  const selectedCreativeReference = filter === 'creativeReferences' ? allCreativeReferences.find((reference) => reference.ID === selectedEntityId) ?? null : null
  const selectedAssetSlot = filter === 'assetSlots' ? allAssetSlots.find((slot) => slot.ID === selectedEntityId) ?? null : null
  const selectedContentUnit = filter === 'contentUnits' ? allContentUnits.find((unit) => unit.ID === selectedEntityId) ?? null : null
  const selectedRecord = selectedSegment ?? selectedSceneMoment ?? selectedCreativeReference ?? selectedAssetSlot ?? selectedContentUnit

  function handleFilterChange(nextFilter: EntityFilter) {
    setFilter(nextFilter)
    setSelectedEntityId(null)
  }

  function getSelectedRecordLabel() {
    if (filter === 'segments') return selectedSegment ? titleOfRecord(selectedSegment) : '未选择编排段'
    if (filter === 'sceneMoments') return selectedSceneMoment ? titleOfRecord(selectedSceneMoment) : '未选择情景'
    if (filter === 'creativeReferences') return selectedCreativeReference ? titleOfRecord(selectedCreativeReference) : '未选择设定资料'
    if (filter === 'assetSlots') return selectedAssetSlot ? titleOfRecord(selectedAssetSlot) : '未选择素材需求'
    if (filter === 'contentUnits') return selectedContentUnit ? titleOfRecord(selectedContentUnit) : '未选择制作项'
    return filter === 'all' ? '未选择对象，正在查看全制作' : '未选择对象，正在查看分类总览'
  }

  function getSelectedRecordSummary() {
    if (!selectedRecord) {
      if (filter === 'all') return '展示编排段、情景、设定资料、素材需求和制作项的整体覆盖。'
      return '点选左侧条目后，这里会切换为当前对象的上下文总览。'
    }
    if (filter === 'segments') return String(selectedSegment?.summary ?? selectedSegment?.content ?? '暂无摘要')
    if (filter === 'sceneMoments') {
      return [
        selectedSceneMoment?.time_text ? `时间：${selectedSceneMoment.time_text}` : '',
        selectedSceneMoment?.location_text ? `地点：${selectedSceneMoment.location_text}` : '',
        selectedSceneMoment?.action_text ? selectedSceneMoment.action_text : '',
      ].filter(Boolean).join(' · ') || '暂无说明'
    }
    if (filter === 'creativeReferences') return String(selectedCreativeReference?.description ?? '暂无说明')
    if (filter === 'assetSlots') return String(selectedAssetSlot?.description ?? '暂无说明')
    if (filter === 'contentUnits') {
      return [
        selectedContentUnit?.shot_size ? `景别：${selectedContentUnit.shot_size}` : '',
        selectedContentUnit?.camera_angle ? `机位：${selectedContentUnit.camera_angle}` : '',
        selectedContentUnit?.camera_motion ? `运镜：${selectedContentUnit.camera_motion}` : '',
        selectedContentUnit?.description ? selectedContentUnit.description : '',
      ].filter(Boolean).join(' · ') || '暂无说明'
    }
    return '暂无说明'
  }

  const railItems = useMemo(() => {
    if (filter === 'all') {
      return allSegments.map((segment) => {
        const childMoments = allSceneMoments.filter((moment) => moment.segment_id === segment.ID)
        const childUnits = allContentUnits.filter((unit) => unit.segment_id === segment.ID)
        return {
          id: segment.ID,
          title: titleOfRecord(segment),
          detail: String(segment.summary ?? segment.content ?? '暂无摘要'),
          meta: [`${childMoments.length} 情景`, `${childUnits.length} 单元`],
          status: String(segment.status ?? ''),
        }
      })
    }
    if (filter === 'segments') {
      return allSegments.map((segment) => {
        const childMoments = allSceneMoments.filter((moment) => moment.segment_id === segment.ID)
        const childUnits = allContentUnits.filter((unit) => unit.segment_id === segment.ID)
        return {
          id: segment.ID,
          title: titleOfRecord(segment),
          detail: String(segment.summary ?? segment.content ?? '暂无摘要'),
          meta: [`${childMoments.length} 情景`, `${childUnits.length} 单元`],
          status: String(segment.status ?? ''),
        }
      })
    }
    if (filter === 'sceneMoments') {
      return allSceneMoments.map((moment) => ({
        id: moment.ID,
        title: titleOfRecord(moment),
        detail: [moment.time_text, moment.location_text, moment.action_text].filter(Boolean).join(' · ') || '暂无说明',
        meta: [moment.segment_id ? `编排段 #${moment.segment_id}` : ''],
        status: String(moment.status ?? ''),
      }))
    }
    if (filter === 'creativeReferences') {
      return allCreativeReferences.map((reference) => ({
        id: reference.ID,
        title: titleOfRecord(reference),
        detail: String(reference.description ?? '暂无说明'),
        meta: [reference.kind ? creativeReferenceKindLabel[String(reference.kind)] ?? String(reference.kind) : '', reference.importance ? String(reference.importance) : ''].filter(Boolean),
        status: String(reference.status ?? ''),
      }))
    }
    if (filter === 'assetSlots') {
      return allAssetSlots.map((slot) => ({
        id: slot.ID,
        title: titleOfRecord(slot),
        detail: String(slot.description ?? '暂无说明'),
        meta: [slot.kind ? String(slot.kind) : '', slot.priority ? String(slot.priority) : ''].filter(Boolean),
        status: String(slot.status ?? ''),
      }))
    }
    return allContentUnits.map((unit) => ({
      id: unit.ID,
      title: titleOfRecord(unit),
      detail: String(unit.description ?? unit.prompt ?? '暂无说明'),
      meta: [
        unit.shot_size ? String(unit.shot_size) : '',
        unit.camera_angle ? String(unit.camera_angle) : '',
        unit.duration_sec ? `${unit.duration_sec}s` : '',
      ].filter(Boolean),
      status: String(unit.status ?? ''),
    }))
  }, [allAssetSlots, allContentUnits, allCreativeReferences, allSceneMoments, allSegments, filter])

  useEffect(() => {
    const exists = filter === 'segments'
      ? allSegments.some((item) => item.ID === selectedEntityId)
      : filter === 'sceneMoments'
        ? allSceneMoments.some((item) => item.ID === selectedEntityId)
        : filter === 'creativeReferences'
          ? allCreativeReferences.some((item) => item.ID === selectedEntityId)
          : filter === 'assetSlots'
            ? allAssetSlots.some((item) => item.ID === selectedEntityId)
            : filter === 'contentUnits'
              ? allContentUnits.some((item) => item.ID === selectedEntityId)
              : selectedEntityId == null || allSegments.some((item) => item.ID === selectedEntityId)
    if (!exists) setSelectedEntityId(null)
  }, [allAssetSlots, allContentUnits, allCreativeReferences, allSceneMoments, allSegments, filter, selectedEntityId])

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
  const contextOverview = buildContextOverview(filter, selectedRecord, {
    productionName: selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : '未选择制作',
    scriptVersionTitle: selectedScriptVersion?.title ?? lookup.scriptVersionTitle,
    scriptText: lookup.scriptText,
    segments: allSegments,
    sceneMoments: allSceneMoments,
    creativeReferences: allCreativeReferences,
    assetSlots: allAssetSlots,
    contentUnits: allContentUnits,
    lookup,
    pendingCount: pendingCandidateCount,
  })
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

  function requestOrchestrationAnalysis(target: AnalysisTarget) {
    setOrchestrationPrompt((prev) => {
      const prefix = target.entityId
        ? `请重点检查当前选中的结构对象 #${target.entityId}，补齐 AI 可能遗漏的编排段、情景、设定资料、素材需求或制作项。`
        : '请重新检查当前制作结构，补齐 AI 可能遗漏的内容。'
      return prev.trim() ? prev : prefix
    })
    setAnalysisLaunchToken((current) => current + 1)
  }

  function handleAnalyzeTarget(target: AnalysisTarget) {
    requestOrchestrationAnalysis(target)
  }

  function handleContextPrimaryAction() {
    if (selectedRecord) {
      const scope: AnalysisScope = filter === 'segments'
        ? 'segmentAnalysis'
        : filter === 'sceneMoments'
          ? 'sceneMoments'
          : filter === 'creativeReferences'
            ? 'creativeReferences'
            : filter === 'assetSlots'
              ? 'assetSlots'
            : filter === 'contentUnits'
              ? 'contentUnits'
              : 'production'
      requestOrchestrationAnalysis({ scope, entityId: selectedRecord.ID })
      return
    }
    if (filter === 'all') {
      requestOrchestrationAnalysis({ scope: 'production' })
      return
    }
    if (filter === 'segments') {
      requestOrchestrationAnalysis({ scope: 'segments' })
      return
    }
    setCreateType(filter)
  }

  async function startProjectProposalAnalysis() {
    if (!projectId || !productionId) return
    setProjectProposalLaunching(true)
    try {
      const pageKey = buildPageKey({
        route: { pathname: '/project-workspace' },
        projectId,
        selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
        labels: ['project-workspace', 'project-proposal'],
      })
      const existingDrafts = await localAgentClient.listDrafts({ projectId, kind: 'project_proposal', status: 'draft', pageKey, limit: 1 })
      const draftShell = existingDrafts.drafts[0] ?? await localAgentClient.createDraft({
        projectId,
        kind: 'project_proposal',
        title: `项目提案草稿 - ${project?.name ?? `#${projectId}`}`,
        content: JSON.stringify(buildEmptyProjectProposalDraftContent({
          projectId,
          productionId,
          createdAt: new Date().toISOString(),
        }), null, 2),
        source: {
          entityType: 'project',
          entityId: projectId,
          projectId,
          productionId,
          pageKey,
          pageType: 'project_proposal',
          pageRoute: '/project-workspace',
        },
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'proposal',
        },
        metadata: {
          pageOwned: true,
          analysisScope: 'project_proposal',
          projectId,
          productionId,
        },
      })

      const prompt = buildProjectProposalAnalysisPrompt({
        projectName: project?.name ?? `项目 #${projectId}`,
        productionName: selectedProduction ? String(selectedProduction.name ?? `制作 #${productionId}`) : `制作 #${productionId}`,
        productionId,
        draftId: draftShell.id,
        scriptVersionTitle: selectedScriptVersion?.title ?? '',
        scriptText,
        projectSnapshot: {
          references: allCreativeReferences,
          assetSlots: allAssetSlots,
          productions,
        },
        userPrompt: orchestrationPrompt,
      })

      openAgentPanelDraft({
        requestId: `project_proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        taskType: 'project_orchestration',
        message: `请生成项目提案：${project?.name ?? `#${projectId}`}`,
        title: `项目提案: ${project?.name ?? `#${projectId}`}`,
        mode: 'create',
        newConversation: true,
        autoSend: true,
        projectId,
        clientInput: buildCommandFirstClientInput({
          message: prompt,
          labels: ['project-workspace', 'project-orchestration', 'project-proposal', 'tool-driven'],
          hints: {
            projectId,
            productionId,
            draftId: draftShell.id,
            route: { pathname: '/project-workspace' },
            selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
          },
        }),
        agentManifest: PROJECT_PROPOSAL_AGENT_MANIFEST,
        runPolicy: { maxToolCalls: 36, maxIterations: 20 },
        timeoutMs: 240_000,
        renderMode: 'page',
      })

      toast.info('已打开项目提案会话；生成结果会写入项目提案草稿')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目提案启动失败')
    } finally {
      setProjectProposalLaunching(false)
    }
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
      kind: 'emotional_function',
      status: 'draft',
      order: data.order,
    }
    const saved = overwriteId
      ? await updateSemanticEntity(projectId!, semanticEntityConfig('segments'), overwriteId, payload)
      : await createSemanticEntity(projectId!, semanticEntityConfig('segments'), payload)
    handleAcceptCandidate('segments', data.client_id)
    toast.success(overwriteId ? `编排段「${saved.title}」已覆盖更新` : `编排段「${saved.title}」已创建`)
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
    toast.success(overwriteId ? `情景「${saved.title}」已覆盖更新` : `情景「${saved.title}」已创建`)
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
    toast.success(overwriteId ? `设定资料「${saved.name}」已覆盖更新` : `设定资料「${saved.name}」已创建`)
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
    toast.success(overwriteId ? `制作项「${saved.title}」已覆盖更新` : `制作项「${saved.title}」已创建`)
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
    showDiff: false,
    onAcceptCandidate: handleAcceptCandidate,
    onRejectCandidate: handleRejectCandidate,
    onConflictDecision: handleConflictDecision,
    lookup,
  }

  function renderCandidateRow(type: EntityFilter, candidate: TrackedCandidate<Record<string, unknown> & { client_id: string }>) {
    if (type === 'segments') {
      const item = candidate as TrackedCandidate<AISegmentCandidate>
      return (
        <AISegmentRow
          key={item.data.client_id}
          candidate={item.data}
          status={item.status}
          onAccept={async () => { await acceptSegmentCandidate(item.data) }}
          onReject={() => handleRejectCandidate('segments', item.data.client_id)}
          onOverwrite={async () => { await acceptSegmentCandidate(item.data, item.data.conflict_entity_id) }}
          onParallel={async () => { await acceptSegmentCandidate(item.data) }}
        />
      )
    }
    if (type === 'sceneMoments') {
      const item = candidate as TrackedCandidate<AISceneMomentCandidate>
      return (
        <AISceneMomentRow
          key={item.data.client_id}
          candidate={item.data}
          status={item.status}
          onAccept={async () => { await acceptSceneMomentCandidate(item.data) }}
          onReject={() => handleRejectCandidate('scene_moments', item.data.client_id)}
          onOverwrite={async () => { await acceptSceneMomentCandidate(item.data, item.data.conflict_entity_id) }}
          onParallel={async () => { await acceptSceneMomentCandidate(item.data) }}
        />
      )
    }
    if (type === 'creativeReferences') {
      const item = candidate as TrackedCandidate<AICreativeReferenceCandidate>
      return (
        <AICreativeReferenceRow
          key={item.data.client_id}
          candidate={item.data}
          status={item.status}
          onAccept={async () => { await acceptCreativeReferenceCandidate(item.data) }}
          onReject={() => handleRejectCandidate('creative_references', item.data.client_id)}
          onOverwrite={async () => { await acceptCreativeReferenceCandidate(item.data, item.data.conflict_entity_id) }}
          onParallel={async () => { await acceptCreativeReferenceCandidate(item.data) }}
        />
      )
    }
    if (type === 'assetSlots') {
      const item = candidate as TrackedCandidate<AIAssetSlotCandidate>
      return (
        <AIAssetSlotRow
          key={item.data.client_id}
          candidate={item.data}
          status={item.status}
          onAccept={async () => { await acceptAssetSlotCandidate(item.data) }}
          onReject={() => handleRejectCandidate('asset_slots', item.data.client_id)}
          onOverwrite={async () => { await acceptAssetSlotCandidate(item.data, item.data.conflict_entity_id) }}
          onParallel={async () => { await acceptAssetSlotCandidate(item.data) }}
        />
      )
    }
    if (type === 'contentUnits') {
      const item = candidate as TrackedCandidate<AIContentUnitCandidate>
      return (
        <AIContentUnitRow
          key={item.data.client_id}
          candidate={item.data}
          status={item.status}
          onAccept={async () => { await acceptContentUnitCandidate(item.data) }}
          onReject={() => handleRejectCandidate('content_units', item.data.client_id)}
          onOverwrite={async () => { await acceptContentUnitCandidate(item.data, item.data.conflict_entity_id) }}
          onParallel={async () => { await acceptContentUnitCandidate(item.data) }}
        />
      )
    }
    return null
  }

  function renderRecordRow(type: EntityFilter, id: number) {
    if (type === 'all' || type === 'segments') {
      const segment = allSegments.find((item) => item.ID === id)
      if (!segment) return null
      return <SegmentRow key={segment.ID} segment={segment} sceneMoments={allSceneMoments} contentUnits={allContentUnits} {...sharedEntityProps} />
    }
    if (type === 'sceneMoments') {
      const moment = allSceneMoments.find((item) => item.ID === id)
      if (!moment) return null
      return <SceneMomentRow key={moment.ID} moment={moment} segments={allSegments} {...sharedEntityProps} />
    }
    if (type === 'creativeReferences') {
      const reference = allCreativeReferences.find((item) => item.ID === id)
      if (!reference) return null
      return <CreativeReferenceRow key={reference.ID} reference={reference} {...sharedEntityProps} />
    }
    if (type === 'assetSlots') {
      const slot = allAssetSlots.find((item) => item.ID === id)
      if (!slot) return null
      return <AssetSlotRow key={slot.ID} slot={slot} {...sharedEntityProps} />
    }
    const unit = allContentUnits.find((item) => item.ID === id)
    if (!unit) return null
    return <ContentUnitRow key={unit.ID} unit={unit} segments={allSegments} sceneMoments={allSceneMoments} {...sharedEntityProps} />
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
            {proposalPreviewDraft && <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]">提案已加载</Badge>}
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleContextPrimaryAction}>
              <Wand2 size={13} />
              编排到 AI 面板
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={startProjectProposalAnalysis} loading={projectProposalLaunching} disabled={!projectId || !productionId}>
              <Sparkles size={13} />
              项目提案
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => refetch()}>
              <RefreshCw size={13} />
              刷新
            </Button>
          </div>
        </div>
      </header>

      {/* Body: production package workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              加载中…
            </div>
          ) : (
            <ProductionPackageWorkspace
              projectId={projectId}
              productionId={effectiveProductionId}
              productionName={selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : '未选择制作'}
              scriptVersionTitle={selectedScriptVersion?.title ?? ''}
              scriptTextLength={scriptText.length}
              segments={allSegments}
              sceneMoments={allSceneMoments}
              creativeReferences={allCreativeReferences}
              assetSlots={allAssetSlots}
              contentUnits={allContentUnits}
              lookup={lookup}
              queryKey={queryKey}
              expandedIds={expandedIds}
              onToggleExpand={(id) => {
                setExpandedIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }}
              onEdit={(type, record) => setEditEntry({ type, record })}
              onCreateChild={(type) => setCreateType(type)}
              onAnalyze={handleAnalyzeTarget}
              candidates={candidates}
              renderCandidateRow={renderCandidateRow}
            />
          )}
        </main>

        <aside className="relative w-[420px] shrink-0 overflow-hidden border-l border-border bg-card">
          <AgentChatSidebar
            projectId={projectId}
            production={selectedProduction ? { ...selectedProduction, script_version_id: selectedProduction.script_version_id, name: selectedProduction.name } : undefined}
            selectedSegment={selectedSegment}
            segments={allSegments}
            sceneMoments={allSceneMoments}
            creativeReferences={allCreativeReferences}
            assetSlots={allAssetSlots}
            contentUnits={allContentUnits}
            guideCounts={guideCounts}
            pendingCounts={guidePendingCounts}
            orchestrationPrompt={orchestrationPrompt}
            onOrchestrationPromptChange={setOrchestrationPrompt}
            nodeDecisions={proposalNodeDecisions}
            onNodeDecisionsChange={setProposalNodeDecisions}
            onResult={() => undefined}
            onProposalDraft={(draft) => setProposalPreviewDraft(draft)}
            externalProposalDraft={proposalPreviewDraft}
            startAnalysisToken={analysisLaunchToken}
            onApplied={() => {
              void refetch()
              queryClient.invalidateQueries({ queryKey })
            }}
            currentEntities={{
              segments: allSegments,
              sceneMoments: allSceneMoments,
              creativeReferences: allCreativeReferences,
              assetSlots: allAssetSlots,
              contentUnits: allContentUnits,
            }}
          />
        </aside>
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
  filter: EntityFilter
  items: RailItem[]
  filterCounts: Record<Exclude<EntityFilter, 'all'>, number>
  pendingCandidateCount: number
  selectedEntityId: number | null
  onFilterChange: (filter: EntityFilter) => void
  onSelectItem: (entityId: number) => void
  onAddItem: () => void
}

function OrchestrationRail({ filter, items, filterCounts, pendingCandidateCount, selectedEntityId, onFilterChange, onSelectItem, onAddItem }: OrchestrationRailProps) {
  const activeFilterLabel = filterDefs.find((item) => item.key === filter)?.label ?? '结构'
  const totalCount = filterCounts.segments + filterCounts.sceneMoments + filterCounts.creativeReferences + filterCounts.assetSlots + filterCounts.contentUnits

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">结构目录</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">先看全局，再进入单项修正</p>
          </div>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onAddItem} disabled={filter === 'all'}>
            <Plus size={13} />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <RailMetric label="编排段" value={filterCounts.segments} />
          <RailMetric label="情景" value={filterCounts.sceneMoments} />
          <RailMetric label="单元" value={filterCounts.contentUnits} />
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
          <span className="flex items-center gap-1.5"><LayoutList size={13} />全局结构</span>
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
        {items.length === 0 ? (
          <button
            type="button"
            onClick={onAddItem}
            disabled={filter === 'all'}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <Plus size={18} />
            {filter === 'all' ? '暂无制作结构' : `新增第一个${activeFilterLabel}`}
          </button>
        ) : (
          <div className="space-y-1">
            {items.map((item) => {
              const active = selectedEntityId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectItem(item.id)}
                  className={cn(
                    'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                    active ? 'border-primary/40 bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{item.detail}</p>
                    </div>
                    {item.status && <StatusDot status={item.status} />}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {item.meta.length > 0 ? item.meta.map((meta) => <span key={meta}>{meta}</span>) : <span>暂无关联信息</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="space-y-2">
          <CheckRowTiny ok={filterCounts.segments > 0} label="编排段骨架" detail={`${filterCounts.segments} 条`} />
          <CheckRowTiny ok={filterCounts.sceneMoments > 0} label="情景拆解" detail={`${filterCounts.sceneMoments} 条`} />
          <CheckRowTiny ok={pendingCandidateCount === 0} label="候选审阅" detail={pendingCandidateCount > 0 ? `${pendingCandidateCount} 条待审` : `${totalCount} 条已入库`} />
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

function ProductionPackageWorkspace({
  projectId,
  productionId,
  productionName,
  scriptVersionTitle,
  scriptTextLength,
  segments,
  sceneMoments,
  creativeReferences,
  assetSlots,
  contentUnits,
  lookup,
  queryKey,
  expandedIds,
  onToggleExpand,
  onEdit,
  onCreateChild,
  onAnalyze,
  candidates,
  renderCandidateRow,
}: {
  projectId?: number
  productionId: number
  productionName: string
  scriptVersionTitle: string
  scriptTextLength: number
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  lookup: OrchestrationLookup
  queryKey: readonly unknown[]
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onEdit: (type: EntityFilter, record: SemanticEntityRecord) => void
  onCreateChild: (type: EntityFilter) => void
  onAnalyze: (target: AnalysisTarget) => void
  candidates: TrackedCandidates | null
  renderCandidateRow: (type: EntityFilter, candidate: TrackedCandidate<Record<string, unknown> & { client_id: string }>) => ReactNode
}) {
  const noop = () => {}
  const sharedEntityProps = {
    projectId,
    productionId,
    queryKey,
    expandedIds,
    onToggleExpand,
    onEdit,
    onCreateChild,
    onAnalyze,
    candidates,
    showDiff: false,
    onAcceptCandidate: noop,
    onRejectCandidate: noop,
    lookup,
  }
  const pendingSegments = getPendingCandidatesForFilter('segments', candidates)
  const pendingSceneMoments = getPendingCandidatesForFilter('sceneMoments', candidates)
  const pendingCreativeReferences = getPendingCandidatesForFilter('creativeReferences', candidates)
  const pendingAssetSlots = getPendingCandidatesForFilter('assetSlots', candidates)

  function renderCandidateStrip(label: string, items: TrackedCandidate<Record<string, unknown> & { client_id: string }>[], type: EntityFilter) {
    if (items.length === 0) return null
    return (
      <div className="border-b border-amber-200/70 bg-amber-50/60 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
          <Sparkle size={11} />
          {label} · {items.length}
        </div>
        <div className="space-y-1.5">
          {items.map((item) => renderCandidateRow(type, item))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col">
      <section className="border-b border-border/70 px-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <ScrollText size={12} />
              结构
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold text-foreground">{productionName}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              先把本集的情绪、节奏和戏剧功能段写稳，再往下补设定资料、情景链和素材需求。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-2 py-1">剧本 {scriptVersionTitle || '未绑定'}</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">文本 {scriptTextLength} 字</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">编排段 {segments.length}</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">情景 {sceneMoments.length}</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">设定资料 {creativeReferences.length}</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">素材需求 {assetSlots.length}</span>
          </div>
        </div>
      </section>

      <WorkspaceSection
        icon={GitBranch}
        title="编排段"
        detail="本集内部的情绪、节奏和戏剧功能"
        actions={(
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onCreateChild('segments')}>
            <Plus size={12} />
            新增编排段
          </Button>
        )}
      >
        {renderCandidateStrip('编排段候选', pendingSegments, 'segments')}
        {segments.length === 0 ? (
          <EmptySection text="暂无结构" onAdd={() => onCreateChild('segments')} />
        ) : (
          <div className="divide-y divide-border/50">
            {segments.map((segment) => (
              <SegmentRow key={segment.ID} segment={segment} sceneMoments={sceneMoments} contentUnits={contentUnits} {...sharedEntityProps} />
            ))}
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        icon={Sparkles}
        title="设定资料"
        detail="人物、地点、道具、品牌和世界规则"
        actions={(
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onCreateChild('creativeReferences')}>
              <Plus size={12} />
              新增设定资料
            </Button>
          </div>
        )}
      >
        {renderCandidateStrip('设定资料候选', pendingCreativeReferences, 'creativeReferences')}
        {creativeReferences.length === 0 ? (
          <EmptySection text="暂无设定资料" onAdd={() => onCreateChild('creativeReferences')} />
        ) : (
          <div className="divide-y divide-border/50">
            {creativeReferences.map((reference) => (
              <CreativeReferenceRow key={reference.ID} reference={reference} {...sharedEntityProps} />
            ))}
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        icon={Route}
        title="情景链"
        detail="顺序展开的具体情景，作为制作工作台的上游约束"
        actions={(
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onCreateChild('sceneMoments')}>
              <Plus size={12} />
              新增情景
            </Button>
          </div>
        )}
      >
        {renderCandidateStrip('情节候选', pendingSceneMoments, 'sceneMoments')}
        {sceneMoments.length === 0 ? (
          <EmptySection text="暂无情节" onAdd={() => onCreateChild('sceneMoments')} />
        ) : (
          <div className="divide-y divide-border/50">
            {sceneMoments.map((moment) => {
              return (
                <div key={moment.ID}>
                  <SceneMomentRow key={moment.ID} moment={moment} segments={segments} {...sharedEntityProps} />
                </div>
              )
            })}
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        icon={PackageCheck}
        title="素材需求"
        detail="情节对应的素材需求"
        actions={(
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onCreateChild('assetSlots')}>
              <Plus size={12} />
              新增素材需求
            </Button>
          </div>
        )}
      >
        {renderCandidateStrip('素材需求候选', pendingAssetSlots, 'assetSlots')}
        {assetSlots.length === 0 ? (
          <EmptySection text="暂无素材需求" onAdd={() => onCreateChild('assetSlots')} />
        ) : (
          <div className="divide-y divide-border/50">
            {assetSlots.map((slot) => (
              <AssetSlotRow key={slot.ID} slot={slot} {...sharedEntityProps} />
            ))}
          </div>
        )}
      </WorkspaceSection>
    </div>
  )
}

function WorkspaceSection({
  icon: Icon,
  title,
  detail,
  actions,
  children,
}: {
  icon: LucideIcon
  title: string
  detail: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-b border-border/70 px-4 py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Icon size={12} />
            {title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function PackageStageStep({ icon: Icon, label, detail, active = false }: { icon: LucideIcon; label: string; detail: string; active?: boolean }) {
  return (
    <div className={cn('rounded-md border px-3 py-2', active ? 'border-primary/25 bg-primary/5' : 'border-border bg-background')}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <Icon size={12} className={active ? 'text-primary' : 'text-muted-foreground'} />
        {label}
      </div>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function ProposalStructureSegment({
  segment,
  index,
  selectedKey,
  nodeDecisions,
  onSelect,
}: {
  segment: ProposalSegmentNode
  index: number
  selectedKey: string
  nodeDecisions: ProposalNodeDecisions
  onSelect: (key: string) => void
}) {
  const segmentKey = segment.client_id ?? `segment-${index}`
  const active = selectedKey === segmentKey
  const decision = nodeDecisions[nodeDecisionKey('segment', segmentKey)]
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={() => onSelect(segmentKey)}
        className={cn('flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50', active && 'bg-primary/5')}
      >
        <ActionBadge action={segment.action} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{segment.title || `编排段 ${index + 1}`}</span>
            {decision && <DecisionBadge decision={decision} />}
            <span className="shrink-0 text-[10px] text-muted-foreground">{segment.scene_moments?.length ?? 0} 情景</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{segment.summary || segment.rationale || '暂无情绪、节奏或戏剧功能说明'}</p>
        </div>
      </button>
      <div className="ml-5 mt-2 space-y-1.5 border-l border-border pl-3">
        {(segment.scene_moments ?? []).map((moment, momentIndex) => {
          const momentKey = moment.client_id ?? `${segmentKey}-moment-${momentIndex}`
          const momentActive = selectedKey === momentKey
          const momentDecision = nodeDecisions[nodeDecisionKey('scene_moment', momentKey)]
          return (
            <button
              key={momentKey}
              type="button"
              onClick={() => onSelect(momentKey)}
              className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50', momentActive && 'bg-primary/5')}
            >
              <ActionBadge action={moment.action} compact />
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{moment.title || `情景 ${momentIndex + 1}`}</span>
              {momentDecision && <DecisionBadge decision={momentDecision} />}
              <span className="shrink-0 text-[10px] text-muted-foreground">{moment.content_units?.length ?? 0} 制作项</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PackageDetailLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-2.5 py-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon size={12} />
        {label}
      </span>
      <span className="truncate text-[11px] font-medium text-foreground">{value}</span>
    </div>
  )
}

function PackageCompareMetric({ label, current, next, suffix = '' }: { label: string; current: number; next: number; suffix?: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-base font-semibold text-foreground">{current}{suffix}</span>
        <span className="text-[10px] text-muted-foreground">/ 提案 {next}{suffix}</span>
      </div>
    </div>
  )
}

function countProposalTotals(segments: ProposalSegmentNode[]) {
  return segments.reduce((totals, segment) => {
    const moments = segment.scene_moments ?? []
    totals.sceneMoments += moments.length
    for (const moment of moments) {
      totals.contentUnits += moment.content_units?.length ?? 0
      totals.creativeReferences += moment.creative_references?.length ?? 0
      totals.assetSlots += moment.asset_slots?.length ?? 0
      totals.duration += (moment.content_units ?? []).reduce((sum, unit) => sum + (Number(unit.duration_sec) || 0), 0)
    }
    return totals
  }, { sceneMoments: 0, contentUnits: 0, creativeReferences: 0, assetSlots: 0, duration: 0 })
}

function findProposalSelection(segments: ProposalSegmentNode[], key: string) {
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if ((segment.client_id ?? `segment-${i}`) === key) return { kind: 'segment' as const, segment, moment: undefined }
    const moments = segment.scene_moments ?? []
    for (let j = 0; j < moments.length; j += 1) {
      const moment = moments[j]
      if ((moment.client_id ?? `${segment.client_id ?? `segment-${i}`}-moment-${j}`) === key) {
        return { kind: 'scene_moment' as const, segment, moment }
      }
    }
  }
  return null
}

function countSegmentContentUnits(segment?: ProposalSegmentNode) {
  return (segment?.scene_moments ?? []).reduce((sum, moment) => sum + (moment.content_units?.length ?? 0), 0)
}

function countSegmentReferences(segment?: ProposalSegmentNode) {
  return (segment?.scene_moments ?? []).reduce((sum, moment) => sum + (moment.creative_references?.length ?? 0), 0)
}

function countSegmentAssetSlots(segment?: ProposalSegmentNode) {
  return (segment?.scene_moments ?? []).reduce((sum, moment) => sum + (moment.asset_slots?.length ?? 0), 0)
}

function WorkspaceHeader({
  filter,
  selectedRecord,
  selectedRecordLabel,
  selectedRecordSummary,
  contextOverview,
  filterCounts,
  totalCount,
  metrics,
  candidates,
  onAdd,
  onClearSelection,
  onPrimaryAction,
}: {
  filter: EntityFilter
  selectedRecord: SemanticEntityRecord | null
  selectedRecordLabel: string
  selectedRecordSummary: string
  contextOverview: ContextOverview
  filterCounts: Record<Exclude<EntityFilter, 'all'>, number>
  totalCount: number
  metrics: OverviewMetric[]
  candidates: TrackedCandidates | null
  onAdd: () => void
  onClearSelection: () => void
  onPrimaryAction: () => void
}) {
  const filterLabel = filterDefs.find((item) => item.key === filter)?.label ?? '编排'
  const hasSelection = Boolean(selectedRecord)
  const title = hasSelection ? titleOfRecord(selectedRecord) : filter === 'all' ? '制作总览' : `${filterLabel}总览`
  const modeLabel = hasSelection ? '当前对象' : filter === 'all' ? '全制作' : '分类总览'
  const modeIcon = hasSelection ? Target : filter === 'all' ? Layers3 : LayoutList
  const ModeIcon = modeIcon
  const PrimaryIcon = contextOverview.primaryActionIcon
  const pending = candidates
    ? countPending(candidates.segments) + countPending(candidates.scene_moments) + countPending(candidates.creative_references) + countPending(candidates.asset_slots) + countPending(candidates.content_units)
    : 0
  const totalEntityCount = filterCounts.segments + filterCounts.sceneMoments + filterCounts.creativeReferences + filterCounts.assetSlots + filterCounts.contentUnits

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <ModeIcon size={12} />
            {modeLabel} · {filterLabel}
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold text-foreground">{title}</h1>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {hasSelection ? `${selectedRecordLabel} · ${selectedRecordSummary}` : selectedRecordSummary}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasSelection && (
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onClearSelection}>
              <X size={13} />
              看总览
            </Button>
          )}
          <Button size="sm" variant={pending > 0 ? 'default' : 'secondary'} className="h-8 gap-1.5 text-xs" onClick={onPrimaryAction}>
            <PrimaryIcon size={13} />
            {contextOverview.primaryActionLabel}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onAdd} disabled={filter === 'all'}>
            <Plus size={13} />
            新增条目
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 border-t border-border pt-3 md:grid-cols-4">
        <ContextInsight icon={Target} label="位置" lines={contextOverview.position} />
        <ContextInsight icon={ScrollText} label={contextOverview.sourceLabel} lines={contextOverview.source} />
        <ContextInsight icon={Layers3} label="关联" lines={contextOverview.relations} />
        <ContextInsight icon={CheckCheck} label="下一步" lines={contextOverview.nextStep} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 md:grid-cols-4">
        {(metrics.length > 0 ? metrics : [
          { icon: LayoutList, label: filter === 'all' ? '全部对象' : '当前列表', value: filter === 'all' ? totalEntityCount : totalCount },
          { icon: Target, label: '当前选择', value: hasSelection ? 1 : 0 },
          { icon: PackageCheck, label: '素材需求缺口', value: filterCounts.assetSlots, tone: filterCounts.assetSlots > 0 ? 'warn' as const : 'muted' as const },
        ]).slice(0, 3).map((metric) => (
          <DecisionMetric key={metric.label} icon={metric.icon} label={metric.label} value={metric.value} tone={metric.tone} />
        ))}
        <DecisionMetric icon={Sparkle} label="阶段候选" value={pending} tone={pending > 0 ? 'warn' : 'muted'} />
      </div>
    </section>
  )
}

function ContextInsight({ icon: Icon, label, lines }: { icon: LucideIcon; label: string; lines: string[] }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon size={12} />
        {label}
      </div>
      <div className="mt-1.5 space-y-1">
        {(lines.length > 0 ? lines : ['暂无信息']).slice(0, 3).map((line) => (
          <p key={line} className="line-clamp-2 text-xs leading-5 text-foreground">{line}</p>
        ))}
      </div>
    </div>
  )
}

function DecisionMetric({ icon: Icon, label, value, tone = 'muted' }: { icon: LucideIcon; label: string; value: number | string; tone?: 'muted' | 'ok' | 'warn' }) {
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

function buildOverviewMetrics(
  filter: EntityFilter,
  selectedRecord: SemanticEntityRecord | null,
  data: {
    segments: SegmentRecord[]
    sceneMoments: SceneMomentRecord[]
    creativeReferences: CreativeReferenceRecord[]
    assetSlots: AssetSlotRecord[]
    contentUnits: ContentUnitRecord[]
    lookup: OrchestrationLookup
  },
): OverviewMetric[] {
  if (!selectedRecord) {
    if (filter === 'all') {
      return [
        { icon: GitBranch, label: '编排段', value: data.segments.length },
        { icon: Route, label: '情景', value: data.sceneMoments.length },
        { icon: PackageCheck, label: '素材需求缺口', value: data.assetSlots.length, tone: data.assetSlots.length > 0 ? 'warn' : 'muted' },
      ]
    }
    if (filter === 'segments') {
      const withMoments = data.segments.filter((segment) => data.sceneMoments.some((moment) => moment.segment_id === segment.ID)).length
      const withUnits = data.segments.filter((segment) => data.contentUnits.some((unit) => unit.segment_id === segment.ID)).length
      return [
        { icon: GitBranch, label: '编排段', value: data.segments.length },
        { icon: Route, label: '有情景', value: withMoments, tone: withMoments === data.segments.length && data.segments.length > 0 ? 'ok' : 'muted' },
        { icon: Film, label: '有制作项', value: withUnits, tone: withUnits === data.segments.length && data.segments.length > 0 ? 'ok' : 'muted' },
      ]
    }
    if (filter === 'sceneMoments') {
      const linkedUnits = data.contentUnits.filter((unit) => unit.scene_moment_id).length
      return [
        { icon: Route, label: '情景', value: data.sceneMoments.length },
        { icon: GitBranch, label: '覆盖编排段', value: uniqueNumbers(data.sceneMoments.map((moment) => Number(moment.segment_id ?? 0))).length },
        { icon: Film, label: '承接制作项', value: linkedUnits },
      ]
    }
    if (filter === 'creativeReferences') {
      const usedRefs = data.creativeReferences.filter((reference) => (data.lookup.usagesByReferenceId.get(reference.ID)?.length ?? 0) > 0 || (data.lookup.assetSlotsByReferenceId.get(reference.ID)?.length ?? 0) > 0).length
      return [
        { icon: Sparkles, label: '设定资料', value: data.creativeReferences.length },
        { icon: Target, label: '已被使用', value: usedRefs, tone: usedRefs > 0 ? 'ok' : 'muted' },
        { icon: PackageCheck, label: '关联素材需求', value: data.lookup.assetSlotsByReferenceId.size },
      ]
    }
    if (filter === 'assetSlots') {
      const missing = data.assetSlots.filter((slot) => String(slot.status ?? '') === 'missing').length
      const critical = data.assetSlots.filter((slot) => String(slot.priority ?? '') === 'critical').length
      return [
        { icon: PackageCheck, label: '素材需求', value: data.assetSlots.length },
        { icon: AlertCircle, label: '缺口', value: missing, tone: missing > 0 ? 'warn' : 'muted' },
        { icon: Target, label: '紧急', value: critical, tone: critical > 0 ? 'warn' : 'muted' },
      ]
    }
    const totalDuration = data.contentUnits.reduce((sum, unit) => sum + (Number(unit.duration_sec) || 0), 0)
    return [
      { icon: Film, label: '制作项', value: data.contentUnits.length },
      { icon: Route, label: '关联情景', value: uniqueNumbers(data.contentUnits.map((unit) => Number(unit.scene_moment_id ?? 0))).length },
      { icon: LayoutList, label: '预计时长', value: totalDuration > 0 ? `${totalDuration}s` : '-' },
    ]
  }

  if (filter === 'segments') {
    const segment = selectedRecord as SegmentRecord
    const moments = data.sceneMoments.filter((moment) => moment.segment_id === segment.ID)
    const units = data.contentUnits.filter((unit) => unit.segment_id === segment.ID)
    const slots = collectAssetSlotsFromSegment(data.assetSlots, segment.ID, moments, units)
    return [
      { icon: Route, label: '情景', value: moments.length },
      { icon: Film, label: '制作项', value: units.length },
      { icon: PackageCheck, label: '素材需求', value: slots.length, tone: slots.some((slot) => String(slot.status ?? '') === 'missing') ? 'warn' : 'muted' },
    ]
  }
  if (filter === 'sceneMoments') {
    const moment = selectedRecord as SceneMomentRecord
    const units = data.contentUnits.filter((unit) => unit.scene_moment_id === moment.ID)
    const slots = data.assetSlots.filter((slot) => (
      (slot.owner_type === 'scene_moment' && slot.owner_id === moment.ID) ||
      units.some((unit) => slot.owner_type === 'content_unit' && slot.owner_id === unit.ID)
    ))
    return [
      { icon: GitBranch, label: '所属编排段', value: moment.segment_id ? 1 : 0 },
      { icon: Film, label: '制作项', value: units.length },
      { icon: PackageCheck, label: '素材需求', value: slots.length, tone: slots.some((slot) => String(slot.status ?? '') === 'missing') ? 'warn' : 'muted' },
    ]
  }
  if (filter === 'creativeReferences') {
    const reference = selectedRecord as CreativeReferenceRecord
    return [
      { icon: Sparkles, label: '设定资料类型', value: reference.kind ? creativeReferenceKindLabel[String(reference.kind)] ?? String(reference.kind) : '-' },
      { icon: Target, label: '出现次数', value: (data.lookup.usagesByReferenceId.get(reference.ID)?.length ?? 0) },
      { icon: PackageCheck, label: '关联素材需求', value: (data.lookup.assetSlotsByReferenceId.get(reference.ID)?.length ?? 0) },
    ]
  }
  if (filter === 'assetSlots') {
    const slot = selectedRecord as AssetSlotRecord
    return [
      { icon: PackageCheck, label: '素材需求类型', value: slot.kind ? String(slot.kind) : '-' },
      { icon: Target, label: '优先级', value: slot.priority ? statusLabel[String(slot.priority)] ?? String(slot.priority) : '-' },
      { icon: AlertCircle, label: '状态', value: slot.status ? statusLabel[String(slot.status)] ?? String(slot.status) : '-', tone: String(slot.status ?? '') === 'missing' ? 'warn' : 'muted' },
    ]
  }
  const unit = selectedRecord as ContentUnitRecord
  return [
    { icon: Film, label: '制作类型', value: unit.kind ? contentUnitKindLabel[String(unit.kind)] ?? String(unit.kind) : '-' },
    { icon: Route, label: '关联情景', value: unit.scene_moment_id ? 1 : 0 },
    { icon: LayoutList, label: '时长', value: unit.duration_sec ? `${unit.duration_sec}s` : '-' },
  ]
}

function buildContextOverview(
  filter: EntityFilter,
  selectedRecord: SemanticEntityRecord | null,
  data: {
    productionName: string
    scriptVersionTitle: string
    scriptText: string
    segments: SegmentRecord[]
    sceneMoments: SceneMomentRecord[]
    creativeReferences: CreativeReferenceRecord[]
    assetSlots: AssetSlotRecord[]
    contentUnits: ContentUnitRecord[]
    lookup: OrchestrationLookup
    pendingCount: number
  },
): ContextOverview {
  const pendingLine = data.pendingCount > 0 ? `${data.pendingCount} 条 AI 候选需要先审阅。` : ''
  const primaryFromPending = data.pendingCount > 0
    ? { primaryActionLabel: '审阅候选', primaryActionIcon: CheckCheck }
    : null

  if (!selectedRecord) {
    const missingSlots = data.assetSlots.filter((slot) => String(slot.status ?? '') === 'missing')
    const segmentWithoutMoments = data.segments.filter((segment) => !data.sceneMoments.some((moment) => moment.segment_id === segment.ID)).length
    const nextStep = [
      pendingLine,
      segmentWithoutMoments > 0 ? `${segmentWithoutMoments} 个编排段还没有情景拆解。` : '',
      missingSlots.length > 0 ? `${missingSlots.length} 个素材需求仍是缺口状态。` : '',
      data.segments.length === 0 ? '先从剧本生成第一版结构骨架。' : '',
      data.segments.length > 0 && data.pendingCount === 0 && segmentWithoutMoments === 0 && missingSlots.length === 0 ? '结构已具备进入制作工作台的基础。' : '',
    ].filter(Boolean)
    return {
      position: [
        `制作：${data.productionName}`,
        filter === 'all' ? '当前查看制作结构树。' : `当前查看${filterDefs.find((item) => item.key === filter)?.label ?? '分类'}。`,
      ],
      sourceLabel: '来源',
      source: [
        data.scriptVersionTitle ? `剧本版本：${data.scriptVersionTitle}` : '未绑定剧本版本。',
        data.scriptText ? `剧本文本约 ${data.scriptText.length} 字。` : '暂无可分析剧本文本。',
      ],
      relations: [
        `${data.segments.length} 段 / ${data.sceneMoments.length} 情景`,
        `${data.creativeReferences.length} 设定资料 / ${data.assetSlots.length} 素材需求`,
      ],
      nextStep,
      ...(primaryFromPending ?? {
        primaryActionLabel: filter === 'all' ? '重新编排' : '补齐当前分类',
        primaryActionIcon: filter === 'all' ? Wand2 : Plus,
      }),
    }
  }

  if (filter === 'all' || filter === 'segments') {
    const segment = selectedRecord as SegmentRecord
    const moments = data.sceneMoments.filter((moment) => moment.segment_id === segment.ID)
    const units = data.contentUnits.filter((unit) => unit.segment_id === segment.ID)
    const slots = collectAssetSlotsFromSegment(data.assetSlots, segment.ID, moments, units)
    const missingSlots = slots.filter((slot) => String(slot.status ?? '') === 'missing')
    return {
      position: [
        `制作：${data.productionName}`,
        `编排段：${titleOfRecord(segment)}`,
        segment.order ? `顺序：第 ${segment.order} 段` : '',
      ].filter(Boolean),
      sourceLabel: '剧本来源',
      source: [
        segment.source_range ? `来源范围：${segment.source_range}` : '',
        String(segment.summary ?? segment.content ?? '').trim() || '暂无编排段摘要。',
      ].filter(Boolean),
      relations: [
      `${moments.length} 个情景承接这个编排段。`,
        units.length > 0 ? `${units.length} 个下游制作项已从这里拆出。` : '制作项将在制作工作台中拆解。',
        `${slots.length} 个素材需求，其中 ${missingSlots.length} 个缺口。`,
      ],
      nextStep: [
        pendingLine,
        moments.length === 0 ? '补齐情景拆解。' : '',
        missingSlots.length > 0 ? '优先处理缺失素材需求。' : '',
        moments.length > 0 && missingSlots.length === 0 ? '可进入制作工作台拆镜头和台词。' : '',
      ].filter(Boolean),
      ...(primaryFromPending ?? {
        primaryActionLabel: moments.length === 0 ? '补齐情景' : '重新分析',
        primaryActionIcon: Wand2,
      }),
    }
  }

  if (filter === 'sceneMoments') {
    const moment = selectedRecord as SceneMomentRecord
    const segment = moment.segment_id ? data.lookup.segmentById.get(Number(moment.segment_id)) : null
    const units = data.contentUnits.filter((unit) => unit.scene_moment_id === moment.ID)
    const refs = referencesForOwner('scene_moment', moment.ID, data.lookup)
    const slots = data.assetSlots.filter((slot) => (
      (slot.owner_type === 'scene_moment' && slot.owner_id === moment.ID) ||
      units.some((unit) => slot.owner_type === 'content_unit' && slot.owner_id === unit.ID)
    ))
    const missingSlots = slots.filter((slot) => String(slot.status ?? '') === 'missing')
    return {
      position: [
        `制作：${data.productionName}`,
        segment ? `所属编排段：${titleOfRecord(segment)}` : '未关联编排段。',
        `情景：${titleOfRecord(moment)}`,
      ],
      sourceLabel: '情景信息',
      source: [
        [moment.time_text, moment.location_text].filter(Boolean).join(' / '),
        String(moment.action_text ?? moment.description ?? '').trim() || '暂无动作描述。',
      ].filter(Boolean),
      relations: [
        `${refs.length} 个设定资料在此情景出现。`,
        units.length > 0 ? `${units.length} 个下游制作项承接此情景。` : '制作项将在制作工作台中承接此情景。',
        `${slots.length} 个素材需求，其中 ${missingSlots.length} 个缺口。`,
      ],
      nextStep: [
        pendingLine,
        refs.length === 0 ? '确认人物、地点或道具设定资料。' : '',
        missingSlots.length > 0 ? '补齐此情景下的素材需求。' : '',
        refs.length > 0 && missingSlots.length === 0 ? '可进入制作工作台拆镜头、台词和关键帧。' : '',
      ].filter(Boolean),
      ...(primaryFromPending ?? {
        primaryActionLabel: '重新分析',
        primaryActionIcon: Wand2,
      }),
    }
  }

  if (filter === 'contentUnits') {
    const unit = selectedRecord as ContentUnitRecord
    const segment = unit.segment_id ? data.lookup.segmentById.get(Number(unit.segment_id)) : null
    const moment = unit.scene_moment_id ? data.lookup.sceneMomentById.get(Number(unit.scene_moment_id)) : null
    const refs = referencesForOwner('content_unit', unit.ID, data.lookup)
    const slots = data.lookup.assetSlotsByOwnerKey.get(ownerKey('content_unit', unit.ID)) ?? []
    const missingSlots = slots.filter((slot) => String(slot.status ?? '') === 'missing')
    return {
      position: [
        `制作：${data.productionName}`,
        segment ? `所属编排段：${titleOfRecord(segment)}` : '',
        moment ? `所属情景：${titleOfRecord(moment)}` : '未关联情景。',
      ].filter(Boolean),
      sourceLabel: '制作说明',
      source: [
        unit.kind ? `类型：${contentUnitKindLabel[String(unit.kind)] ?? String(unit.kind)}` : '',
        [unit.shot_size, unit.camera_angle, unit.camera_motion].filter(Boolean).join(' / '),
        String(unit.description ?? unit.prompt ?? '').trim() || '暂无制作说明。',
      ].filter(Boolean),
      relations: [
        `${refs.length} 个设定资料约束此制作项。`,
        `${slots.length} 个素材需求，其中 ${missingSlots.length} 个缺口。`,
        unit.duration_sec ? `预计时长 ${unit.duration_sec}s。` : '',
      ].filter(Boolean),
      nextStep: [
        pendingLine,
        !unit.prompt && !unit.description ? '补齐提示词或制作描述。' : '',
        missingSlots.length > 0 ? '先处理依赖素材需求。' : '',
        slots.length === 0 ? '检查是否需要绑定素材需求。' : '',
        (unit.prompt || unit.description) && missingSlots.length === 0 ? '可进入生产工作台继续生成。' : '',
      ].filter(Boolean),
      ...(primaryFromPending ?? {
        primaryActionLabel: missingSlots.length > 0 ? '检查素材需求' : '重新分析',
        primaryActionIcon: missingSlots.length > 0 ? PackageCheck : Wand2,
      }),
    }
  }

  if (filter === 'creativeReferences') {
    const reference = selectedRecord as CreativeReferenceRecord
    const usages = data.lookup.usagesByReferenceId.get(reference.ID) ?? []
    const slots = data.lookup.assetSlotsByReferenceId.get(reference.ID) ?? []
    const usageLabels = uniqueStrings(usages.map((usage) => formatOwnerLabel(String(usage.owner_type ?? ''), Number(usage.owner_id ?? 0), data.lookup)).filter(Boolean))
    return {
      position: [
        `项目共享设定资料：${titleOfRecord(reference)}`,
        reference.kind ? `类型：${creativeReferenceKindLabel[String(reference.kind)] ?? String(reference.kind)}` : '',
        reference.importance ? `重要性：${statusLabel[String(reference.importance)] ?? String(reference.importance)}` : '',
      ].filter(Boolean),
      sourceLabel: '设定资料说明',
      source: [
        reference.alias ? `别名：${reference.alias}` : '',
        String(reference.description ?? '').trim() || '暂无设定资料说明。',
      ].filter(Boolean),
      relations: [
        `${usageLabels.length} 个结构位置引用此设定资料。`,
        `${slots.length} 个素材需求与此设定资料关联。`,
        usageLabels[0] ? `示例：${usageLabels[0]}` : '',
      ].filter(Boolean),
      nextStep: [
        pendingLine,
        usages.length === 0 && slots.length === 0 ? '确认是否需要绑定到段落、情景或素材需求。' : '',
        slots.length === 0 ? '如需视觉一致性，可补充参考素材需求。' : '',
        usages.length > 0 ? '修改会影响引用它的制作上下文。' : '',
      ].filter(Boolean),
      ...(primaryFromPending ?? {
        primaryActionLabel: usages.length === 0 ? '绑定上下文' : '重新分析',
        primaryActionIcon: usages.length === 0 ? Target : Wand2,
      }),
    }
  }

  const slot = selectedRecord as AssetSlotRecord
  const ownerLabel = formatOwnerLabel(String(slot.owner_type ?? ''), Number(slot.owner_id ?? 0), data.lookup)
  const reference = slot.creative_reference_id ? data.lookup.creativeReferenceById.get(Number(slot.creative_reference_id)) : null
  return {
    position: [
      `制作：${data.productionName}`,
      ownerLabel || '未绑定服务对象。',
      reference ? `关联设定资料：${titleOfRecord(reference)}` : '',
    ].filter(Boolean),
    sourceLabel: '素材需求',
    source: [
      slot.kind ? `类型：${slot.kind}` : '',
      slot.priority ? `优先级：${statusLabel[String(slot.priority)] ?? String(slot.priority)}` : '',
      String(slot.description ?? '').trim() || '暂无素材需求说明。',
    ].filter(Boolean),
    relations: [
      ownerLabel ? '该素材需求会影响其服务对象是否可生产。' : '当前素材需求缺少上下文归属。',
      reference ? '该素材需求用于维持设定资料表现一致性。' : '未关联项目设定资料。',
      slot.status ? `当前状态：${statusLabel[String(slot.status)] ?? String(slot.status)}。` : '',
    ].filter(Boolean),
    nextStep: [
      pendingLine,
      String(slot.status ?? '') === 'missing' ? '补齐、生成或锁定素材资源。' : '',
      !ownerLabel ? '先绑定到段落、情景或制作项。' : '',
      ownerLabel && String(slot.status ?? '') !== 'missing' ? '可回到服务对象继续检查生产条件。' : '',
    ].filter(Boolean),
    ...(primaryFromPending ?? {
      primaryActionLabel: String(slot.status ?? '') === 'missing' ? '检查素材需求' : '重新分析',
      primaryActionIcon: String(slot.status ?? '') === 'missing' ? PackageCheck : Wand2,
    }),
  }
}

function referencesForOwner(ownerType: string, ownerId: number, lookup: OrchestrationLookup) {
  return (lookup.usagesByOwnerKey.get(ownerKey(ownerType, ownerId)) ?? [])
    .map((usage) => usage.creative_reference_id ? lookup.creativeReferenceById.get(Number(usage.creative_reference_id)) : null)
    .filter((reference): reference is CreativeReferenceRecord => Boolean(reference))
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function getPendingCandidatesForFilter(filter: EntityFilter, candidates: TrackedCandidates | null): TrackedCandidate<Record<string, unknown> & { client_id: string }>[] {
  if (!candidates || filter === 'all') return []
  const list = filter === 'segments'
    ? candidates.segments
    : filter === 'sceneMoments'
      ? candidates.scene_moments
      : filter === 'creativeReferences'
        ? candidates.creative_references
        : filter === 'assetSlots'
          ? candidates.asset_slots
          : candidates.content_units
  return list.filter((item) => item.status === 'pending' || item.status === 'conflict_pending') as TrackedCandidate<Record<string, unknown> & { client_id: string }>[]
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
            编排段 · 情景 · 制作项
          </div>
          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={onAddSegment}>
            <Plus size={11} />新增编排段
          </button>
        </div>
        {showDiff && candidates && candidates.segments.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 候选</p>
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
          <EmptySection text="暂无编排段" onAdd={onAddSegment} />
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
            设定资料
          </div>
          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={onAddReference}>
            <Plus size={11} />新增设定资料
          </button>
        </div>
        {showDiff && candidates && candidates.creative_references.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 候选</p>
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
          <EmptySection text="暂无设定资料" onAdd={onAddReference} />
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
            <Plus size={11} />新增素材需求
          </button>
        </div>
        {showDiff && candidates && candidates.asset_slots.filter((c) => c.status === 'pending' || c.status === 'conflict_pending').length > 0 && (
          <div className="px-4 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">AI 候选</p>
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
  items: RailItem[]
  renderRow: (item: RailItem) => React.ReactNode
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('编排段已删除') },
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
            <span className="text-sm font-medium text-foreground">{String(segment.title ?? `编排段 #${segment.ID}`)}</span>
            {segment.kind && <Badge variant="secondary" className="text-[10px]">{segmentKindLabel[String(segment.kind)] ?? String(segment.kind)}</Badge>}
            {segment.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(segment.status)])}>{statusLabel[String(segment.status)] ?? String(segment.status)}</Badge>}
            {childSceneMoments.length > 0 && <span className="text-[10px] text-muted-foreground">{childSceneMoments.length} 情景</span>}
            {childContentUnits.length > 0 && <span className="text-[10px] text-muted-foreground">{childContentUnits.length} 制作项 {totalDuration > 0 ? `· ${totalDuration}s` : ''}</span>}
          </div>
          {segment.summary && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{String(segment.summary)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/seg:opacity-100">
          <button type="button" onClick={() => onAnalyze({ scope: 'segmentAnalysis', entityId: segment.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="重新分析">
            <Wand2 size={13} />
          </button>
          <button type="button" onClick={() => onEdit('segments', segment)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这个编排段？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
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
          <RelationBlock label="出现的情景" items={childSceneMoments.map((item) => titleOfRecord(item))} />
          <RelationBlock label="出现的制作项" items={childContentUnits.map((item) => titleOfRecord(item))} />
          {/* Child scene moments */}
          {childSceneMoments.length > 0 && (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">情景</p>
              {childSceneMoments.map((sm) => (
                <SceneMomentRow key={sm.ID} moment={sm} segments={[]} projectId={projectId} productionId={0} queryKey={queryKey} expandedIds={expandedIds} onToggleExpand={onToggleExpand} onEdit={onEdit} onCreateChild={() => {}} onAnalyze={onAnalyze} lookup={lookup} candidates={null} showDiff={false} onAcceptCandidate={() => {}} onRejectCandidate={() => {}} />
              ))}
            </div>
          )}
          {/* Child content units */}
          {childContentUnits.length > 0 && (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">制作项</p>
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
  const creativeReferenceLabels = uniqueStrings(referencesForOwner('scene_moment', moment.ID, lookup).map((reference) => titleOfRecord(reference)))

  const deleteMutation = useMutation({
    mutationFn: () => deleteSemanticEntity(projectId!, semanticEntityConfig('sceneMoments'), moment.ID),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('情景已删除') },
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
            <span className="text-sm text-foreground">{String(moment.title ?? `情景 #${moment.ID}`)}</span>
            {moment.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(moment.status)])}>{statusLabel[String(moment.status)] ?? String(moment.status)}</Badge>}
            {parentSegment && <span className="text-[10px] text-muted-foreground">编排段: {String(parentSegment.title ?? `#${parentSegment.ID}`)}</span>}
            {creativeReferenceLabels.length > 0 && <span className="text-[10px] text-muted-foreground">设定资料: {creativeReferenceLabels.length}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {moment.time_text && <span>时间: {String(moment.time_text)}</span>}
            {moment.location_text && <span>地点: {String(moment.location_text)}</span>}
            {moment.mood && <span>情绪: {String(moment.mood)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/sm:opacity-100">
          <button type="button" onClick={() => onAnalyze({ scope: 'sceneMoments', entityId: moment.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="重新分析">
            <Wand2 size={13} />
          </button>
          <button type="button" onClick={() => onEdit('sceneMoments', moment)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这个情景？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
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
              <p className="text-[10px] text-muted-foreground">情景文字</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">{String(moment.description)}</p>
            </div>
          )}
          <RelationBlock label="引用的设定资料" items={creativeReferenceLabels} />
          {lookup.assetSlotsByOwnerKey.has(ownerKey('scene_moment', moment.ID)) && (
            <RelationBlock
              label="出现的素材需求"
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('设定资料已删除') },
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
            <span className="text-sm text-foreground">{String(reference.name ?? `设定资料 #${reference.ID}`)}</span>
            {reference.kind && <Badge variant="secondary" className="text-[10px]">{creativeReferenceKindLabel[String(reference.kind)] ?? String(reference.kind)}</Badge>}
            {reference.importance && <Badge variant="secondary" className="text-[10px]">{String(reference.importance) === 'main' ? '主要' : String(reference.importance) === 'supporting' ? '辅助' : '背景'}</Badge>}
            {reference.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(reference.status)])}>{statusLabel[String(reference.status)] ?? String(reference.status)}</Badge>}
          </div>
          {reference.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{String(reference.description)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/cr:opacity-100">
          <button type="button" onClick={() => onAnalyze({ scope: 'creativeReferences', entityId: reference.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="重新分析">
            <Wand2 size={13} />
          </button>
          <button type="button" onClick={() => onEdit('creativeReferences', reference)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这条设定资料？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && reference.description && (
        <div className="ml-6 border-l border-border/50 pb-2 pl-3">
          <div className="px-2 py-2">
            <p className="text-[10px] text-muted-foreground">设定资料正文</p>
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
            <span className="text-sm text-foreground">{String(slot.name ?? `素材需求 #${slot.ID}`)}</span>
            {slot.kind && <Badge variant="secondary" className="text-[10px]">{String(slot.kind)}</Badge>}
            {slot.priority && <Badge variant="secondary" className="text-[10px]">{statusLabel[String(slot.priority)] ?? String(slot.priority)}</Badge>}
            {slot.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(slot.status)])}>{statusLabel[String(slot.status)] ?? String(slot.status)}</Badge>}
          </div>
          {slot.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{String(slot.description)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/as:opacity-100">
          <button type="button" onClick={() => onAnalyze({ scope: 'assetSlots', entityId: slot.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="重新分析">
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success('制作项已删除') },
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
            <span className="text-sm text-foreground">{String(unit.title ?? `制作项 #${unit.ID}`)}</span>
            {unit.kind && <Badge variant="secondary" className="text-[10px]">{contentUnitKindLabel[String(unit.kind)] ?? String(unit.kind)}</Badge>}
            {unit.duration_sec && <span className="text-[10px] text-muted-foreground">{unit.duration_sec}s</span>}
            {unit.status && <Badge variant="secondary" className={cn('text-[10px]', statusTone[String(unit.status)])}>{statusLabel[String(unit.status)] ?? String(unit.status)}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {unit.shot_size && <span>景别: {String(unit.shot_size)}</span>}
            {unit.camera_angle && <span>机位: {String(unit.camera_angle)}</span>}
            {unit.camera_motion && <span>运镜: {String(unit.camera_motion)}</span>}
            {parentSegment && <span>编排段: {String(parentSegment.title ?? `#${parentSegment.ID}`)}</span>}
            {parentSceneMoment && <span>情景: {String(parentSceneMoment.title ?? `#${parentSceneMoment.ID}`)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/cu:opacity-100">
          <button type="button" onClick={() => onAnalyze({ scope: 'contentUnits', entityId: unit.ID })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="重新分析">
            <Wand2 size={13} />
          </button>
          <button type="button" onClick={() => onEdit('contentUnits', unit)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={() => { if (confirm('确定删除这个制作项？')) deleteMutation.mutate() }} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
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
          <RelationBlock label="对应编排段/情景" items={contentUnitAppearances(unit, lookup)} />
          <RelationBlock label="相关设定资料" items={contentUnitReferences(unit, lookup)} />
          <RelationBlock label="相关素材需求" items={contentUnitAssetSlots(unit, lookup)} />
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
        <span className="text-sm font-medium text-foreground">{candidate.description ?? `制作项 #${candidate.order}`}</span>
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
    segments.length > 0 ? `编排段 ${segments.join('/')}` : '',
    moments.length > 0 ? `情景 ${moments.join('/')}` : '',
    refs.length > 0 ? `设定资料 ${refs.join('/')}` : '',
    assets.length > 0 ? `素材需求 ${assets.join('/')}` : '',
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

function buildDemoProposalDraft(input: {
  productionId: number
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
}): ProposalDraftContent {
  const existingSegment = input.segments[0]
  const existingMoment = existingSegment
    ? input.sceneMoments.find((moment) => Number(moment.segment_id) === existingSegment.ID)
    : input.sceneMoments[0]
  const existingReference = input.creativeReferences[0]
  const secondaryReference = input.creativeReferences[1]
  const existingSlot = input.assetSlots[0]

  return {
    productionId: input.productionId || 0,
    analysisScope: 'ui-preview',
    summary: '这是一份用于预览编排审阅体验的示例提案：包含编排段、情景、设定引用和素材需求缺口；下游制作细化留给制作工作台继续展开。',
    proposedAt: new Date().toISOString(),
    proposal: {
      segments: [
        {
          action: existingSegment ? 'update' : 'create',
          id: existingSegment?.ID,
          client_id: 'demo_segment_existing',
          title: existingSegment ? titleOfRecord(existingSegment) : '开场冲突铺垫',
          kind: String(existingSegment?.kind ?? 'emotional_function'),
          summary: String(existingSegment?.summary ?? '整理开场信息，把人物、地点和冲突目标绑定到可执行情景。'),
          order: Number(existingSegment?.order ?? 1),
          status: 'draft',
          rationale: '保留已确认结构，只补充缺失的情景、设定资料引用和素材需求。',
          before: existingSegment ? { title: existingSegment.title, summary: existingSegment.summary } : undefined,
          scene_moments: [
            {
              action: existingMoment ? 'update' : 'create',
              id: existingMoment?.ID,
              client_id: 'demo_moment_update',
              title: existingMoment ? titleOfRecord(existingMoment) : '主角发现异常',
              time_text: String(existingMoment?.time_text ?? '清晨'),
              location_text: String(existingMoment?.location_text ?? '公寓门口'),
              action_text: '主角停下脚步，注意到门口多出的陌生包裹，情绪从日常转为警觉。',
              mood: String(existingMoment?.mood ?? '克制紧张'),
              order: Number(existingMoment?.order ?? 1),
              status: 'draft',
              rationale: '在原情景基础上补齐动作和情绪转折，便于后续拆镜。',
              before: existingMoment ? { action_text: existingMoment.action_text, mood: existingMoment.mood } : undefined,
              creative_references: [
                existingReference
                  ? {
                      action: 'reuse',
                      id: existingReference.ID,
                      client_id: 'demo_ref_reuse_primary',
                      name: titleOfRecord(existingReference),
                      kind: String(existingReference.kind ?? 'person'),
                      role: 'protagonist',
                      source_label: '项目共享',
                      state: { emotion: '警觉', visual_notes: '保持既有服装和发型连续性' },
                    }
                  : {
                      action: 'create',
                      client_id: 'demo_ref_create_primary',
                      name: '主角',
                      kind: 'person',
                      role: 'protagonist',
                      state: { emotion: '警觉' },
                    },
                {
                  action: secondaryReference ? 'reuse' : 'create',
                  id: secondaryReference?.ID,
                  client_id: 'demo_ref_place',
                  name: secondaryReference ? titleOfRecord(secondaryReference) : '公寓门口',
                  kind: secondaryReference ? String(secondaryReference.kind ?? 'place') : 'place',
                  role: 'location',
                  source_label: secondaryReference ? '项目共享' : undefined,
                },
              ],
              asset_slots: [
                existingSlot
                  ? {
                      action: 'reuse',
                      id: existingSlot.ID,
                      client_id: 'demo_slot_reuse',
                      name: titleOfRecord(existingSlot),
                      kind: String(existingSlot.kind ?? 'image'),
                      description: String(existingSlot.description ?? '复用已有参考素材。'),
                      priority: String(existingSlot.priority ?? 'normal'),
                      source_label: '已有素材槽',
                    }
                  : {
                      action: 'create',
                      client_id: 'demo_slot_reference',
                      name: '主角半身参考图',
                      kind: 'image',
                      description: '用于保持主角外观一致性。',
                      priority: 'high',
                    },
              ],
            },
            {
              action: 'create',
              client_id: 'demo_moment_new',
              title: '陌生信息触发行动',
              time_text: '同一时刻',
              location_text: '公寓走廊',
              action_text: '手机弹出未知号码短信，主角看向走廊尽头，决定追查。',
              mood: '悬疑推进',
              order: Number(existingMoment?.order ?? 1) + 1,
              status: 'draft',
              creative_references: [
                {
                  action: 'reuse',
                  id: existingReference?.ID,
                  client_id: 'demo_ref_reuse_secondary',
                  name: existingReference ? titleOfRecord(existingReference) : '主角',
                  kind: String(existingReference?.kind ?? 'person'),
                  role: 'protagonist',
                  source_label: existingReference ? '项目共享' : undefined,
                  state: { props: '手机', emotion: '疑惑' },
                },
                {
                  action: 'create',
                  client_id: 'demo_ref_prop_phone',
                  name: '未知短信',
                  kind: 'prop',
                  role: 'clue',
                },
              ],
              asset_slots: [
                {
                  action: 'create',
                  client_id: 'demo_slot_sms_closeup',
                  name: '手机短信特写参考',
                  kind: 'image',
                  description: '需要一张清晰手机屏幕特写，用于关键线索镜头。',
                  priority: 'critical',
                },
              ],
            },
          ],
        },
        {
          action: 'create',
          client_id: 'demo_segment_new',
          title: '追查线索',
          kind: 'emotional_function',
          summary: '新增一个承接开场悬念的编排段，先作为草稿进入生产包。',
          order: Number(existingSegment?.order ?? 1) + 1,
          status: 'draft',
          rationale: '原结构缺少从悬念到行动的过渡，因此建议补充一个短编排段。',
          scene_moments: [
            {
              action: 'create',
              client_id: 'demo_moment_follow',
              title: '走廊追查',
              time_text: '清晨',
              location_text: '公寓走廊',
              action_text: '主角沿走廊追查线索，发现电梯门即将关闭。',
              mood: '紧张加速',
              order: 1,
              status: 'draft',
              creative_references: [
                {
                  action: 'reuse',
                  id: existingReference?.ID,
                  client_id: 'demo_ref_follow',
                  name: existingReference ? titleOfRecord(existingReference) : '主角',
                  kind: String(existingReference?.kind ?? 'person'),
                  role: 'protagonist',
                  source_label: existingReference ? '项目共享' : undefined,
                },
              ],
              asset_slots: [
                {
                  action: 'create',
                  client_id: 'demo_slot_corridor',
                  name: '公寓走廊环境参考',
                  kind: 'image',
                  description: '用于统一走廊光线、空间和电梯位置。',
                  priority: 'normal',
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

function buildOrchestrationAnalysisPrompt(scriptText: string, productionId?: number, draftId?: string): string {
  const projectIdNote = productionId
    ? `当前制作 Production ID：${productionId}。`
    : ''
  const draftIdNote = draftId
    ? `当前 production_proposal 草稿 ID：${draftId}。所有 production_proposal 工具调用都必须显式带上 proposalRef 或 draftId = ${draftId}。`
    : '当前 production_proposal 草稿 ID 将由页面上下文提供。'
  return [
    `任务：对以下剧本进行递归、全面的制作编排分析。${projectIdNote}`,
    draftIdNote,
    '',
    '执行步骤（按顺序执行；只读 MCP 工具不可用时不要中止，必须基于页面提供的剧本文本和草稿壳继续写入 production_proposal 草稿）：',
    '',
    '1. 如果当前制作 Production ID 缺失或不确定，先调用 movscript_list_productions 列出当前项目的制作并选择目标制作。',
    '   - 参数：projectId（从上下文获取）',
    '   - 目的：避免基于错误制作 production 生成 proposal 草稿',
    '   - 如果该工具不可用，但上下文已提供 productionId，则使用已提供的 productionId 继续',
    '',
    '2. 调用 movscript_read_current_production 读取当前实际 production、已有草稿对比所需实体和剧本文本。',
    '   - 参数：projectId（从上下文获取）、productionId（从上下文获取）、includeScriptText: true',
    '   - 目的：了解真实 production 中已有的编排段、情节、设定资料、素材需求，以及下游制作细化结果；这些内容只读，不要直接修改',
    '   - 如果该工具不可用，则不要停止；基于本消息中的剧本文本和页面草稿上下文继续生成 proposal',
    '',
    '3. 调用 movscript_inspect_production_proposal_context 检查当前 production_proposal 草稿；如果页面还没有提供草稿壳，就等待页面先打开草稿上下文，不要自己新建。',
    '   - production_proposal 草稿是唯一写入目标，页面负责承接它',
    '   - UI 会比较草稿和当前实际 production，并在人工确认后再应用',
    '   - 如果本消息顶部提供了草稿 ID，调用 inspect、get、submit、upsert proposal 工具时都必须显式传 proposalRef 或 draftId',
    '   - 如果 inspect 返回 proposalRef/draftId，则必须用该 proposalRef/draftId 写入；不要因为只读 production 工具不可用而暂停',
    '',
    '4. 先在脑内完成整体分析，形成完整 proposal；在 submit 前必须调用 movscript_check_proposal_is_available 校验这棵 proposal。',
    '   - 如果校验返回 normalizedProposal，必须使用 normalizedProposal 继续 submit',
    '   - 禁止提交 action 为 reuse/update 但缺少数字 id 的节点；找不到已有 id 时必须改为 create',
    '   - 只有需要修补已有草稿中的少数节点时，才使用 movscript_upsert_proposal_* 细粒度工具',
    '   - 不要为每个节点单独调用工具后再 submit，一次 submit 应该覆盖完整审阅提案',
    '',
    '5. 基于剧本文本，按叙事节奏（情绪弧线、时空跳跃、节奏变化）拆分编排段。',
    '   - 编排段是剧集级的，不是简单段落分割',
    '   - 每个编排段：client_id（s1/s2...）、order、title、summary、source_range',
    '',
    '6. 对每个编排段，递归分析其内部情景（scene_moments）。',
    '   - 每个情景必须带 segment_id（指向编排段 client_id）',
    '   - 记录 time_text、location_text、action_text、mood',
    '',
    '7. 扫描全文提取设定资料（人物/地点/道具/产品/品牌/风格/世界规则）。',
    '   - 设定资料来自项目信息和当前 production，只读；草稿节点用 create/reuse/update 表达意图',
    '   - 建立关系：segment_ids、scene_moment_ids',
    '',
    '8. 基于设定资料和情景，推断素材需求（asset_slots）。',
    '   - 素材需求来自项目信息和当前 production，只读；草稿节点用 create/reuse/update 表达意图',
    '   - 每个素材需求必须有 owner_type 和对应 owner client_id',
    '',
    '9. 不要在编排 proposal 中生成 content_units、keyframes、台词终稿、运镜表或 prompt。',
    '   - 编排阶段只定情节、设定引用、连续性和素材诉求',
    '   - 如果需要给制作工作台提示表达方向，只写在 rationale、description 或 directing_intent 类说明字段',
    '',
    '10. 写入完成后，调用 movscript_get_production_proposal 或 movscript_list_production_proposal_nodes 复查草稿。',
    '   - 不要调用任何直接创建、更新、删除后端 project/production 实体的工具',
    '   - 如果接近工具调用上限，立刻 submit 当前完整 proposal，不要继续细粒度 upsert',
    '',
    '关系完整性要求：',
    '- scene_moment.segment_id → 必须指向有效的 segment client_id',
    '- asset_slot.owner_type + owner_id → 必须指向有效的 client_id',
    '',
    '剧本文本（如果 read_current_production 已返回剧本文本，以工具返回的为准）：',
    scriptText.length > 6000 ? scriptText.slice(0, 6000) + '\n...[剧本过长，已截断，请以工具读取的完整版本为准]' : scriptText,
  ].join('\n')
}

function buildProjectProposalAnalysisPrompt(input: {
  projectName: string
  productionName: string
  productionId: number
  draftId: string
  scriptVersionTitle: string
  scriptText: string
  projectSnapshot: {
    references: SemanticEntityRecord[]
    assetSlots: SemanticEntityRecord[]
    productions: SemanticEntityRecord[]
  }
  userPrompt: string
}) {
  const snapshot = {
    projectName: input.projectName,
    productionName: input.productionName,
    productionId: input.productionId,
    scriptVersionTitle: input.scriptVersionTitle,
    scriptTextPreview: input.scriptText.slice(0, 4000),
    referenceCount: input.projectSnapshot.references.length,
    assetSlotCount: input.projectSnapshot.assetSlots.length,
    productionCount: input.projectSnapshot.productions.length,
    references: input.projectSnapshot.references.slice(0, 60).map((item) => ({
      id: item.ID,
      name: titleOfRecord(item),
      kind: item.kind,
      status: item.status,
      description: item.description ?? item.summary ?? item.content ?? '',
    })),
    assetSlots: input.projectSnapshot.assetSlots.slice(0, 60).map((item) => ({
      id: item.ID,
      name: titleOfRecord(item),
      kind: item.kind,
      status: item.status,
      priority: item.priority,
      creative_reference_id: item.creative_reference_id,
      description: item.description ?? item.summary ?? item.content ?? '',
    })),
  }

  return [
    `你是项目提案助手。请基于当前制作和剧本，整理项目级设定与素材需求，并只写入本地 draft：${input.draftId}。`,
    '',
    buildProjectProposalDraftContractPrompt(input.draftId),
    '',
    '执行步骤：',
    '1. 如果上下文里 productionId 不明确，先读当前上下文；必要时列出 productions 再确认目标制作。',
    '2. 调用 movscript_read_current_production 或 movscript_build_orchestration_diff，提取当前制作、剧本、已有设定和素材需求。',
    '3. 先判断哪些设定资料可以复用、更新或合并，哪些素材需求是缺口。',
    '4. 只把会改变项目的操作写入 draft；纯复用既有设定/素材需求时，在 summary 或 impact_notes 说明，不要提交 reuse action。',
    '5. 只把项目级结论写入 draft，不要展开制作级结构，也不要写 operations。',
    '6. 提交前调用 movscript_validate_draft 检查。',
    '',
    input.userPrompt.trim() ? `用户补充要求：\n${input.userPrompt.trim()}` : '',
    '当前项目快照：',
    JSON.stringify(snapshot, null, 2),
  ].filter(Boolean).join('\n')
}

function attachProposalDraftMeta(content: ProposalDraftContent, draft: AgentDraft): ProposalDraftContent {
  return {
    ...content,
    draftId: draft.id,
    draftTitle: draft.title,
    draftUpdatedAt: draft.updatedAt,
  }
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
      title: toText(row.title) || `编排段 ${order}`,
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
      title: toText(row.title) || `情景 ${order}`,
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
      name: toText(row.name) || `设定资料 ${index + 1}`,
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
  const content_units: AIContentUnitCandidate[] = []

  for (const moment of scene_moments) {
    const segmentRefs = creative_references.filter((reference) => scriptText.includes(reference.name)).slice(0, 6)
    moment.creative_reference_ids = segmentRefs.map((reference) => reference.client_id)
    moment.asset_slot_ids = asset_slots.filter((slot) => slot.segment_id === moment.segment_id).map((slot) => slot.client_id)
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
      description: ref.description || `设定资料「${ref.name}」所需参考素材`,
      priority: ref.importance === 'high' ? 'high' : 'normal',
    })
  }
  return slots
}

function inferTitle(chunk: { text: string }, index: number): string {
  const explicit = chunk.text.match(/第[一二三四五六七八九十百千万\d]+[集场幕章][：:\s-]*([^\n。！？!?]{2,24})/)
  if (explicit?.[1]) return explicit[1].trim()
  const firstLine = chunk.text.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine ? summarizeText(firstLine, 24) : `编排段 ${index + 1}`
}

function inferMomentTitle(text: string, index: number): string {
  const location = inferLocationText(text)
  const action = summarizeText(text, 24)
  return location ? `${location}：${action}` : `情景 ${index + 1}`
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

type AnalysisPhase = 'input' | 'running' | 'done' | 'retryable' | 'error' | 'proposal'

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
  orchestrationPrompt,
  onOrchestrationPromptChange,
  nodeDecisions,
  onNodeDecisionsChange,
  onResult,
  onProposalDraft,
  externalProposalDraft,
  startAnalysisToken,
  onApplied,
  currentEntities,
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
  orchestrationPrompt: string
  onOrchestrationPromptChange: (value: string) => void
  nodeDecisions: ProposalNodeDecisions
  onNodeDecisionsChange: Dispatch<SetStateAction<ProposalNodeDecisions>>
  onResult: (result: AIAnalysisResult) => void
  onProposalDraft: (draft: ProposalDraftContent | null) => void
  externalProposalDraft: ProposalDraftContent | null
  startAnalysisToken: number
  onApplied: () => void
  currentEntities: ProposalConflictEntities
}) {
  const scriptVersionId = Number(production?.script_version_id) || 0

  const { data: allVersions, isLoading: loadingScript } = useQuery<ScriptVersion[]>({
    queryKey: ['script-versions-for-orchestrate', projectId],
    queryFn: () => listScriptVersions(projectId!),
    enabled: !!projectId && !!scriptVersionId,
  })
  const linkedVersion = allVersions?.find((v) => v.ID === scriptVersionId) ?? null
  const linkedScriptText = (linkedVersion?.content || linkedVersion?.raw_source || '').trim()
  const scopedLinkedScriptText = scopeScriptTextForProduction(linkedScriptText, production, linkedVersion?.title)

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
  const [proposalDraft, setProposalDraft] = useState<ProposalDraftContent | null>(null)
  const agentClientRef = useRef(localAgentClient)
  const orchestrationToolCleanupRef = useRef<(() => void) | null>(null)
  const lastStartTokenRef = useRef(0)

  // When switching to manual mode, pre-fill with linked version content
  useEffect(() => {
    if (manualMode && linkedVersion && !scriptText) {
      setScriptText(linkedVersion.content || linkedVersion.raw_source || '')
    }
  }, [manualMode, linkedVersion])

  useEffect(() => {
    return () => orchestrationToolCleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (!externalProposalDraft) return
    setProposalDraft(externalProposalDraft)
    setPhase('proposal')
  }, [externalProposalDraft])

  const activeProposalDraft = externalProposalDraft ?? proposalDraft

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
    setProposalDraft(null)
    onProposalDraft(null)
    onNodeDecisionsChange({})

    const client = agentClientRef.current
    const productionId = production?.ID ?? 0
    const requestId = `production_orchestrate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

    const displayMessage = [
      `请执行制作编排分析：${production?.name ?? `#${productionId}`}`,
      `完整剧本文本已通过运行输入发送（${text.trim().length} 字符），面板仅展示摘要以避免冻结。`,
    ].join('\n')

    try {
      const pageKey = buildPageKey({
        route: { pathname: '/production-orchestrate', search: `?productionId=${productionId}` },
        projectId,
        productionId,
        selection: production?.ID
          ? { entityType: 'production', entityId: production.ID, label: String(production.name ?? `制作 #${production.ID}`) }
          : null,
        labels: ['production-orchestrate'],
      })
      const existingProposalDrafts = await client.listDrafts({ projectId, kind: 'production_proposal', status: 'draft', pageKey, limit: 1 })
      const draftShell = existingProposalDrafts.drafts[0] ?? await localAgentClient.createDraft({
        projectId,
        kind: 'production_proposal',
        title: `制作编排草稿 - ${production?.name ?? `#${productionId}`}`,
        content: JSON.stringify({
          productionId,
          analysisScope: 'production',
          proposal: { segments: [] },
          proposedAt: new Date().toISOString(),
        }, null, 2),
        source: {
          entityType: 'production',
          entityId: productionId,
          pageKey,
          pageType: 'production_orchestrate',
          pageRoute: `/production-orchestrate?productionId=${productionId}`,
          pageEntityType: 'production',
          pageEntityId: productionId,
        },
        metadata: {
          pageOwned: true,
          analysisScope: 'production',
          productionId,
        },
      })

      const analysisPrompt = buildOrchestrationAnalysisPrompt(
        [text.trim(), orchestrationPrompt.trim() ? `\n\n用户补充要求：\n${orchestrationPrompt.trim()}` : ''].filter(Boolean).join(''),
        productionId,
        draftShell.id,
      )

      setReceivedData({
        message: text.trim(),
        context: {
          projectId,
          productionId,
          requestId,
          scriptVersionId: scriptVersionId || undefined,
          promptLength: analysisPrompt.length,
          userPrompt: orchestrationPrompt.trim() || undefined,
          mode: 'dialog-tool-driven',
        },
      })

      orchestrationToolCleanupRef.current?.()
      orchestrationToolCleanupRef.current = registerAgentPanelPageTool(requestId, async (payload) => {
        if (payload.status === 'error') {
          setErrorMsg(payload.error || '分析失败')
          setPhase('retryable')
          return
        }
        if (payload.status === 'cancelled') {
          setErrorMsg('分析已停止')
          setPhase('retryable')
          return
        }

        const finalRun = payload.run
        const finalThread = payload.thread
        if (!finalRun || !finalThread) {
          return
        }
        setAgentRun(finalRun)

        if (finalRun.status === 'failed') {
          setErrorMsg(finalRun.error || 'Agent 运行失败')
          setPhase('retryable')
          return
        }

        // Try to read the proposal draft written by the agent via draft-only proposal tools.
        const proposalResult = await tryReadProposalDraft(client, projectId, productionId)
        if (proposalResult.kind === 'tree' && proposalResult.draft) {
          setProposalDraft(proposalResult.draft)
          onProposalDraft(proposalResult.draft)
          setPhase('proposal')
          return
        }
        if (proposalResult.kind === 'flat' && proposalResult.result) {
          setOutputResult(proposalResult.result)
          setPhase('done')
          onResult(proposalResult.result)
          return
        }

        // Fallback: parse assistant message content as JSON (old behavior)
        const assistantMsg = finalThread.messages.find((message) => message.id === finalRun.assistantMessageId)
          ?? [...finalThread.messages].reverse().find((m) => m.role === 'assistant')
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

        setErrorMsg('当前对话还没有产生可渲染的结构化提案。请在 AI 面板继续发起编排。')
        setPhase('retryable')
      })

      openAgentPanelDraft({
        requestId,
        taskType: 'production_orchestration',
        message: displayMessage,
        title: `制作编排: ${production?.name ?? `#${productionId}`}`,
        mode: 'create',
        newConversation: true,
        autoSend: true,
        projectId,
        clientInput: buildCommandFirstClientInput({
          message: analysisPrompt,
          labels: ['production-orchestrate', 'recursive-analysis', 'tool-driven', 'page-tool-render'],
          hints: {
            projectId,
            productionId,
            draftId: draftShell.id,
            route: {
              pathname: '/production-orchestrate',
              search: `?productionId=${productionId}`,
            },
            selection: production?.ID
              ? { entityType: 'production', entityId: production.ID, label: String(production.name ?? `制作 #${production.ID}`) }
              : null,
          },
        }),
        agentManifest: ORCHESTRATE_AGENT_MANIFEST,
        runPolicy: { maxToolCalls: 80, maxIterations: 40 },
        renderMode: 'page',
      })
      toast.info('已打开制作编排会话，请到 AI 面板生成提案，再回到编排面板逐项应用')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '分析失败')
      setPhase('error')
    }
  }

  async function tryReadProposalDraft(
    client: typeof localAgentClient,
    projectId: number | undefined,
    productionId: number,
  ): Promise<{ kind: 'tree'; draft: ProposalDraftContent } | { kind: 'flat'; result: AIAnalysisResult } | { kind: 'none' }> {
    if (!projectId) return { kind: 'none' }
    try {
      const pageKey = buildPageKey({
        route: { pathname: '/production-orchestrate', search: `?productionId=${productionId}` },
        projectId,
        productionId,
        selection: { entityType: 'production', entityId: productionId, label: `制作 #${productionId}` },
        labels: ['production-orchestrate'],
      })
      // First check for tree-form production_proposal drafts
      const { drafts: proposalDrafts } = await client.listDrafts({ projectId, kind: 'production_proposal', status: 'draft', pageKey, limit: 5 })
      const treeDraft = proposalDrafts
        .filter((d) => {
          try {
            const content = JSON.parse(d.content)
            return content.productionId === productionId && content.proposal
          } catch {
            return false
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

      if (treeDraft) {
        const content = attachProposalDraftMeta(JSON.parse(treeDraft.content) as ProposalDraftContent, treeDraft)
        return { kind: 'tree', draft: content }
      }

      // Fallback: check for legacy flat pipeline drafts
      const { drafts } = await client.listDrafts({ projectId, kind: 'pipeline', status: 'draft', pageKey, limit: 5 })
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

      if (!proposal) return { kind: 'none' }

      const content = JSON.parse(proposal.content)
      const candidates = content.candidates
      if (!candidates) return { kind: 'none' }

      const result = normalizeAIAnalysisResult(candidates)
      if (!result) return { kind: 'none' }
      return { kind: 'flat', result }
    } catch {
      return { kind: 'none' }
    }
  }

  const effectiveText = getAnalysisText({ scope: 'production', entityId: null }, {
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

  useEffect(() => {
    if (!startAnalysisToken || startAnalysisToken === lastStartTokenRef.current) return
    lastStartTokenRef.current = startAnalysisToken
    void startAnalysis(effectiveText)
  }, [effectiveText, startAnalysisToken])

  const pendingTotal = Object.values(pendingCounts).reduce((sum, count) => sum + count, 0)
  const outputCounts = {
    segments: guideCounts.segments + pendingCounts.segments,
    sceneMoments: guideCounts.scene_moments + pendingCounts.scene_moments,
    creativeReferences: guideCounts.creative_references + pendingCounts.creative_references,
    assetSlots: guideCounts.asset_slots + pendingCounts.asset_slots,
    contentUnits: guideCounts.content_units + pendingCounts.content_units,
  }

  return (
    <aside className="flex h-full min-h-0 w-[420px] shrink-0 flex-col border-l border-border bg-card">
      {/* Sidebar header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">编排面板</span>
          {phase === 'running' && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
          {phase === 'done' && <CheckCircle2 size={12} className="text-emerald-500" />}
          {phase === 'error' && <AlertCircle size={12} className="text-rose-500" />}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border px-4 py-3">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">
              {production ? String(production.name ?? `制作 #${production.ID}`) : '未选择制作'}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              AI 面板负责生成提案，这里只做逐项审阅和写入。
            </p>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <Wand2 size={14} className="text-primary" />
              <p className="text-xs font-semibold text-foreground">编排要求</p>
            </div>
            <Textarea
              className="mt-2 min-h-24 resize-none text-xs leading-relaxed"
              placeholder="补充你希望 AI 遵循的要求，例如：重点补齐缺失情景；保留原编排段名称；素材需求只占位不锁定资源。"
              value={orchestrationPrompt}
              onChange={(event) => onOrchestrationPromptChange(event.target.value)}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              这里用于再次编排时补充约束，不区分编排段分析、情景分析、素材分析等子功能。
            </p>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <CheckCheck size={14} className="text-primary" />
              <p className="text-xs font-semibold text-foreground">当前结构</p>
            </div>
            <p className="mt-2 text-base font-semibold text-foreground">结构统计</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              当前制作包中的结构数量，包含已存在内容和待审候选。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ContextLine icon={GitBranch} label="编排段" value={`${outputCounts.segments}`} />
              <ContextLine icon={Route} label="情景" value={`${outputCounts.sceneMoments}`} />
              <ContextLine icon={Sparkles} label="设定资料" value={`${outputCounts.creativeReferences}`} />
              <ContextLine icon={PackageCheck} label="素材需求" value={`${outputCounts.assetSlots}`} />
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
                <p className="text-xs font-semibold text-foreground">重新发起编排</p>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                可在任意阶段重新整理剧本，新的提案会进入待审状态；已采纳的内容不会被覆盖。
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
                  {scopedLinkedScriptText.text.slice(0, 200)}…
                </p>
                {scopedLinkedScriptText.scoped && (
                  <p className="mt-2 rounded bg-primary/5 px-2 py-1.5 text-[10px] leading-4 text-primary">
                    将发送第 {scopedLinkedScriptText.episodeOrder} 集制作文本：{scopedLinkedScriptText.text.length} 字符，原版本 {(linkedVersion.content || linkedVersion.raw_source).length} 字符。
                  </p>
                )}
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
                  placeholder="粘贴剧本内容，向导会先拆编排段，再补设定资料、情景和素材需求。"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        {/* Proposal review phase */}
        {phase === 'proposal' && activeProposalDraft && (
          <ProposalReviewPanel
            projectId={projectId}
            proposalDraft={activeProposalDraft}
            currentEntities={currentEntities}
            nodeDecisions={nodeDecisions}
            onNodeDecisionsChange={onNodeDecisionsChange}
            onAccepted={() => { setPhase('input'); setProposalDraft(null); onProposalDraft(null) }}
            onDiscard={() => { setPhase('input'); setProposalDraft(null); onProposalDraft(null) }}
            onApplied={onApplied}
          />
        )}

        {/* Running / done / error */}
        {phase !== 'input' && phase !== 'proposal' && (
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

            {/* Retryable / error bubble */}
            {(phase === 'retryable' || phase === 'error') && (
              <div className={cn(
                'flex items-start gap-2 rounded-lg border p-3',
                phase === 'retryable'
                  ? 'border-amber-200 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-950/30'
                  : 'border-rose-200 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/30',
              )}>
                <AlertCircle size={13} className={cn('mt-0.5 shrink-0', phase === 'retryable' ? 'text-amber-500' : 'text-rose-500')} />
                <div className="flex flex-col gap-1.5 min-w-0">
                  <p className={cn('text-xs', phase === 'retryable' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300')}>{errorMsg}</p>
                  {rawAgentResponse && (
                    <pre className={cn(
                      'whitespace-pre-wrap break-all rounded p-2 text-[10px] max-h-48 overflow-y-auto',
                      phase === 'retryable'
                        ? 'bg-amber-100/60 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                        : 'bg-rose-100/60 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
                    )}>
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
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">结构化结果已生成，可继续逐项审阅。</p>
                </div>
                {outputResult && (
                  <div className="mt-2 grid grid-cols-5 gap-1.5 text-center text-[10px] text-emerald-700 dark:text-emerald-300">
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">编排段 {outputResult.segments.length}</span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">情景 {outputResult.scene_moments.length}</span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">设定资料 {outputResult.creative_references.length}</span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">素材需求 {outputResult.asset_slots.length}</span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-1">单元 {outputResult.content_units.length}</span>
                  </div>
                )}
                {rawAgentResponse && (
                  <p className="mt-2 text-[10px] leading-4 text-emerald-700/80 dark:text-emerald-300/80">
                    原始回复未直接作为结构化结果使用，页面已整理为可审阅内容。
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
            {phase === 'retryable' && '需要重试'}
            {phase === 'error' && '分析失败'}
            {phase === 'proposal' && '待审提案'}
          </p>
          <div className="flex gap-2">
            {(phase === 'retryable' || phase === 'error') && (
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
                  发给 AI 面板
                </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

function ProposalReviewPanel({
  projectId,
  proposalDraft,
  currentEntities,
  nodeDecisions,
  onNodeDecisionsChange,
  previewOnly = false,
  onAccepted,
  onDiscard,
  onApplied,
}: {
  projectId?: number
  proposalDraft: ProposalDraftContent
  currentEntities: ProposalConflictEntities
  nodeDecisions: ProposalNodeDecisions
  onNodeDecisionsChange: Dispatch<SetStateAction<ProposalNodeDecisions>>
  previewOnly?: boolean
  onAccepted: () => void
  onDiscard: () => void
  onApplied: () => void
}) {
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [appliedCounts, setAppliedCounts] = useState<Record<string, number> | null>(null)
  const [simulationResult, setSimulationResult] = useState<ProposalSimulationResult | null>(null)
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(() => new Set(['demo_segment_existing', 'demo_segment_new']))
  const [reviewTab, setReviewTab] = useState<ProposalReviewTab>('structure')
  const segments = proposalDraft.proposal?.segments ?? []
  const replacementPreview = useMemo(
    () => buildProposalReplacementPreview(proposalDraft, currentEntities),
    [currentEntities, proposalDraft],
  )
  const proposalContext = useMemo(() => collectProposalContextResources(segments), [segments])
  const totalSceneMoments = segments.reduce((s, seg) => s + (seg.scene_moments?.length ?? 0), 0)
  const totalContentUnits = segments.reduce((s, seg) =>
    s + (seg.scene_moments ?? []).reduce((ss, sm) => ss + (sm.content_units?.length ?? 0), 0), 0)
  const totalCreativeRefs = segments.reduce((s, seg) =>
    s + (seg.scene_moments ?? []).reduce((ss, sm) => ss + (sm.creative_references?.length ?? 0), 0), 0)
  const totalAssetSlots = segments.reduce((s, seg) =>
    s + (seg.scene_moments ?? []).reduce((ss, sm) => ss + (sm.asset_slots?.length ?? 0), 0), 0)
  const totalKeyframes = segments.reduce((s, seg) =>
    s + (seg.scene_moments ?? []).reduce((ss, sm) =>
      ss + (sm.keyframes?.length ?? 0) + (sm.content_units ?? []).reduce((sss, unit) => sss + (unit.keyframes?.length ?? 0), 0), 0), 0)
  const reviewNodes = useMemo(() => collectProposalReviewNodes(segments), [segments])
  const actionCounts = useMemo(() => countProposalActions(segments), [segments])
  const acceptedCount = reviewNodes.filter((node) => nodeDecisions[node.key] === 'accepted').length
  const rejectedCount = reviewNodes.filter((node) => nodeDecisions[node.key] === 'rejected').length
  const reviewedCount = acceptedCount + rejectedCount
  const reviewProgress = reviewNodes.length > 0 ? Math.round((reviewedCount / reviewNodes.length) * 100) : 0
  const unresolvedCount = Math.max(0, reviewNodes.length - reviewedCount)

  function toggleSegment(key: string) {
    setExpandedSegments((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setNodeDecision(key: string, decision: 'accepted' | 'rejected') {
    setSimulationResult(null)
    onNodeDecisionsChange((prev) => ({ ...prev, [key]: decision }))
  }

  function setNodeDecisions(keys: string[], decision: 'accepted' | 'rejected') {
    setSimulationResult(null)
    onNodeDecisionsChange((prev) => {
      const next = { ...prev }
      for (const key of keys) next[key] = decision
      return next
    })
  }

  function acceptAllNodes() {
    setSimulationResult(null)
    onNodeDecisionsChange(Object.fromEntries(reviewNodes.map((node) => [node.key, 'accepted'])))
  }

  function resetNodeDecisions() {
    setSimulationResult(null)
    setApplyError('')
    onNodeDecisionsChange({})
  }

  function buildAcceptedProposal() {
    const acceptedSegments = segments.flatMap((segment, index) => {
      const segmentKey = proposalNodeDecisionKey('segment', segment, String(index))
      if (nodeDecisions[segmentKey] !== 'accepted') return []
      const segmentId = proposalNodeIdentity(segment, String(index))
      return [{
        ...segment,
        scene_moments: (segment.scene_moments ?? []).flatMap((moment, momentIndex) => {
          const momentFallback = `${segmentId}-${momentIndex}`
          if (nodeDecisions[proposalNodeDecisionKey('scene_moment', moment, momentFallback)] !== 'accepted') return []
          return [{
            ...moment,
            creative_references: (moment.creative_references ?? []).filter((reference, referenceIndex) =>
              nodeDecisions[proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)] === 'accepted',
            ),
            asset_slots: (moment.asset_slots ?? []).filter((slot, slotIndex) =>
              nodeDecisions[proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)] === 'accepted',
            ),
            keyframes: (moment.keyframes ?? []).filter((keyframe, keyframeIndex) =>
              nodeDecisions[proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)] === 'accepted',
            ),
            content_units: (moment.content_units ?? []).flatMap((unit, unitIndex) => {
              const unitFallback = `${momentFallback}-unit-${unitIndex}`
              if (nodeDecisions[proposalNodeDecisionKey('content_unit', unit, unitFallback)] !== 'accepted') return []
              return [{
                ...unit,
                keyframes: (unit.keyframes ?? []).filter((keyframe, keyframeIndex) =>
                  nodeDecisions[proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)] === 'accepted',
                ),
              }]
            }),
          }]
        }),
      }]
    })
    return buildProposalReplacementPreview({ ...proposalDraft, proposal: { segments: acceptedSegments } }, currentEntities).proposal
  }

  function buildSimulationResult() {
    const proposal = buildAcceptedProposal()
    const counts = {
      segments_created: 0,
      scene_moments_created: 0,
      content_units_created: 0,
      asset_slots_created: 0,
      keyframes_created: 0,
      creative_references_created: 0,
      creative_reference_usages: 0,
    }
    const actions = { create: 0, reuse: 0, update: 0 }
    const addAction = (action?: string) => {
      if (action === 'reuse') actions.reuse += 1
      else if (action === 'update') actions.update += 1
      else actions.create += 1
    }

    for (const segment of proposal.segments) {
      addAction(segment.action)
      if (segment.action === 'create') counts.segments_created += 1
      for (const moment of segment.scene_moments ?? []) {
        addAction(moment.action)
        if (moment.action === 'create') counts.scene_moments_created += 1
        for (const reference of moment.creative_references ?? []) {
          addAction(reference.action)
          counts.creative_reference_usages += 1
          if (reference.action === 'create') counts.creative_references_created += 1
        }
        for (const slot of moment.asset_slots ?? []) {
          addAction(slot.action)
          if (slot.action === 'create') counts.asset_slots_created += 1
        }
        for (const unit of moment.content_units ?? []) {
          addAction(unit.action)
          if (unit.action === 'create') counts.content_units_created += 1
          for (const keyframe of unit.keyframes ?? []) {
            addAction(keyframe.action)
            if (keyframe.action === 'create') counts.keyframes_created += 1
          }
        }
        for (const keyframe of moment.keyframes ?? []) {
          addAction(keyframe.action)
          if (keyframe.action === 'create') counts.keyframes_created += 1
        }
      }
    }

    return {
      acceptedNodes: reviewNodes.filter((node) => nodeDecisions[node.key] === 'accepted').length,
      rejectedNodes: reviewNodes.filter((node) => nodeDecisions[node.key] === 'rejected').length,
      unresolvedNodes: Math.max(0, reviewNodes.length - reviewNodes.filter((node) => nodeDecisions[node.key] === 'accepted' || nodeDecisions[node.key] === 'rejected').length),
      counts,
      actions,
    }
  }

  function handleSimulate() {
    setApplyError('')
    setSimulationResult(buildSimulationResult())
  }

  async function handleApply() {
    if (!projectId) return
    if (previewOnly) {
      handleSimulate()
      return
    }
    const proposal = buildAcceptedProposal()
    if (proposal.segments.length === 0) {
      setApplyError('请至少接受一个段落后再写入项目')
      return
    }
    const missingId = findProposalActionMissingId(proposal)
    if (missingId) {
      setApplyError(`${missingId.label} 设置为 ${missingId.action}，但缺少已有实体 ID。请重新生成或改为新建后再写入。`)
      return
    }
    setApplying(true)
    setApplyError('')
    try {
      const result = await applyProductionProposal(projectId, {
        production_id: proposalDraft.productionId,
        analysis_scope: proposalDraft.analysisScope ?? 'production',
        proposal,
      })
      if (proposalDraft.draftId) {
        await localAgentClient.updateDraft(proposalDraft.draftId, {
          status: 'applied',
          metadata: {
            appliedFrom: 'production-orchestrate-page',
            appliedAt: new Date().toISOString(),
            appliedCounts: result.counts as unknown as Record<string, unknown>,
          },
        }).catch(() => undefined)
      }
      setAppliedCounts(result.counts as unknown as Record<string, number>)
      onApplied()
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : '写入失败')
    } finally {
      setApplying(false)
    }
  }

  if (appliedCounts) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">提案已写入项目</p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] text-emerald-700 dark:text-emerald-300">
            {appliedCounts.segments_created > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">编排段 +{appliedCounts.segments_created}</span>
            )}
            {appliedCounts.scene_moments_created > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">情景 +{appliedCounts.scene_moments_created}</span>
            )}
            {appliedCounts.content_units_created > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">单元 +{appliedCounts.content_units_created}</span>
            )}
            {appliedCounts.creative_references_created > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">设定资料 +{appliedCounts.creative_references_created}</span>
            )}
            {appliedCounts.asset_slots_created > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">素材需求 +{appliedCounts.asset_slots_created}</span>
            )}
            {appliedCounts.keyframes_created > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">关键帧 +{appliedCounts.keyframes_created}</span>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAccepted}>
          完成
        </Button>
      </div>
    )
  }

  if (simulationResult) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            <Eye size={13} className="shrink-0 text-emerald-500" />
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">模拟写入已生成</p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-emerald-700/80 dark:text-emerald-300/80">
            本次预览仅基于当前接受/删除决策计算，不会提交到项目。
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">已接受 {simulationResult.acceptedNodes}</span>
            <span className="rounded bg-rose-500/10 px-1.5 py-1">已删除 {simulationResult.rejectedNodes}</span>
            <span className="rounded bg-muted px-1.5 py-1">未审 {simulationResult.unresolvedNodes}</span>
            <span className="rounded bg-muted px-1.5 py-1">创建 {simulationResult.actions.create}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] text-emerald-700 dark:text-emerald-300">
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">编排段 +{simulationResult.counts.segments_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">情景 +{simulationResult.counts.scene_moments_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">制作项 +{simulationResult.counts.content_units_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">设定资料 +{simulationResult.counts.creative_references_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">素材需求 +{simulationResult.counts.asset_slots_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">关键帧 +{simulationResult.counts.keyframes_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">引用 +{simulationResult.counts.creative_reference_usages}</span>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSimulationResult(null)}>
          返回审阅
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Summary */}
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-primary" />
          <p className="text-xs font-semibold text-foreground">制作提案</p>
          {proposalDraft.proposedAt && <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">已加载提案</Badge>}
        </div>
        {proposalDraft.summary && (
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{proposalDraft.summary}</p>
        )}
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">编排段 {segments.length}</span>
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">情景 {totalSceneMoments}</span>
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">单元 {totalContentUnits}</span>
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">设定资料 {totalCreativeRefs}</span>
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">素材需求 {totalAssetSlots}</span>
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">关键帧 {totalKeyframes}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-foreground">审阅进度</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{reviewedCount}/{reviewNodes.length} 个提案节点已决策</p>
          </div>
          <Badge variant={unresolvedCount > 0 ? 'warning' : 'success'} className="h-5 rounded-full px-2 text-[10px]">
            {unresolvedCount > 0 ? `${unresolvedCount} 待处理` : '可写入'}
          </Badge>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${reviewProgress}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px]">
          <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">接受 {acceptedCount}</span>
          <span className="rounded bg-rose-500/10 px-1.5 py-1 text-rose-700 dark:text-rose-300">删除 {rejectedCount}</span>
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">未审 {unresolvedCount}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={acceptAllNodes}>
            全部接受
          </Button>
          <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={resetNodeDecisions}>
            清空决策
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 rounded-lg bg-muted p-1">
        <ProposalTabButton active={reviewTab === 'structure'} icon={LayoutList} label="结构" onClick={() => setReviewTab('structure')} />
        <ProposalTabButton active={reviewTab === 'context'} icon={Sparkles} label="依据" onClick={() => setReviewTab('context')} />
        <ProposalTabButton active={reviewTab === 'impact'} icon={Target} label="影响" onClick={() => setReviewTab('impact')} />
      </div>

      {reviewTab === 'impact' && (
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <Target size={13} className="text-primary" />
          <p className="text-xs font-semibold text-foreground">写入影响</p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
          <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">新建 {actionCounts.create}</span>
          <span className="rounded bg-blue-500/10 px-1.5 py-1 text-blue-700 dark:text-blue-300">复用 {actionCounts.reuse}</span>
          <span className="rounded bg-amber-500/10 px-1.5 py-1 text-amber-700 dark:text-amber-300">更新 {actionCounts.update}</span>
        </div>
        {replacementPreview.replaced.segments + replacementPreview.replaced.sceneMoments + replacementPreview.replaced.creativeReferences + replacementPreview.replaced.assetSlots + replacementPreview.replaced.contentUnits > 0 && (
          <p className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
            检测到同名现有条目，应用时会替换：编排段 {replacementPreview.replaced.segments}、情景 {replacementPreview.replaced.sceneMoments}、设定资料 {replacementPreview.replaced.creativeReferences}、素材需求 {replacementPreview.replaced.assetSlots}、制作项 {replacementPreview.replaced.contentUnits}。
          </p>
        )}
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          复用节点引用项目级设定资料或已有素材需求；更新节点会进入二次确认语义，避免直接覆盖已确认内容。
        </p>
      </div>
      )}

      {/* Tree */}
      {reviewTab === 'structure' && (
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-3 py-2">
          <span className="text-[11px] font-medium text-foreground">提案结构</span>
        </div>
        <div className="divide-y divide-border">
          {segments.map((seg, i) => {
            const key = proposalNodeIdentity(seg, String(i))
            const segmentDecisionKey = proposalNodeDecisionKey('segment', seg, String(i))
            const expanded = expandedSegments.has(key)
            const smCount = seg.scene_moments?.length ?? 0
            const decision = nodeDecisions[segmentDecisionKey]
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggleSegment(key)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40',
                    decision === 'rejected' && 'opacity-50',
                  )}
                >
                  <ActionBadge action={seg.action} />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                    {seg.title || `编排段 ${i + 1}`}
                  </span>
                  {decision && <DecisionBadge decision={decision} />}
                  <span className="shrink-0 text-[10px] text-muted-foreground">{smCount} 情景</span>
                  {smCount > 0 && (
                    <span className="shrink-0 text-muted-foreground">
                      {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </span>
                  )}
                </button>
                {(expanded || smCount === 0) && (
                  <div className="border-t border-border bg-muted/20">
                    <div className="border-b border-border/50 px-6 py-2">
                      {(seg.summary || seg.rationale) && (
                        <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{seg.rationale || seg.summary}</p>
                      )}
                      {seg.action === 'update' && Boolean(seg.before?.title) && (
                        <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">原标题：{String(seg.before?.title)}</p>
                      )}
                      <div className="mt-2 flex gap-1.5">
                        <Button size="sm" variant={decision === 'accepted' ? 'secondary' : 'outline'} className="h-6 px-2 text-[10px]" onClick={() => setNodeDecisions(collectSegmentProposalReviewNodes(seg, i).map((node) => node.key), 'accepted')}>
                          接受段落
                        </Button>
                        <Button size="sm" variant={decision === 'rejected' ? 'secondary' : 'ghost'} className="h-6 px-2 text-[10px]" onClick={() => setNodeDecisions(collectSegmentProposalReviewNodes(seg, i).map((node) => node.key), 'rejected')}>
                          删除段落
                        </Button>
                      </div>
                    </div>
                    {(seg.scene_moments ?? []).map((sm, j) => {
                      const smFallback = `${key}-${j}`
                      const smKey = proposalNodeIdentity(sm, smFallback)
                      const cuCount = sm.content_units?.length ?? 0
                      const refCount = sm.creative_references?.length ?? 0
                      const slotCount = sm.asset_slots?.length ?? 0
                      const keyframeCount = (sm.keyframes?.length ?? 0) + (sm.content_units ?? []).reduce((sum, unit) => sum + (unit.keyframes?.length ?? 0), 0)
                      const smDecision = nodeDecisions[proposalNodeDecisionKey('scene_moment', sm, smFallback)]
                      return (
                        <div key={smKey} className={cn('border-b border-border/50 px-3 py-2 last:border-b-0', smDecision === 'rejected' && 'opacity-50')}>
                          <div className="flex items-center gap-2">
                            <span className="w-3 shrink-0" />
                            <ActionBadge action={sm.action} />
                            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                              {sm.title || `情景 ${j + 1}`}
                            </span>
                            {smDecision && <DecisionBadge decision={smDecision} />}
                            {cuCount > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{cuCount} 单元</span>}
                            {keyframeCount > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{keyframeCount} 关键帧</span>}
                          </div>
                          {(sm.time_text || sm.location_text) && (
                            <p className="ml-8 mt-0.5 truncate text-[10px] text-muted-foreground">
                              {[sm.time_text, sm.location_text].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {sm.action === 'update' && Boolean(sm.before?.action_text) && (
                            <p className="ml-8 mt-1 line-clamp-1 text-[10px] text-amber-700 dark:text-amber-300">
                              原动作：{String(sm.before?.action_text)}
                            </p>
                          )}
                          {(refCount > 0 || slotCount > 0 || keyframeCount > 0) && (
                            <div className="ml-8 mt-2 flex flex-wrap gap-1.5">
                              {(sm.creative_references ?? []).slice(0, 4).map((ref, index) => (
                                <span key={`${smKey}-ref-${ref.client_id ?? index}`} className="inline-flex max-w-full items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  <ActionBadge action={ref.action} compact />
                                  <span className="truncate">{ref.name || '设定资料'}</span>
                                  {ref.source_label && <span className="text-blue-600 dark:text-blue-400">{ref.source_label}</span>}
                                </span>
                              ))}
                              {(sm.asset_slots ?? []).slice(0, 3).map((slot, index) => (
                                <span key={`${smKey}-slot-${slot.client_id ?? index}`} className="inline-flex max-w-full items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  <PackageCheck size={10} />
                                  <span className="truncate">{slot.name || '素材需求'}</span>
                                </span>
                              ))}
                              {(sm.keyframes ?? []).slice(0, 3).map((keyframe, index) => (
                                <span key={`${smKey}-keyframe-${keyframe.client_id ?? index}`} className="inline-flex max-w-full items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  <ImageIcon size={10} />
                                  <span className="truncate">{keyframe.title || '关键帧'}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="ml-8 mt-2 flex gap-1.5">
                            <Button size="sm" variant={smDecision === 'accepted' ? 'secondary' : 'outline'} className="h-6 px-2 text-[10px]" onClick={() => setNodeDecisions(collectSceneProposalReviewNodes(sm, smFallback).map((node) => node.key), 'accepted')}>
                              接受
                            </Button>
                            <Button size="sm" variant={smDecision === 'rejected' ? 'secondary' : 'ghost'} className="h-6 px-2 text-[10px]" onClick={() => setNodeDecisions(collectSceneProposalReviewNodes(sm, smFallback).map((node) => node.key), 'rejected')}>
                              删除
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      )}

      {reviewTab === 'context' && (
        <ProposalContextPanel
          context={proposalContext}
          decisions={nodeDecisions}
          onSetDecision={setNodeDecision}
        />
      )}

      {applyError && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-800/50 dark:bg-rose-950/30">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{applyError}</p>
        </div>
      )}

      <div className={cn('sticky bottom-0 -mx-4 -mb-4 grid gap-2 border-t border-border bg-card/95 p-3 backdrop-blur', previewOnly ? 'grid-cols-2' : 'grid-cols-3')}>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={applying}
          onClick={previewOnly ? resetNodeDecisions : onDiscard}
        >
          {previewOnly ? '清空决策' : '丢弃'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={applying}
          onClick={handleSimulate}
        >
          <Eye size={11} />
          模拟写入
        </Button>
        {!previewOnly && (
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={applying || !projectId}
            onClick={handleApply}
          >
            {applying ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            写入项目
          </Button>
        )}
      </div>
    </div>
  )
}

function ActionBadge({ action, compact = false }: { action: 'create' | 'reuse' | 'update' | string | undefined; compact?: boolean }) {
  const cls = compact ? 'px-1 py-0 text-[9px]' : 'px-1 py-0.5 text-[9px]'
  if (action === 'reuse') {
    return <span className={cn('shrink-0 rounded bg-blue-500/10 font-medium text-blue-600 dark:text-blue-400', cls)}>复用</span>
  }
  if (action === 'update') {
    return <span className={cn('shrink-0 rounded bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400', cls)}>更新</span>
  }
  return <span className={cn('shrink-0 rounded bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400', cls)}>新建</span>
}

function DecisionBadge({ decision }: { decision: 'accepted' | 'rejected' }) {
  return (
    <span className={cn(
      'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium',
      decision === 'accepted'
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    )}>
      {decision === 'accepted' ? '已接受' : '已删除'}
    </span>
  )
}

function ProposalTabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

function nodeDecisionKey(type: string, id: string) {
  return `${type}:${id}`
}

function proposalNodeIdentity(node: { client_id?: string; id?: number }, fallback: string) {
  return node.client_id ?? (node.id ? String(node.id) : fallback)
}

function proposalNodeDecisionKey(type: string, node: { client_id?: string; id?: number }, fallback: string) {
  return nodeDecisionKey(type, proposalNodeIdentity(node, fallback))
}

interface ProposalReviewNode {
  key: string
  action: string
}

interface ProposalContextItem {
  nodeKey: string
  action?: string
  title: string
  detail: string
  parent: string
}

interface ProposalContextResources {
  creativeReferences: ProposalContextItem[]
  assetSlots: ProposalContextItem[]
  contentUnits: ProposalContextItem[]
  keyframes: ProposalContextItem[]
}

function collectProposalReviewNodes(segments: ProposalSegmentNode[]): ProposalReviewNode[] {
  return segments.flatMap((segment, index) => collectSegmentProposalReviewNodes(segment, index))
}

function collectSegmentProposalReviewNodes(segment: ProposalSegmentNode, index: number): ProposalReviewNode[] {
  const segmentId = proposalNodeIdentity(segment, String(index))
  return [
    { key: proposalNodeDecisionKey('segment', segment, String(index)), action: segment.action ?? 'create' },
    ...(segment.scene_moments ?? []).flatMap((moment, momentIndex) =>
      collectSceneProposalReviewNodes(moment, `${segmentId}-${momentIndex}`),
    ),
  ]
}

function collectSceneProposalReviewNodes(moment: ProposalSceneMomentNode, fallback: string): ProposalReviewNode[] {
  return [
    { key: proposalNodeDecisionKey('scene_moment', moment, fallback), action: moment.action ?? 'create' },
    ...(moment.creative_references ?? []).map((reference, index) => ({
      key: proposalNodeDecisionKey('creative_reference', reference, `${fallback}-reference-${index}`),
      action: reference.action ?? 'create',
    })),
    ...(moment.asset_slots ?? []).map((slot, index) => ({
      key: proposalNodeDecisionKey('asset_slot', slot, `${fallback}-asset-${index}`),
      action: slot.action ?? 'create',
    })),
    ...(moment.keyframes ?? []).map((keyframe, index) => ({
      key: proposalNodeDecisionKey('keyframe', keyframe, `${fallback}-keyframe-${index}`),
      action: keyframe.action ?? 'create',
    })),
    ...(moment.content_units ?? []).flatMap((unit, unitIndex) => {
      const unitFallback = `${fallback}-unit-${unitIndex}`
      return [
        { key: proposalNodeDecisionKey('content_unit', unit, unitFallback), action: unit.action ?? 'create' },
        ...(unit.keyframes ?? []).map((keyframe, keyframeIndex) => ({
          key: proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`),
          action: keyframe.action ?? 'create',
        })),
      ]
    }),
  ]
}

function collectProposalContextResources(segments: ProposalSegmentNode[]): ProposalContextResources {
  const context: ProposalContextResources = {
    creativeReferences: [],
    assetSlots: [],
    contentUnits: [],
    keyframes: [],
  }

  segments.forEach((segment, segmentIndex) => {
    const segmentId = proposalNodeIdentity(segment, String(segmentIndex))
    const segmentTitle = segment.title || `编排段 ${segmentIndex + 1}`
    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentTitle = moment.title || `情景 ${momentIndex + 1}`
      const parent = `${segmentTitle} / ${momentTitle}`

      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        context.creativeReferences.push({
          nodeKey: proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`),
          action: reference.action,
          title: reference.name || '未命名设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          parent,
        })
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        context.assetSlots.push({
          nodeKey: proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`),
          action: slot.action,
          title: slot.name || '未命名素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          parent,
        })
      })

      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        context.keyframes.push({
          nodeKey: proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`),
          action: keyframe.action,
          title: keyframe.title || '未命名关键帧',
          detail: compactParts([keyframe.status, keyframe.description, keyframe.prompt]),
          parent,
        })
      })

      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-unit-${unitIndex}`
        const unitTitle = unit.title || unit.description || `制作项 ${unitIndex + 1}`
        context.contentUnits.push({
          nodeKey: proposalNodeDecisionKey('content_unit', unit, unitFallback),
          action: unit.action,
          title: unitTitle,
          detail: compactParts([unit.kind, unit.shot_size, unit.camera_angle, unit.duration_sec ? `${unit.duration_sec}s` : '', unit.description]),
          parent,
        })

        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          context.keyframes.push({
            nodeKey: proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`),
            action: keyframe.action,
            title: keyframe.title || '未命名关键帧',
            detail: compactParts([keyframe.status, keyframe.description, keyframe.prompt]),
            parent: `${parent} / ${unitTitle}`,
          })
        })
      })
    })
  })

  return context
}

function compactParts(values: unknown[]) {
  const text = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' · ')
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

function stateSummary(state?: Record<string, unknown>) {
  if (!state) return ''
  return Object.entries(state)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('，')
}

function ProposalContextPanel({
  context,
  decisions,
  onSetDecision,
}: {
  context: ProposalContextResources
  decisions: ProposalNodeDecisions
  onSetDecision: (key: string, decision: 'accepted' | 'rejected') => void
}) {
  return (
    <div className="space-y-3">
      <ProposalContextGroup icon={Sparkles} title="设定资料" items={context.creativeReferences} empty="本提案没有新增或复用设定资料" decisions={decisions} onSetDecision={onSetDecision} />
      <ProposalContextGroup icon={PackageCheck} title="素材需求" items={context.assetSlots} empty="本提案没有新增或复用素材需求" decisions={decisions} onSetDecision={onSetDecision} />
      <ProposalContextGroup icon={Film} title="制作项" items={context.contentUnits} empty="本提案没有制作项" decisions={decisions} onSetDecision={onSetDecision} />
      <ProposalContextGroup icon={ImageIcon} title="关键帧" items={context.keyframes} empty="本提案没有关键帧" decisions={decisions} onSetDecision={onSetDecision} />
    </div>
  )
}

function ProposalContextGroup({
  icon: Icon,
  title,
  items,
  empty,
  decisions,
  onSetDecision,
}: {
  icon: LucideIcon
  title: string
  items: ProposalContextItem[]
  empty: string
  decisions: ProposalNodeDecisions
  onSetDecision: (key: string, decision: 'accepted' | 'rejected') => void
}) {
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Icon size={12} />
          {title}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border/60">
          {items.map((item, index) => {
            const decision = decisions[item.nodeKey]
            return (
              <div key={`${item.nodeKey}-${index}`} className={cn('px-3 py-2', decision === 'rejected' && 'opacity-50')}>
                <div className="flex items-start gap-2">
                  <ActionBadge action={item.action} compact />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[11px] font-medium text-foreground">{item.title}</p>
                      {decision && <DecisionBadge decision={decision} />}
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.parent}</p>
                    {item.detail && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.detail}</p>}
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5 pl-7">
                  <Button size="sm" variant={decision === 'accepted' ? 'secondary' : 'outline'} className="h-6 px-2 text-[10px]" onClick={() => onSetDecision(item.nodeKey, 'accepted')}>
                    接受
                  </Button>
                  <Button size="sm" variant={decision === 'rejected' ? 'secondary' : 'ghost'} className="h-6 px-2 text-[10px]" onClick={() => onSetDecision(item.nodeKey, 'rejected')}>
                    删除
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function countProposalDecisionSummary(segments: ProposalSegmentNode[], decisions: ProposalNodeDecisions) {
  const nodes = collectProposalReviewNodes(segments)
  const accepted = nodes.filter((node) => decisions[node.key] === 'accepted').length
  const rejected = nodes.filter((node) => decisions[node.key] === 'rejected').length
  return {
    accepted,
    rejected,
    unresolved: Math.max(0, nodes.length - accepted - rejected),
  }
}

function countProposalActions(segments: ProposalSegmentNode[]) {
  const counts = { create: 0, reuse: 0, update: 0 }
  function add(action?: string) {
    if (action === 'reuse') counts.reuse += 1
    else if (action === 'update') counts.update += 1
    else counts.create += 1
  }
  for (const segment of segments) {
    add(segment.action)
    for (const moment of segment.scene_moments ?? []) {
      add(moment.action)
      for (const reference of moment.creative_references ?? []) add(reference.action)
      for (const slot of moment.asset_slots ?? []) add(slot.action)
      for (const keyframe of moment.keyframes ?? []) add(keyframe.action)
      for (const unit of moment.content_units ?? []) {
        add(unit.action)
        for (const keyframe of unit.keyframes ?? []) add(keyframe.action)
      }
    }
  }
  return counts
}

function findProposalActionMissingId(proposal: { segments: ProposalSegmentNode[] }): { label: string; action: string } | null {
  function checkNode(label: string, action?: string, id?: number | null) {
    if ((action === 'reuse' || action === 'update') && id == null) return { label, action }
    return null
  }
  for (const segment of proposal.segments) {
    const segmentProblem = checkNode(segment.title ?? segment.client_id ?? '编排段', segment.action, segment.id)
    if (segmentProblem) return segmentProblem
    for (const moment of segment.scene_moments ?? []) {
      const momentProblem = checkNode(moment.title ?? moment.client_id ?? '情景', moment.action, moment.id)
      if (momentProblem) return momentProblem
      for (const reference of moment.creative_references ?? []) {
        const referenceProblem = checkNode(reference.name ?? reference.client_id ?? '设定资料', reference.action, reference.id)
        if (referenceProblem) return referenceProblem
      }
      for (const slot of moment.asset_slots ?? []) {
        const slotProblem = checkNode(slot.name ?? slot.client_id ?? '素材需求', slot.action, slot.id)
        if (slotProblem) return slotProblem
      }
      for (const unit of moment.content_units ?? []) {
        const unitProblem = checkNode(unit.title ?? unit.client_id ?? '制作项', unit.action, unit.id)
        if (unitProblem) return unitProblem
        for (const keyframe of unit.keyframes ?? []) {
          const keyframeProblem = checkNode(keyframe.title ?? keyframe.client_id ?? '关键帧', keyframe.action, keyframe.id)
          if (keyframeProblem) return keyframeProblem
        }
      }
      for (const keyframe of moment.keyframes ?? []) {
        const keyframeProblem = checkNode(keyframe.title ?? keyframe.client_id ?? '关键帧', keyframe.action, keyframe.id)
        if (keyframeProblem) return keyframeProblem
      }
    }
  }
  return null
}

function buildProposalReplacementPreview(proposalDraft: ProposalDraftContent, current: ProposalConflictEntities): ProposalReplacementPreview {
  const segmentByTitle = titleMap(current.segments)
  const sceneMomentByTitle = titleMap(current.sceneMoments)
  const creativeReferenceByTitle = titleMap(current.creativeReferences)
  const assetSlotByTitle = titleMap(current.assetSlots)
  const contentUnitByTitle = titleMap(current.contentUnits)
  const replaced = { segments: 0, sceneMoments: 0, creativeReferences: 0, assetSlots: 0, contentUnits: 0 }

  const segments = (proposalDraft.proposal?.segments ?? []).map((segment) => {
    const nextSegment = { ...segment }
    if (nextSegment.action === 'create' || ((nextSegment.action === 'reuse' || nextSegment.action === 'update') && nextSegment.id == null)) {
      const existing = segmentByTitle.get(normalizeTitleKey(nextSegment.title))
      if (existing) {
        if (nextSegment.action === 'create') nextSegment.action = 'update'
        nextSegment.id = existing.ID
        nextSegment.before = nextSegment.before ?? { title: titleOfRecord(existing), summary: existing.summary ?? existing.content ?? '' }
        if (segment.action === 'create') replaced.segments += 1
      }
    }
    nextSegment.scene_moments = (nextSegment.scene_moments ?? []).map((moment) => {
      const nextMoment = { ...moment }
      if (nextMoment.action === 'create' || ((nextMoment.action === 'reuse' || nextMoment.action === 'update') && nextMoment.id == null)) {
        const existing = sceneMomentByTitle.get(normalizeTitleKey(nextMoment.title))
        if (existing) {
          if (nextMoment.action === 'create') nextMoment.action = 'update'
          nextMoment.id = existing.ID
          nextMoment.before = nextMoment.before ?? { title: titleOfRecord(existing), action_text: existing.action_text ?? existing.description ?? '' }
          if (moment.action === 'create') replaced.sceneMoments += 1
        }
      }
      nextMoment.creative_references = (nextMoment.creative_references ?? []).map((reference) => {
        const nextReference = { ...reference }
        if (nextReference.action === 'create' || ((nextReference.action === 'reuse' || nextReference.action === 'update') && nextReference.id == null)) {
          const existing = creativeReferenceByTitle.get(normalizeTitleKey(nextReference.name))
          if (existing) {
            if (nextReference.action === 'create') nextReference.action = 'update'
            nextReference.id = existing.ID
            if (reference.action === 'create') replaced.creativeReferences += 1
          }
        }
        return nextReference
      })
      nextMoment.asset_slots = (nextMoment.asset_slots ?? []).map((slot) => {
        const nextSlot = { ...slot }
        if (nextSlot.action === 'create' || ((nextSlot.action === 'reuse' || nextSlot.action === 'update') && nextSlot.id == null)) {
          const existing = assetSlotByTitle.get(normalizeTitleKey(nextSlot.name))
          if (existing) {
            if (nextSlot.action === 'create') nextSlot.action = 'update'
            nextSlot.id = existing.ID
            if (slot.action === 'create') replaced.assetSlots += 1
          }
        }
        return nextSlot
      })
      nextMoment.content_units = (nextMoment.content_units ?? []).map((unit) => {
        const nextUnit = { ...unit }
        if (nextUnit.action === 'create' || ((nextUnit.action === 'reuse' || nextUnit.action === 'update') && nextUnit.id == null)) {
          const existing = contentUnitByTitle.get(normalizeTitleKey(nextUnit.title ?? nextUnit.description))
          if (existing) {
            if (nextUnit.action === 'create') nextUnit.action = 'update'
            nextUnit.id = existing.ID
            nextUnit.before = nextUnit.before ?? { title: titleOfRecord(existing), description: existing.description ?? existing.prompt ?? '' }
            if (unit.action === 'create') replaced.contentUnits += 1
          }
        }
        return nextUnit
      })
      return nextMoment
    })
    return nextSegment
  })

  return { proposal: { segments }, replaced }
}

function titleMap<T extends SemanticEntityRecord>(records: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const record of records) {
    const key = normalizeTitleKey(titleOfRecord(record))
    if (key && !map.has(key)) map.set(key, record)
  }
  return map
}

function normalizeTitleKey(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}


const ORCHESTRATE_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'production-orchestrate-analyzer',
  version: '2.0.0',
  name: '制作编排分析',
  description: '递归分析剧本，提取编排段、情景、设定引用和素材需求，去重并建立完整关系图',
  soul: `你是专业 production proposal 编排助手。你的写入目标只能是当前 production_proposal 草稿，不能直接改正式后端实体。

## 上下文边界
1. 当前 production_proposal 草稿：唯一可写上下文。
2. 当前实际 production：只读，用来理解现状和复用已有实体。
3. 当前项目的设定资料、素材需求：只读，用来复用项目级设定资料/素材需求并避免重复。

## 分析流程（必须严格按顺序执行）

### Step 1：读取现有上下文
如果当前 productionId 缺失或不确定，先调用 movscript_list_productions，列出当前项目的制作，并选择与用户上下文最匹配的 production。
调用 movscript_read_current_production，获取当前实际 production、编排段、情节、设定资料、素材需求，以及下游制作细化结果和关联剧本文本。这是 proposal 对比的基础，不可跳过。
如果 movscript_read_current_production 或 movscript_list_productions 当前不可用，但页面上下文已经提供 projectId、productionId、剧本文本和 production_proposal 草稿壳，不要中止；继续基于页面输入写入草稿。
调用 movscript_inspect_production_proposal_context 检查当前草稿；如果页面还没有提供草稿壳，就等待页面先打开草稿上下文，不要自己新建。若 inspect 返回 proposalRef/draftId，则必须继续写入该草稿。

### Step 2：编排段拆分（剧集级）
先在内部完成完整结构设计，优先使用 movscript_submit_production_proposal 一次性提交整棵 proposal。只有修补已有草稿的少量节点时，才使用 movscript_upsert_proposal_*。

把剧本按叙事节奏拆分为编排段。编排段不是简单的段落分割，而是基于：
- 情绪弧线的起伏（铺垫→冲突→高潮→收尾）
- 时间/空间的跳跃
- 叙事视角的切换
- 节奏的明显变化（快节奏动作段 vs 慢节奏情感段）
每个编排段必须有 order、title、summary、source_range（字符偏移范围）。

### Step 3：情景分析（递归，每个编排段都要分析）
对每个编排段，分析其内部的情景（scene_moments）：
- 每个情景必须带 segment_id（指向所属编排段的 client_id）
- 记录 time_text、location_text、action_text、mood
- 情景是编排段内的最小叙事单元，一个编排段通常有 2-6 个情景

### Step 4：设定资料分析（项目级，必须去重）
扫描全文提取所有设定资料（人物/地点/道具/产品/品牌/风格/世界规则）：
- 设定资料是项目级的，不属于某个制作，所有制作共享
- 必须与已有 creative_references 对比：名称相同或高度相似的不要重复创建
- 建立关系：每个设定资料关联到用到它的 segment_ids、scene_moment_ids

### Step 5：素材需求分析（项目级，必须去重）
基于设定资料和情景，推断需要哪些素材需求（asset_slots）：
- 素材需求也是项目级的，必须与已有 asset_slots 对比去重
- 每个素材需求必须有 owner_type（segment/scene_moment/content_unit）和对应的 owner client_id
- 关联 creative_reference_id（如果该素材需求是为某个设定资料准备的）

### Step 6：编排边界
不要在编排 proposal 中生成 content_units、keyframes、台词终稿、运镜表或 prompt。
- 编排阶段只定情节、设定引用、连续性和素材诉求
- 需要给制作工作台提示表达方向时，只写在 rationale、description 或 directing_intent 类说明字段
- 内容单元、关键帧、台词定稿、运镜表和 prompt 必须由制作工作台基于已确认情景再展开

### Step 7：写入草稿
只写入 production_proposal 草稿，不直接创建、修改或删除后端正式实体。
写入前必须调用 movscript_check_proposal_is_available 校验完整 proposal：
- 如果返回 errors，先修正 proposal，不要 submit
- 如果返回 normalizedProposal，必须使用 normalizedProposal 写入
- 禁止输出 action: "reuse" 或 action: "update" 但没有数字 id 的节点
- 找不到已有实体 id 时，必须使用 action: "create"
优先使用 movscript_submit_production_proposal 一次性写入最终 review draft。以下细粒度草稿工具只用于少量修补，不要为每个节点各调用一次：
- movscript_upsert_proposal_segment：编排段
- movscript_upsert_proposal_scene_moment：情节
- movscript_upsert_proposal_reference：设定资料引用
- movscript_upsert_proposal_asset：素材需求
- movscript_delete_production_proposal_node：从草稿删除节点

### Step 8：最终 proposal
调用 movscript_get_production_proposal 或 movscript_list_production_proposal_nodes 校验草稿。
如一次性输出完整结构更合适，调用 movscript_submit_production_proposal 写入最终 production_proposal 草稿。
UI 会自行比较 production_proposal 和当前实际 production 的差异，并由人工确认是否应用。

## 关系完整性要求
- scene_moment.segment_id → 必须指向有效的 segment client_id
- asset_slot.owner_type + asset_slot.owner_id → 必须指向有效的 client_id
- creative_reference 的 segment_ids/scene_moment_ids → 必须指向有效的 client_id

## 去重规则
- 名称完全相同：不要再 create；用 action: "update" 或 "reuse" 并附上已有实体 id
- 名称高度相似（包含关系或词汇重叠 ≥70%）：优先 action: "update" 或 "reuse" 并附上已有实体 id；不确定时在 rationale 说明
- action: "reuse" 和 action: "update" 的 id 必须来自 movscript_read_current_production 或 movscript_check_proposal_is_available 返回的已有实体数字 id
- 设定资料和素材需求是项目级的，去重范围是整个项目，不限于当前制作
- 编排段和情景是制作级的，去重范围是当前制作

## 分析深度要求
- 必须尽可能全面，不要因为”差不多”就省略
- 每个编排段至少分析出 2 个情景
- 每个情景应明确动作、情绪、设定引用和素材诉求，供制作工作台继续拆制作项
- 设定资料要覆盖所有出现的人物、地点、关键道具/产品`,
  permissions: ['project.read', 'draft.read', 'draft.write'],
  tools: [
    { name: 'movscript_list_productions', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_current_production', mode: 'allow', approval: 'never' },
    { name: 'movscript_check_proposal_is_available', mode: 'allow', approval: 'never' },
    { name: 'movscript_inspect_production_proposal_context', mode: 'allow', approval: 'never' },
    { name: 'movscript_get_production_proposal', mode: 'allow', approval: 'never' },
    { name: 'movscript_upsert_proposal_segment', mode: 'allow', approval: 'never' },
    { name: 'movscript_upsert_proposal_scene_moment', mode: 'allow', approval: 'never' },
    { name: 'movscript_upsert_proposal_reference', mode: 'allow', approval: 'never' },
    { name: 'movscript_upsert_proposal_asset', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_production_proposal_nodes', mode: 'allow', approval: 'never' },
    { name: 'movscript_delete_production_proposal_node', mode: 'allow', approval: 'never' },
    { name: 'movscript_submit_production_proposal', mode: 'allow', approval: 'never' },
  ],
}

const PROJECT_PROPOSAL_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'project-proposal-analyzer',
  version: '1.0.0',
  name: '项目提案分析',
  description: '从当前制作和剧本中整理项目级设定与素材需求，生成可审阅的 project_proposal 草稿',
  soul: `你是项目级提案助手。你的目标是把当前制作和剧本中涉及到的项目设定、素材需求和重复项整理成 project_proposal 草稿。

只写本地 draft，不直接改正式项目实体。
draft 是可审阅的提案快照，不是最终结果。
写入边界只包括：creative_references 和 asset_slots。
不要生成 production_proposal 中的编排段、情景、制作项、关键帧或 prompt。
如果当前制作不明确，先读取上下文；必要时再列出 productions 进行确认。
在提交前先验证草稿，并优先复用已有项目设定与素材需求。`,
  permissions: ['project.read', 'draft.read', 'draft.write'],
  skills: [
    {
      id: 'movscript.intent.project-proposal',
      name: 'Project Proposal Drafting',
      description: 'Analyze current production and script into a project-level proposal draft.',
      enabled: true,
      priority: 900,
      appliesWhen: '项目提案, project proposal, project_proposal, 项目设定, 素材需求, 设定资料',
      instruction: `Project proposal is a project-level governance stage, not a production-level breakdown.

Read the current context, current production, script text, and project-level references/assets before writing.
Only write to the local project_proposal draft.
Keep the proposal tree limited to creative_references and asset_slots.
Keep operations empty and write changes only in proposal.creative_references or proposal.asset_slots.
Prefer existing project references/assets over create. Do not write no-op reuse actions; only write create, update, delete, merge, or lock_asset operations that should change the project.
Do not use placeholder IDs, especially 0.
Use movscript_read_current_production and movscript_build_orchestration_diff when available.
Use movscript_validate_draft before finalizing.`,
      outputContract: 'Return the project proposal draft id, project id, production id when available, current draft status, and a concise summary of reference and asset gaps. State clearly that the draft is local, reviewable, and not yet applied.',
      toolHints: [
        'movscript_get_context_pack',
        'movscript_list_productions',
        'movscript_read_current_production',
        'movscript_build_orchestration_diff',
        'movscript_get_draft',
        'movscript_list_drafts',
        'movscript_update_draft',
        'movscript_patch_draft',
        'movscript_validate_draft',
        'movscript_request_user_input',
      ],
    },
  ],
  tools: [
    { name: 'movscript_get_context_pack', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_productions', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_current_production', mode: 'allow', approval: 'never' },
    { name: 'movscript_build_orchestration_diff', mode: 'allow', approval: 'never' },
    { name: 'movscript_get_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
    { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_patch_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_validate_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
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
    cancelled:               { label: '已停止', cls: 'bg-muted text-muted-foreground' },
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
  if (type === 'segments') return { status: 'draft', kind: 'emotional_function', production_id: productionId || 0 }
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
  if (ownerType === 'segment') return lookup.segmentById.get(ownerId) ? `编排段 · ${titleOfRecord(lookup.segmentById.get(ownerId))}` : `编排段 #${ownerId}`
  if (ownerType === 'scene_moment') return lookup.sceneMomentById.get(ownerId) ? `情景 · ${titleOfRecord(lookup.sceneMomentById.get(ownerId))}` : `情景 #${ownerId}`
  if (ownerType === 'content_unit') return lookup.contentUnitById.get(ownerId) ? `制作项 · ${titleOfRecord(lookup.contentUnitById.get(ownerId))}` : `制作项 #${ownerId}`
  if (ownerType === 'creative_reference') return lookup.creativeReferenceById.get(ownerId) ? `设定资料 · ${titleOfRecord(lookup.creativeReferenceById.get(ownerId))}` : `设定资料 #${ownerId}`
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
  if (segment) items.push(`编排段 · ${titleOfRecord(segment)}`)
  if (moment) items.push(`情景 · ${titleOfRecord(moment)}`)
  return items
}

function contentUnitReferences(unit: ContentUnitRecord, lookup: OrchestrationLookup) {
  const refs = lookup.usagesByOwnerKey.get(ownerKey('content_unit', unit.ID)) ?? []
  return refs.map((usage) => {
    const reference = usage.creative_reference_id ? lookup.creativeReferenceById.get(Number(usage.creative_reference_id)) : null
    const ownerLabel = reference ? `设定资料 · ${titleOfRecord(reference)}` : `设定资料 #${usage.creative_reference_id ?? ''}`
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
    if (reference) items.push(`设定资料 · ${titleOfRecord(reference)}`)
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
  const linkedText = (input.linkedVersion?.content || input.linkedVersion?.raw_source || '').trim()
  const scopedLinkedText = scopeScriptTextForProduction(linkedText, input.production, input.linkedVersion?.title).text
  const baseText = input.manualText.trim() || scopedLinkedText
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
      `编排段：${titleOfRecord(segment)}`,
      segment.summary ? `摘要：${segment.summary}` : '',
      segment.content ? `剧本正文：\n${segment.content}` : '',
      moments.length > 0 ? `情景：\n${moments.map(serializeSceneMoment).join('\n\n')}` : '',
      units.length > 0 ? `制作项：\n${units.map(serializeContentUnit).join('\n\n')}` : '',
      refs.length > 0 ? `相关设定资料：\n${refs.map(serializeCreativeReference).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材需求：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
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
      `情景：${titleOfRecord(moment)}`,
      moment.description ? `描述：${moment.description}` : '',
      moment.time_text ? `时间：${moment.time_text}` : '',
      moment.location_text ? `地点：${moment.location_text}` : '',
      moment.action_text ? `动作：${moment.action_text}` : '',
      moment.mood ? `情绪：${moment.mood}` : '',
      segmentRecord ? `所属编排段：${titleOfRecord(segmentRecord)}` : '',
      units.length > 0 ? `制作项：\n${units.map(serializeContentUnit).join('\n\n')}` : '',
      refs.length > 0 ? `相关设定资料：\n${refs.map(serializeCreativeReference).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材需求：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
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
      `设定资料：${titleOfRecord(reference)}`,
      reference.alias ? `别名：${reference.alias}` : '',
      reference.description ? `描述：${reference.description}` : '',
      reference.content ? `设定资料正文：\n${reference.content}` : '',
      relatedMoments.length > 0 ? `出现情景：${relatedMoments.map((item) => titleOfRecord(item)).join(' / ')}` : '',
      relatedUnits.length > 0 ? `相关制作项：${relatedUnits.map((item) => titleOfRecord(item)).join(' / ')}` : '',
      slots.length > 0 ? `相关素材需求：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
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
      `素材需求：${titleOfRecord(slot)}`,
      slot.kind ? `类型：${slot.kind}` : '',
      slot.priority ? `优先级：${slot.priority}` : '',
      slot.description ? `说明：${slot.description}` : '',
      slot.prompt_hint ? `生成提示：${slot.prompt_hint}` : '',
      ownerLabel ? `归属：${ownerLabel}` : '',
      reference ? `关联设定资料：${titleOfRecord(reference)}` : '',
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
      `制作项：${titleOfRecord(unit)}`,
      unit.kind ? `类型：${unit.kind}` : '',
      unit.description ? `描述：${unit.description}` : '',
      unit.prompt ? `提示：${unit.prompt}` : '',
      unit.shot_size ? `景别：${unit.shot_size}` : '',
      unit.camera_angle ? `机位角度：${unit.camera_angle}` : '',
      unit.camera_motion ? `运镜：${unit.camera_motion}` : '',
      segmentRecord ? `所属编排段：${titleOfRecord(segmentRecord)}` : '',
      moment ? `所属情景：${titleOfRecord(moment)}` : '',
      refs.length > 0 ? `相关设定资料：\n${refs.map(serializeCreativeReference).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材需求：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  return baseText
}

function scopeScriptTextForProduction(
  scriptText: string,
  production?: (SemanticEntityRecord & { name?: string }) | null,
  scriptVersionTitle?: string,
) {
  const text = scriptText.trim()
  const episodeOrder = inferEpisodeOrderForProduction(production, scriptVersionTitle)
  if (!text || !episodeOrder) return { text, scoped: false, episodeOrder: undefined as number | undefined }

  const ranges = findEpisodeTextRanges(text)
  const range = ranges.find((item) => item.order === episodeOrder)
  if (!range) return { text, scoped: false, episodeOrder }

  const scoped = text.slice(range.start, range.end).trim()
  if (!scoped || scoped.length >= text.length * 0.85) return { text, scoped: false, episodeOrder }
  return { text: scoped, scoped: true, episodeOrder }
}

function inferEpisodeOrderForProduction(
  production?: (SemanticEntityRecord & { name?: string }) | null,
  scriptVersionTitle?: string,
) {
  const candidates = [
    String(production?.name ?? ''),
    String(production?.title ?? ''),
    String(production?.description ?? ''),
    String(scriptVersionTitle ?? ''),
  ]
  for (const candidate of candidates) {
    const order = parseEpisodeOrder(candidate)
    if (order) return order
  }
  return undefined
}

function findEpisodeTextRanges(text: string): Array<{ order: number; start: number; end: number }> {
  const ranges: Array<{ order: number; start: number; end: number }> = []
  const headingPattern = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:《[^》]+》\s*)?(?:第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*[集话回]|(?:EP|E|Episode)\s*0*([0-9]+))(?:\s*[：:\-—]\s*.*)?/gi
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(text)) !== null) {
    const token = match[1] || match[2]
    const order = parseEpisodeOrder(token)
    if (!order) continue
    ranges.push({
      order,
      start: match.index + (match[0].startsWith('\n') ? 1 : 0),
      end: text.length,
    })
  }
  for (let index = 0; index < ranges.length - 1; index += 1) {
    ranges[index].end = ranges[index + 1].start
  }
  return ranges
}

function parseEpisodeOrder(value: string) {
  const text = String(value ?? '').trim()
  const match = text.match(/第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*[集话回]/)
    ?? text.match(/(?:EP|E|Episode)\s*0*([0-9]+)/i)
  const token = match?.[1] ?? (/^[0-9零〇一二三四五六七八九十百千万两]+$/.test(text) ? text : '')
  if (!token) return undefined
  if (/^\d+$/.test(token)) {
    const num = Number(token)
    return Number.isFinite(num) && num > 0 ? num : undefined
  }
  return parseChineseEpisodeNumber(token) || undefined
}

function parseChineseEpisodeNumber(value: string) {
  const digitMap: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  const unitMap: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
  let total = 0
  let section = 0
  let number = 0
  for (const char of value) {
    if (char in digitMap) {
      number = digitMap[char]
      continue
    }
    const unit = unitMap[char]
    if (!unit) continue
    if (unit === 10000) {
      total += (section + number) * unit
      section = 0
      number = 0
      continue
    }
    section += (number || 1) * unit
    number = 0
  }
  return total + section + number
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
        <SelectTrigger className={selectClass}><SelectValue placeholder="选择编排段" /></SelectTrigger>
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
        <SelectTrigger className={selectClass}><SelectValue placeholder="选择情景" /></SelectTrigger>
        <SelectContent>
          {options.map((moment) => <SelectItem key={moment.ID} value={String(moment.ID)}>{titleOfRecord(moment)}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  if (scope === 'creativeReferences') {
    return (
      <Select value={value ? String(value) : ''} onValueChange={(next) => onChange(next ? Number(next) : null)}>
        <SelectTrigger className={selectClass}><SelectValue placeholder="选择设定资料" /></SelectTrigger>
        <SelectContent>
          {creativeReferences.map((reference) => <SelectItem key={reference.ID} value={String(reference.ID)}>{titleOfRecord(reference)}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  if (scope === 'assetSlots') {
    return (
      <Select value={value ? String(value) : ''} onValueChange={(next) => onChange(next ? Number(next) : null)}>
        <SelectTrigger className={selectClass}><SelectValue placeholder="选择素材需求" /></SelectTrigger>
        <SelectContent>
          {assetSlots.map((slot) => <SelectItem key={slot.ID} value={String(slot.ID)}>{titleOfRecord(slot)}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  return (
    <Select value={value ? String(value) : ''} onValueChange={(next) => onChange(next ? Number(next) : null)}>
      <SelectTrigger className={selectClass}><SelectValue placeholder="选择制作项" /></SelectTrigger>
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

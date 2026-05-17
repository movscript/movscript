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
  previewProductionProposalApply,
  semanticEntityConfig,
  updateSemanticEntity,
  type ProductionProposalPreviewSemanticChange,
  type ProductionProposalPreviewWarning,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { buildCommandFirstClientInput, buildPageKey } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import { cn } from '@/lib/utils'
import { translateApiError, type APIErrorBody } from '@/lib/apiError'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import {
  buildEmptyProductionProposalDraftContent,
  PRODUCTION_PROPOSAL_DRAFT_SCHEMA,
} from '@/lib/productionProposalDraft'
import { localAgentClient, type AgentDraft, type AgentRun, type AgentRunStep } from '@/lib/localAgentClient'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@movscript/ui'
import { ROUTES, mergeSearch, withRouteParams } from '@/routes/projectRoutes'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EntityFilter = 'all' | 'segments' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'
type AnalysisScope = 'production' | 'segments' | 'segmentAnalysis' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'
type WorkspaceView = 'structure' | 'review'
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

// AI proposal output types
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

type ProposalSnapshotAction = 'create' | 'update'

interface ProposalContentUnitNode {
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
  id?: number
  client_id?: string
  name?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
}
interface ProposalAssetSlotNode {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  description?: string
  priority?: string
  source_label?: string
}
interface ProposalSceneMomentNode {
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
  mode?: 'snapshot'
  productionId: number
  proposalScope?: string
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
  actions: { create: number; update: number }
  preview: ProposalApplyPreview
  backendPreview?: {
    dryRun: boolean
    counts: ApplyProductionProposalResponseLike['counts']
    returned: {
      segments: number
      sceneMoments: number
      creativeReferences: number
      assetSlots: number
      contentUnits: number
      keyframes: number
    }
    semanticChanges: ProductionProposalPreviewSemanticChange[]
    warnings: ProductionProposalPreviewWarning[]
  }
}

interface ApplyProductionProposalResponseLike {
  counts: {
    segments_created: number
    scene_moments_created: number
    content_units_created: number
    asset_slots_created: number
    keyframes_created: number
    creative_references_created: number
    creative_reference_usages: number
  }
}

interface ProposalApplyPreviewItem {
  key: string
  title: string
  detail: string
  kind: 'segment' | 'scene_moment' | 'content_unit' | 'keyframe' | 'creative_reference' | 'asset_slot'
  action?: ProposalSnapshotAction
  parent?: string
}

interface ProposalApplyPreview {
  writePlan: ProposalApplyPreviewItem[]
  rejected: ProposalApplyPreviewItem[]
  pending: ProposalApplyPreviewItem[]
  blocked: ProposalApplyPreviewItem[]
}

interface ProposalApplyGate {
  status: 'ready' | 'blocked' | 'needs_preview' | 'empty'
  title: string
  detail: string
}

interface ProposalBackendPreviewIssue {
  message: string
  detail?: string
  code?: string
}

function parseProductionProposalDraft(draft: AgentDraft): ProposalDraftContent | null {
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    if (content.schema !== PRODUCTION_PROPOSAL_DRAFT_SCHEMA) return null
    const proposal = isRecordValue(content.proposal) ? content.proposal : {}
    if (content.mode !== 'snapshot' || containsProposalActionField(proposal)) return null
    const rawSegments = Array.isArray(proposal.segments)
      ? proposal.segments
      : Array.isArray(content.segments)
        ? content.segments
        : []
    const productionId = numericDraftField(content.productionId)
      ?? numericDraftField(content.production_id)
      ?? numericDraftField(draft.target?.entityId)
      ?? numericDraftField(draft.target?.productionId)
      ?? numericDraftField(draft.metadata?.productionId)
      ?? 0

    return {
      mode: 'snapshot',
      productionId,
      proposalScope: stringDraftField(content.proposalScope) || undefined,
      summary: stringDraftField(content.summary),
      proposal: {
        segments: rawSegments.filter(isRecordValue) as unknown as ProposalSegmentNode[],
      },
      proposedAt: stringDraftField(content.proposedAt) || stringDraftField(content.createdAt) || draft.createdAt,
      draftId: draft.id,
      draftTitle: draft.title,
      draftUpdatedAt: draft.updatedAt,
    }
  } catch {
    return null
  }
}

function containsProposalActionField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProposalActionField)
  if (!isRecordValue(value)) return false
  if (Object.prototype.hasOwnProperty.call(value, 'action')) return true
  return Object.values(value).some(containsProposalActionField)
}

function numericDraftField(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function stringDraftField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

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
  locked: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  accepted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  active: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  draft: 'bg-muted text-muted-foreground',
  candidate: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  missing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ignored: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  rejected: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  blocked: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
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

export default function ProductionOrchestrationPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const productionId = Number(searchParams.get('productionId')) || 0
  const openedDraftId = searchParams.get('draftId')?.trim() || ''
  const openedSettingDraftId = searchParams.get('settingDraftId')?.trim() || ''
  const openedAssetProposalDraftId = searchParams.get('assetProposalDraftId')?.trim() || ''

  const [filter, setFilter] = useState<EntityFilter>('all')
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [createType, setCreateType] = useState<EntityFilter | null>(null)
  const [editEntry, setEditEntry] = useState<{ type: EntityFilter; record: SemanticEntityRecord } | null>(null)
  const [proposalPreviewDraft, setProposalPreviewDraft] = useState<ProposalDraftContent | null>(null)
  const [proposalNodeDecisions, setProposalNodeDecisions] = useState<ProposalNodeDecisions>({})
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('structure')
  const [createSegmentId, setCreateSegmentId] = useState<number | null>(null)
  const [orchestrationStage, setOrchestrationStage] = useState<'idle' | 'production'>('idle')
  const orchestrationCleanupRef = useRef<(() => void) | null>(null)

  const queryKey = ['production-orchestration', projectId] as const
  const scriptVersionsQueryKey = ['production-orchestration-script-versions', projectId] as const
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
  const openedDraftQuery = useQuery({
    queryKey: ['production-orchestration-draft', projectId, openedDraftId],
    queryFn: async () => {
      if (!projectId || !openedDraftId) return null
      return localAgentClient.getDraft(openedDraftId)
    },
    enabled: !!projectId && !!openedDraftId,
  })
  const openedSettingDraftQuery = useQuery({
    queryKey: ['production-orchestration-setting-draft', projectId, openedSettingDraftId],
    queryFn: async () => {
      if (!projectId || !openedSettingDraftId) return null
      return localAgentClient.getDraft(openedSettingDraftId)
    },
    enabled: !!projectId && !!openedSettingDraftId,
  })
  const openedAssetProposalDraftQuery = useQuery({
    queryKey: ['production-orchestration-asset-proposal-draft', projectId, openedAssetProposalDraftId],
    queryFn: async () => {
      if (!projectId || !openedAssetProposalDraftId) return null
      return localAgentClient.getDraft(openedAssetProposalDraftId)
    },
    enabled: !!projectId && !!openedAssetProposalDraftId,
  })

  const productions = data?.productions ?? []
  const selectedProduction = productions.find((p) => p.ID === productionId) ?? productions[0]
  const effectiveProductionId = selectedProduction?.ID ?? 0
  const selectedScriptVersion = useMemo(
    () => scriptVersions.find((version) => version.ID === Number(selectedProduction?.script_version_id)) ?? null,
    [scriptVersions, selectedProduction?.script_version_id],
  )
  const scriptText = (selectedScriptVersion?.content || selectedScriptVersion?.raw_source || '').trim()
  const canLaunchLinkedProposal = Boolean(scriptText) && !isFetchingScriptVersions

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
    () => (data?.assetSlots ?? []).filter((slot) => !['ignored', 'merged'].includes(String(slot.status ?? ''))),
    [data?.assetSlots],
  )
  const allCreativeReferences = useMemo(
    () => (data?.creativeReferences ?? []).filter((reference) => !['ignored', 'merged'].includes(String(reference.status ?? ''))),
    [data?.creativeReferences],
  )
  const currentProductionOverview = useMemo(
    () => buildProductionCurrentOverview({
      production: selectedProduction,
      scriptVersion: selectedScriptVersion,
      segments: allSegments,
      sceneMoments: allSceneMoments,
      creativeReferences: allCreativeReferences,
      assetSlots: allAssetSlots,
      contentUnits: allContentUnits,
    }),
    [allAssetSlots, allCreativeReferences, allContentUnits, allSceneMoments, allSegments, selectedProduction, selectedScriptVersion],
  )
  const proposalReviewNodeCount = useMemo(
    () => proposalPreviewDraft ? collectProposalReviewNodes(proposalPreviewDraft.proposal.segments).length : 0,
    [proposalPreviewDraft],
  )
  const workspaceStatusLabel = workspaceView === 'review'
    ? proposalPreviewDraft
      ? `待审节点 ${proposalReviewNodeCount}`
      : '等待制作提案'
    : `蓝图 ${allSegments.length} 段 · ${allSceneMoments.length} 情景`
  useEffect(() => {
    const draft = openedDraftQuery.data
    if (!draft || draft.kind !== 'production_proposal') {
      setProposalPreviewDraft(null)
      return
    }
    const parsed = parseProductionProposalDraft(draft)
    setProposalPreviewDraft(parsed)
    setProposalNodeDecisions({})
    setWorkspaceView('review')
  }, [openedDraftId, openedDraftQuery.data])
  useEffect(() => {
    if (proposalPreviewDraft) {
      setProposalNodeDecisions({})
    }
  }, [proposalPreviewDraft])
  useEffect(() => {
    if (openedSettingDraftId || openedAssetProposalDraftId || openedDraftId) {
      setWorkspaceView('review')
    }
  }, [openedAssetProposalDraftId, openedDraftId, openedSettingDraftId])
  useEffect(() => {
    return () => orchestrationCleanupRef.current?.()
  }, [])
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
  const productionPageKey = useMemo(
    () => buildPageKey({
      route: { pathname: ROUTES.project.productionOrchestration },
      projectId,
      productionId: effectiveProductionId || undefined,
      selection: effectiveProductionId
        ? { entityType: 'production', entityId: effectiveProductionId, label: selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}` }
        : undefined,
      labels: ['production-orchestration'],
    }),
    [effectiveProductionId, projectId, selectedProduction],
  )

  function handleFilterChange(nextFilter: EntityFilter) {
    setFilter(nextFilter)
    setSelectedEntityId(null)
  }

  function getSelectedRecordLabel() {
    if (filter === 'segments') return selectedSegment ? titleOfRecord(selectedSegment) : '未选择编排段'
    if (filter === 'sceneMoments') return selectedSceneMoment ? titleOfRecord(selectedSceneMoment) : '未选择情景'
    if (filter === 'creativeReferences') return selectedCreativeReference ? titleOfRecord(selectedCreativeReference) : '未选择设定资料'
    if (filter === 'assetSlots') return selectedAssetSlot ? titleOfRecord(selectedAssetSlot) : '未选择素材需求'
    if (filter === 'contentUnits') return selectedContentUnit ? titleOfRecord(selectedContentUnit) : '未选择内容对象'
    return filter === 'all' ? '未选择对象，正在查看全制作' : '未选择对象，正在查看分类总览'
  }

  function getSelectedRecordSummary() {
    if (!selectedRecord) {
      if (filter === 'all') return '展示编排段、情景、设定资料、素材需求的整体覆盖。'
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

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAllWorkspaceTree() {
    setExpandedIds(new Set([
      ...allCreativeReferences.map((reference) => `project-ref-${reference.ID}`),
      ...allSegments.map((segment) => `segment-${segment.ID}`),
      ...allSceneMoments.map((moment) => `scene-${moment.ID}`),
    ]))
  }

  function collapseWorkspaceTree() {
    setExpandedIds(new Set())
  }

  function handleSelectProduction(id: string) {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('productionId', id)
    else next.delete('productionId')
    setSearchParams(next, { replace: true })
  }

  async function ensureProductionProposalDraft(target: AnalysisTarget) {
    if (!projectId || !effectiveProductionId) return null
    if (!canLaunchLinkedProposal) {
      toast.error('请先绑定可用剧本后再发起制作提案。')
      return null
    }

    const [explicitProductionDraft, productionDraftQuery] = await Promise.all([
      openedDraftId ? localAgentClient.getDraft(openedDraftId).catch(() => null) : Promise.resolve(null),
      localAgentClient.listDrafts({
        projectId,
        kind: 'production_proposal',
        pageKey: productionPageKey,
        limit: 20,
      }),
    ])

    const existingProductionDraft = (explicitProductionDraft?.kind === 'production_proposal' && explicitProductionDraft.status !== 'superseded')
      ? explicitProductionDraft
      : (productionDraftQuery.drafts ?? []).find((draft) => draft.kind === 'production_proposal' && draft.status !== 'superseded')

    const productionDraft = existingProductionDraft ?? await localAgentClient.createDraft({
      projectId,
      kind: 'production_proposal',
      title: `制作提案草稿 - ${selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`}`,
      content: JSON.stringify(buildEmptyProductionProposalDraftContent({
        projectId,
        productionId: effectiveProductionId,
        proposedAt: new Date().toISOString(),
      }), null, 2),
      source: {
        entityType: 'production',
        entityId: effectiveProductionId,
        pageKey: productionPageKey,
        pageType: 'production_orchestrate',
        pageRoute: ROUTES.project.productionOrchestration,
        selection: {
          entityType: 'production',
          entityId: effectiveProductionId,
          label: selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`,
        },
      },
      target: {
        projectId,
        entityType: 'production',
        entityId: effectiveProductionId,
        field: 'proposal',
      },
      metadata: {
        pageOwned: true,
        proposalScope: 'production',
        productionId: effectiveProductionId,
        seed: buildProductionDraftSeedMetadata({
          projectId,
          production: selectedProduction,
          scriptVersion: selectedScriptVersion,
          projectScripts: scriptVersions,
          modelRef: 'frontend:DraftDomainModel:production_proposal:v1',
        }),
      },
    })

    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('draftId', productionDraft.id)
      next.set('productionId', String(effectiveProductionId))
      return next
    }, { replace: true })

    setWorkspaceView('review')
    return { productionDraft, target }
  }

  async function handleAnalyzeTarget(target: AnalysisTarget) {
    const drafts = await ensureProductionProposalDraft(target)
    if (!drafts) return

    const requestId = `production_orchestrate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    setOrchestrationStage('production')
    orchestrationCleanupRef.current?.()
    orchestrationCleanupRef.current = registerAgentPanelPageTool(requestId, async (payload) => {
      if (payload.status !== 'completed') {
        setOrchestrationStage('idle')
        await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey })])
        return
      }
      const latestSettingDraft = selectLatestDraftArtifact(payload.artifacts, 'setting_proposal')
      const latestAssetProposalDraft = selectLatestDraftArtifact(payload.artifacts, 'asset_proposal')
      const latestProductionDraft = selectLatestDraftArtifact(payload.artifacts, 'production_proposal')
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        if (latestSettingDraft?.draftId) next.set('settingDraftId', latestSettingDraft.draftId)
        if (latestAssetProposalDraft?.draftId) next.set('assetProposalDraftId', latestAssetProposalDraft.draftId)
        if (latestProductionDraft?.draftId) next.set('draftId', latestProductionDraft.draftId)
        next.set('productionId', String(effectiveProductionId))
        return next
      }, { replace: true })
      setWorkspaceView('review')
      setOrchestrationStage('idle')
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey })])
    })

    openAgentPanelDraft({
      requestId,
      taskType: 'production_proposal',
      message: `请生成制作提案：${selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`}`,
      title: `制作提案: ${selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`}`,
      newConversation: true,
      autoSend: true,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message: target.scope === 'segmentAnalysis' && target.entityId
          ? `请围绕当前选中的编排段 #${target.entityId} 生成 production_proposal。若发现必须引用但不存在的项目级设定资料，先转 setting_proposal；若缺少素材需求锚点，先转 asset_proposal。不要把这些上游对象写进 project_proposal。`
          : '请基于当前 production snapshot 生成 production_proposal。若发现必须引用但不存在的项目级设定资料，先转 setting_proposal；若缺少素材需求锚点，先转 asset_proposal。不要把这些上游对象写进 project_proposal。',
        labels: ['production-orchestration', 'draft-application'],
        hints: {
          projectId,
          productionId: effectiveProductionId,
          draftId: drafts.productionDraft.id,
          route: { pathname: ROUTES.project.productionOrchestration },
          selection: {
            entityType: 'production',
            entityId: effectiveProductionId,
            label: selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`,
          },
        },
      }),
      runPolicy: { maxToolCalls: 50, maxIterations: 24 },
      timeoutMs: 180_000,
      renderMode: 'page',
    })
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

  async function linkReferenceToCurrentSegment(referenceId: number, evidence?: string) {
    await linkReferenceToOwner('segment', selectedSegment?.ID, referenceId, evidence, 'supporting')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Boxes size={13} />
              <Link to={ROUTES.project.production} className="hover:underline">{project?.name ?? '项目'}</Link>
              <ChevronRight size={12} />
              <span>创作编排</span>
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
            {openedSettingDraftId && <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]">设定 draft</Badge>}
            {openedAssetProposalDraftId && <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]">素材需求 draft</Badge>}
            {openedDraftId && <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]">已打开 draft</Badge>}
            <Badge variant={allCreativeReferences.length > 0 || allAssetSlots.length > 0 ? 'secondary' : 'warning'} className="h-6 rounded-full px-2 text-[10px]">
              {allCreativeReferences.length > 0 || allAssetSlots.length > 0 ? '上游资源已就绪' : '先补设定/素材需求'}
            </Badge>
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Link to={mergeSearch(ROUTES.project.preProduction, '', { tab: 'settings' })}>
                <Sparkles size={13} />
                设定工作台
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Link to={mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' })}>
                <PackageCheck size={13} />
                素材需求
              </Link>
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => refetch()}>
              <RefreshCw size={13} />
              刷新
            </Button>
          </div>
        </div>
      </header>

      {/* Body: structure / review workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
          {isLoading ? (
            <ProductionWorkspaceSkeleton />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="sticky top-0 z-10 border-b border-border bg-muted/90 px-4 py-3 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
                    <Button
                      size="sm"
                      variant={workspaceView === 'structure' ? 'secondary' : 'ghost'}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => setWorkspaceView('structure')}
                    >
                      <Route size={13} />
                      蓝图
                    </Button>
                    <Button
                      size="sm"
                      variant={workspaceView === 'review' ? 'secondary' : 'ghost'}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => setWorkspaceView('review')}
                    >
                      <GitBranch size={13} />
                      审阅
                      {proposalPreviewDraft && <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">{proposalReviewNodeCount}</Badge>}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant={workspaceView === 'review' && !proposalPreviewDraft ? 'outline' : 'secondary'} className="h-6 rounded-full px-2 text-[10px]">
                      {workspaceStatusLabel}
                    </Badge>
                    {workspaceView === 'review' ? (
                      <>
                        <span>{proposalPreviewDraft ? 'Git Diff 审阅区' : '打开制作提案后进入审阅'}</span>
                      </>
                    ) : (
                      <>
                        <span>从作品意图、情绪推进和情节树开始</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {orchestrationStage !== 'idle' && (
                      <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]">
                        生成创作方案
                      </Badge>
                    )}
                    <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => handleAnalyzeTarget({ scope: 'production' })} disabled={!projectId || !effectiveProductionId}>
                      <Wand2 size={13} />
                      生成创作方案
                    </Button>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {workspaceView === 'review' ? (
                  <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 p-4">
                    <ProjectProposalReviewSummary
                      settingDraft={openedSettingDraftQuery.data}
                      assetProposalDraft={openedAssetProposalDraftQuery.data}
                      projectName={project?.name ?? '当前项目'}
                      productionName={selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`}
                      creativeReferences={allCreativeReferences}
                      assetSlots={allAssetSlots}
                    />
                    {proposalPreviewDraft ? (
                      <ProposalReviewPanel
                        projectId={projectId}
                        proposalDraft={proposalPreviewDraft}
                        nodeDecisions={proposalNodeDecisions}
                        onNodeDecisionsChange={setProposalNodeDecisions}
                        onAccepted={() => {
                          setProposalPreviewDraft(null)
                          setProposalNodeDecisions({})
                          setWorkspaceView('structure')
                        }}
                        onDiscard={() => {
                          setProposalPreviewDraft(null)
                          setProposalNodeDecisions({})
                          setWorkspaceView('structure')
                        }}
                        onApplied={() => {
                          void refetch()
                          queryClient.invalidateQueries({ queryKey })
                        }}
                      />
                    ) : (
                      <ProposalReviewEmptyState onSwitchToStructure={() => setWorkspaceView('structure')} />
                    )}
                  </div>
                ) : (
                  <ProductionOrchestrationWorkspace
                    projectName={project?.name ?? '当前项目'}
                    selectedProduction={selectedProduction}
                    selectedScriptVersion={selectedScriptVersion}
                    scriptText={scriptText}
                    overview={currentProductionOverview}
                    projectReady={allCreativeReferences.length > 0 || allAssetSlots.length > 0}
                    creativeReferences={allCreativeReferences}
                    assetSlots={allAssetSlots}
                    segments={allSegments}
                    sceneMoments={allSceneMoments}
                    lookup={lookup}
                    expandedIds={expandedIds}
                    onToggleExpand={toggleExpand}
                    onExpandAll={expandAllWorkspaceTree}
                    onCollapseAll={collapseWorkspaceTree}
                    onEditSegment={(record) => setEditEntry({ type: 'segments', record })}
                    onEditSceneMoment={(record) => setEditEntry({ type: 'sceneMoments', record })}
                    onCreateSegment={() => {
                      setCreateSegmentId(null)
                      setCreateType('segments')
                    }}
                    onCreateSceneMoment={(segmentId) => {
                      setCreateSegmentId(segmentId)
                      setCreateType('sceneMoments')
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* CRUD dialogs */}
      {createType && createType !== 'all' && (
        <SemanticEntityCrudDialog
          open
          mode="create"
          projectId={projectId}
          config={semanticEntityConfig(createType)}
          defaults={createDefaultsForType(createType, effectiveProductionId, createSegmentId ?? selectedSegment?.ID, selectedSceneMoment?.ID)}
          queryKey={queryKey}
          title={`新增${filterDefs.find((f) => f.key === createType)?.label ?? ''}`}
          onOpenChange={(open) => {
            if (!open) {
              setCreateType(null)
              setCreateSegmentId(null)
            }
          }}
          onSaved={(record) => {
            if (createType === 'creativeReferences') {
              linkReferenceToCurrentSegment(record.ID, String(record.description ?? '')).finally(() => {
                queryClient.invalidateQueries({ queryKey })
                refetch()
              })
            }
            setCreateSegmentId(null)
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

function ProductionWorkspaceSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="animate-pulse space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="h-3 w-80 max-w-full rounded bg-muted" />
            </div>
            <div className="h-7 w-24 rounded-full bg-muted" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`production-skeleton-metric-${index}`} className="h-12 rounded-md border border-border bg-muted/30" />
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        {[0, 1].map((section) => (
          <section key={`production-skeleton-section-${section}`} className="rounded-lg border border-border bg-background p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-3 w-28 rounded bg-muted" />
              <div className="h-4 w-36 rounded bg-muted" />
              {[0, 1, 2].map((row) => (
                <div key={`production-skeleton-row-${section}-${row}`} className="rounded-md border border-border p-3">
                  <div className="h-3 w-2/3 rounded bg-muted" />
                  <div className="mt-2 h-3 w-full rounded bg-muted/70" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-muted/70" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
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

function CreativeIntentStrip({
  productionLabel,
  scriptTitle,
  segmentCount,
  sceneMomentCount,
  hasResources,
}: {
  productionLabel: string
  scriptTitle: string
  segmentCount: number
  sceneMomentCount: number
  hasResources: boolean
}) {
  const prompts = [
    {
      icon: Target,
      label: '作品意图',
      value: productionLabel,
      detail: '这一集/这一段想让观众记住什么情绪、关系或冲突。',
    },
    {
      icon: Route,
      label: '情绪推进',
      value: segmentCount > 0 ? `${segmentCount} 段情绪变化` : '等待拆出情绪段',
      detail: '每个段落先回答“为什么发生变化”，再决定要做哪些画面。',
    },
    {
      icon: Sparkles,
      label: '画面线索',
      value: hasResources ? `${sceneMomentCount} 个情节可继续推演` : '先补设定或素材锚点',
      detail: scriptTitle ? `从《${scriptTitle}》提取人物、道具、地点和氛围。` : '绑定剧本后，线索会更容易被拆成可执行画面。',
    },
  ]

  return (
    <div className="mt-4 grid gap-2 md:grid-cols-3">
      {prompts.map(({ icon: Icon, label, value, detail }) => (
        <div key={label} className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Icon size={13} />
            {label}
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-foreground">{value}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{detail}</p>
        </div>
      ))}
    </div>
  )
}

function ProductionOrchestrationWorkspace({
  projectName,
  selectedProduction,
  selectedScriptVersion,
  scriptText,
  overview,
  projectReady,
  creativeReferences,
  assetSlots,
  segments,
  sceneMoments,
  lookup,
  expandedIds,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  onEditSegment,
  onEditSceneMoment,
  onCreateSegment,
  onCreateSceneMoment,
}: {
  projectName: string
  selectedProduction: (SemanticEntityRecord & { name?: string; status?: string }) | null
  selectedScriptVersion: ScriptVersion | null
  scriptText: string
  overview: ContextOverview
  projectReady: boolean
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  lookup: OrchestrationLookup
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onEditSegment: (record: SemanticEntityRecord) => void
  onEditSceneMoment: (record: SemanticEntityRecord) => void
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
}) {
  const productionLabel = selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : '未选择制作'
  const boundaryTone = projectReady ? 'ok' : 'warn'
  const treeNodeCount = creativeReferences.length + segments.length + sceneMoments.length
  const unlinkedReferenceCount = creativeReferences.filter((reference) => (lookup.usagesByReferenceId.get(reference.ID)?.length ?? 0) === 0).length
  const unboundAssetSlotCount = assetSlots.filter((slot) => !slot.creative_reference_id).length
  const [projectResourcesExpanded, setProjectResourcesExpanded] = useState(false)
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <section className={cn('rounded-lg border bg-background p-4', projectReady ? 'border-emerald-200' : 'border-amber-200')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <GitBranch size={12} />
              制作边界
            </div>
            <h1 className="mt-1 text-lg font-semibold text-foreground">创作蓝图</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              先把作品想表达的情绪、关系和关键画面讲清楚，再把它们拆成情节、设定资料引用和素材缺口。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={boundaryTone === 'ok' ? 'secondary' : 'warning'} className="h-6 rounded-full px-2 text-[10px]">
              {boundaryTone === 'ok' ? '上游资源已就绪' : '先补设定/素材需求'}
            </Badge>
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Link to={mergeSearch(ROUTES.project.preProduction, '', { tab: 'settings' })}>
                <Sparkles size={13} />
                设定工作台
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Link to={mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' })}>
                <PackageCheck size={13} />
                素材需求
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ContextLine icon={Layers3} label="项目" value={projectName} />
          <ContextLine icon={Route} label="制作" value={productionLabel} />
          <ContextLine icon={ScrollText} label="剧本" value={selectedScriptVersion?.title || '未绑定'} />
          <ContextLine icon={Eye} label="文本" value={`${scriptText.length} 字`} />
        </div>
        <CreativeIntentStrip
          productionLabel={productionLabel}
          scriptTitle={selectedScriptVersion?.title || ''}
          segmentCount={segments.length}
          sceneMomentCount={sceneMoments.length}
          hasResources={projectReady}
        />
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
          {overview.position.map((item, index) => (
            <span key={`${item}-${index}`} className="rounded-full border border-border bg-muted/40 px-2 py-0.5">{item}</span>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <Sparkles size={12} />
              上游资源池
            </div>
            <h2 className="mt-1 text-sm font-semibold text-foreground">设定与素材资源池</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              这里展示设定工作台和素材需求工作台沉淀下来的资源；创作编排只负责选择哪些线索会影响当前作品表达。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span className="rounded-full border border-border bg-muted/30 px-2 py-1">设定 {creativeReferences.length}</span>
            <span className="rounded-full border border-border bg-muted/30 px-2 py-1">素材 {assetSlots.length}</span>
            {unlinkedReferenceCount > 0 && (
              <span className="rounded-full border border-border bg-muted/30 px-2 py-1">未关联 {unlinkedReferenceCount}</span>
            )}
            {unboundAssetSlotCount > 0 && (
              <span className="rounded-full border border-border bg-muted/30 px-2 py-1">未归属 {unboundAssetSlotCount}</span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1.5 px-2 text-[10px]"
              onClick={() => setProjectResourcesExpanded((prev) => !prev)}
            >
              <ChevronDown size={11} className={cn('transition-transform', projectResourcesExpanded && 'rotate-180')} />
              {projectResourcesExpanded ? '收起' : '展开'}
            </Button>
          </div>
        </div>
        {projectResourcesExpanded ? (
          <div className="mt-4 space-y-2">
            {creativeReferences.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                当前还没有可引用的设定资料，先去设定工作台补齐。
              </div>
            ) : (
              creativeReferences.map((reference) => (
                <ProductionTreeNode
                  key={`project-ref-${reference.ID}`}
                  id={`project-ref-${reference.ID}`}
                  level={0}
                  expanded={expandedIds.has(`project-ref-${reference.ID}`)}
                  onToggle={() => onToggleExpand(`project-ref-${reference.ID}`)}
                  title={titleOfRecord(reference)}
                  detail={String(reference.description ?? reference.summary ?? reference.content ?? '暂无说明')}
                  badges={[
                    creativeReferenceKindLabel[String(reference.kind ?? '')] ?? String(reference.kind ?? '设定'),
                    String(reference.status ?? 'draft'),
                    `${lookup.assetSlotsByReferenceId.get(reference.ID)?.length ?? 0} 个素材`,
                  ]}
                  actions={(
                    <>
                      <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
                        {lookup.usagesByReferenceId.get(reference.ID)?.length ?? 0} 次引用
                      </span>
                    </>
                  )}
                >
                  <div className="space-y-2 pb-2">
                    <TreeMiniLine label="说明" value={String(reference.description ?? reference.summary ?? reference.content ?? '暂无说明')} />
                    {renderReferenceAssetSlots(reference, lookup, assetSlots)}
                  </div>
                </ProductionTreeNode>
              ))
            )}
            {assetSlots.filter((slot) => !slot.creative_reference_id).length > 0 && (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">未归属素材</p>
                <div className="mt-2 space-y-1.5">
                  {assetSlots.filter((slot) => !slot.creative_reference_id).map((slot) => (
                    <div key={`unbound-slot-${slot.ID}`} className="rounded border border-border bg-background px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-medium text-foreground">{titleOfRecord(slot)}</p>
                        <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">{String(slot.status ?? 'missing')}</Badge>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{String(slot.description ?? '暂无说明')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
            默认收起。展开后查看设定工作台和素材需求工作台的上游资源池。
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <Route size={12} />
              创作编排
            </div>
            <h2 className="mt-1 text-sm font-semibold text-foreground">情绪流与关键情节</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              按情绪变化从左到右排列，每段下面承载它要表达的情节；展开后查看支撑它的设定资料和素材线索。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onExpandAll} disabled={treeNodeCount === 0}>
              <ChevronDown size={12} />
              展开全部
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onCollapseAll} disabled={expandedIds.size === 0}>
              <ChevronRight size={12} />
              收起全部
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onCreateSegment}>
              <Plus size={12} />
              新增编排段
            </Button>
          </div>
        </div>
        <div className="mt-4">
          {segments.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
              当前还没有创作蓝图。先从剧本、设定资料和素材需求生成一版，再在这里继续收敛作品表达。
            </div>
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="relative flex min-w-max items-start gap-3 pr-1">
                <div className="absolute left-0 right-0 top-6 h-px bg-border" />
                {segments.map((segment, index) => {
                  const childMoments = sceneMoments.filter((moment) => moment.segment_id === segment.ID)
                  return (
                    <EmotionFlowColumn
                      key={`segment-flow-${segment.ID}`}
                      index={index}
                      segment={segment}
                      moments={childMoments}
                      lookup={lookup}
                      expandedIds={expandedIds}
                      onToggleExpand={onToggleExpand}
                      onEditSegment={onEditSegment}
                      onEditSceneMoment={onEditSceneMoment}
                      onCreateSceneMoment={onCreateSceneMoment}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {!projectReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={13} />
            <p className="text-xs font-semibold">创作编排还没接上上游线索</p>
          </div>
          <p className="mt-1 text-[11px] leading-4">
            先去设定工作台补齐人物、地点、道具或风格线索，或去素材需求工作台补齐视觉锚点，再回到这里继续展开情绪段和情节树。
          </p>
        </div>
      )}
    </div>
  )
}

function EmotionFlowColumn({
  index,
  segment,
  moments,
  lookup,
  expandedIds,
  onToggleExpand,
  onEditSegment,
  onEditSceneMoment,
  onCreateSceneMoment,
}: {
  index: number
  segment: SegmentRecord
  moments: SceneMomentRecord[]
  lookup: OrchestrationLookup
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onEditSegment: (record: SemanticEntityRecord) => void
  onEditSceneMoment: (record: SemanticEntityRecord) => void
  onCreateSceneMoment: (segmentId: number) => void
}) {
  const segmentId = `segment-${segment.ID}`
  const expanded = expandedIds.has(segmentId)
  const segmentReferences = referencesForOwner('segment', segment.ID, lookup)
  const segmentAssetSlots = lookup.assetSlotsByOwnerKey.get(ownerKey('segment', segment.ID)) ?? []

  return (
    <div className="relative z-[1] flex w-[300px] shrink-0 flex-col">
      <div className="mb-2 flex justify-center">
        <span className="flex h-12 min-w-12 items-center justify-center rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <button
          type="button"
          className="block w-full px-3 py-3 text-left"
          onClick={() => onToggleExpand(segmentId)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {segmentKindLabel[String(segment.kind ?? '')] ?? String(segment.kind ?? '情绪段')}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px]', statusTone[String(segment.status ?? '')] ?? 'bg-muted text-muted-foreground')}>
                  {statusLabel[String(segment.status ?? '')] ?? String(segment.status ?? 'draft')}
                </span>
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{titleOfRecord(segment)}</h3>
            </div>
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-muted/20 text-muted-foreground">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-muted-foreground">
            {String(segment.summary ?? segment.content ?? '暂无摘要')}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded-full bg-muted/40 px-2 py-0.5">{moments.length} 情节</span>
            <span className="rounded-full bg-muted/40 px-2 py-0.5">{segmentReferences.length} 设定</span>
            <span className="rounded-full bg-muted/40 px-2 py-0.5">{segmentAssetSlots.length} 素材</span>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border/60 px-3 py-2">
            <div className="space-y-2">
              <TreeMiniLine label="摘要" value={String(segment.summary ?? segment.content ?? '暂无摘要')} />
              <TreeChipRow label="引用设定" items={segmentReferences.map((reference) => titleOfRecord(reference))} />
              <TreeChipRow label="关联素材" items={segmentAssetSlots.map((slot) => formatAssetSlotLabel(slot, lookup))} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">情节</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => onEditSegment(segment)}
            >
              <Pencil size={11} />
              编辑段
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onCreateSceneMoment(segment.ID)}
            >
              <Plus size={11} />
              新增
            </Button>
          </div>
        </div>

        <div className="space-y-2 px-3 py-3">
          {moments.length === 0 ? (
            <div className="rounded border border-dashed border-border bg-muted/10 px-2 py-3 text-[11px] leading-4 text-muted-foreground">
              这个情绪段下还没有情节。
            </div>
          ) : moments.map((moment) => (
            <EmotionMomentItem
              key={`scene-flow-${moment.ID}`}
              moment={moment}
              lookup={lookup}
              expanded={expandedIds.has(`scene-${moment.ID}`)}
              onToggle={() => onToggleExpand(`scene-${moment.ID}`)}
              onEdit={() => onEditSceneMoment(moment)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function EmotionMomentItem({
  moment,
  lookup,
  expanded,
  onToggle,
  onEdit,
}: {
  moment: SceneMomentRecord
  lookup: OrchestrationLookup
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const references = referencesForOwner('scene_moment', moment.ID, lookup)
  const assetSlots = lookup.assetSlotsByOwnerKey.get(ownerKey('scene_moment', moment.ID)) ?? []
  const detail = [moment.time_text, moment.location_text, moment.action_text].filter(Boolean).join(' · ') || '暂无说明'

  return (
    <div className="rounded border border-border bg-background">
      <button type="button" className="block w-full px-2.5 py-2 text-left" onClick={onToggle}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-muted/20 text-muted-foreground">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{titleOfRecord(moment)}</p>
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', statusTone[String(moment.status ?? '')] ?? 'bg-muted text-muted-foreground')}>
                {statusLabel[String(moment.status ?? '')] ?? String(moment.status ?? 'draft')}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{detail}</p>
            {moment.mood && (
              <p className="mt-1 truncate text-[10px] text-muted-foreground">情绪：{moment.mood}</p>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-2.5 py-2">
          <TreeMiniLine label="时间" value={String(moment.time_text ?? '未填写')} />
          <TreeMiniLine label="地点" value={String(moment.location_text ?? '未填写')} />
          <TreeMiniLine label="动作" value={String(moment.action_text ?? '未填写')} />
          <TreeMiniLine label="情绪" value={String(moment.mood ?? '未填写')} />
          <TreeChipRow label="引用设定" items={references.map((reference) => titleOfRecord(reference))} />
          <TreeChipRow label="关联素材" items={assetSlots.map((slot) => formatAssetSlotLabel(slot, lookup))} />
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onEdit}>
              <Pencil size={11} />
              编辑情节
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductionTreeNode({
  id,
  level,
  expanded,
  onToggle,
  title,
  detail,
  badges,
  actions,
  children,
}: {
  id: string
  level: number
  expanded: boolean
  onToggle: () => void
  title: string
  detail?: string
  badges: string[]
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={cn('relative rounded-md border border-border bg-background', level > 0 && 'ml-4 before:absolute before:-left-4 before:top-0 before:h-full before:w-px before:bg-border/60 before:content-[""]')}>
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className={cn('flex min-w-0 flex-1 items-start gap-2 text-left', children ? 'cursor-pointer' : 'cursor-default')}
        >
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-xs font-semibold text-foreground">{title}</p>
              {badges.map((badge) => (
                <span key={`${id}-${badge}`} className="rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {badge}
                </span>
              ))}
            </div>
            {detail && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{detail}</p>}
          </div>
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {expanded && children && <div className="border-t border-border/60 px-3 pt-2">{children}</div>}
    </div>
  )
}

function TreeMiniLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/20 px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-foreground">{value}</p>
    </div>
  )
}

function TreeChipRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function renderReferenceAssetSlots(reference: CreativeReferenceRecord, lookup: OrchestrationLookup, assetSlots: AssetSlotRecord[]) {
  const slots = assetSlots.filter((slot) => Number(slot.creative_reference_id ?? 0) === reference.ID)
  if (slots.length === 0) {
    return <div className="rounded-md border border-dashed border-border bg-background px-2 py-2 text-[11px] text-muted-foreground">这个设定还没有挂载素材需求。</div>
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground">关联素材</p>
      {slots.map((slot) => (
        <div key={slot.ID} className="rounded border border-border bg-background px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium text-foreground">{titleOfRecord(slot)}</p>
            <span className="rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {String(slot.priority ?? 'normal')}
            </span>
            <span className="rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {formatOwnerLabel(String(slot.owner_type ?? ''), Number(slot.owner_id ?? 0), lookup) || '未归属'}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{String(slot.description ?? '暂无说明')}</p>
        </div>
      ))}
    </div>
  )
}

function ProposalReviewPanel({
  projectId,
  proposalDraft,
  nodeDecisions,
  onNodeDecisionsChange,
  previewOnly = false,
  onAccepted,
  onDiscard,
  onApplied,
}: {
  projectId?: number
  proposalDraft: ProposalDraftContent
  nodeDecisions: ProposalNodeDecisions
  onNodeDecisionsChange: Dispatch<SetStateAction<ProposalNodeDecisions>>
  previewOnly?: boolean
  onAccepted: () => void
  onDiscard: () => void
  onApplied: () => void
}) {
  const [applying, setApplying] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [backendPreviewIssue, setBackendPreviewIssue] = useState<ProposalBackendPreviewIssue | null>(null)
  const [appliedCounts, setAppliedCounts] = useState<Record<string, number> | null>(null)
  const [simulationResult, setSimulationResult] = useState<ProposalSimulationResult | null>(null)
  const [backendPreviewDecisionKey, setBackendPreviewDecisionKey] = useState('')
  const segments = proposalDraft.proposal?.segments ?? []
  const proposalContext = useMemo(() => collectProposalContextResources(segments), [segments])
  const semanticDiff = useMemo(() => buildProposalSemanticDiff(segments), [segments])
  const currentApplyPreview = useMemo(() => buildProposalApplyPreview(segments, nodeDecisions), [nodeDecisions, segments])
  const proposalSnapshotKey = useMemo(() => JSON.stringify(proposalDraft.proposal ?? null), [proposalDraft.proposal])
  const reviewNodes = useMemo(() => collectProposalReviewNodes(segments), [segments])
  const currentDecisionKey = useMemo(() => proposalDecisionSnapshotKey(reviewNodes, nodeDecisions), [nodeDecisions, reviewNodes])
  const actionCounts = useMemo(() => countProposalActions(segments), [segments])
  const acceptedCount = reviewNodes.filter((node) => nodeDecisions[node.key] === 'accepted').length
  const rejectedCount = reviewNodes.filter((node) => nodeDecisions[node.key] === 'rejected').length
  const reviewedCount = acceptedCount + rejectedCount
  const reviewProgress = reviewNodes.length > 0 ? Math.round((reviewedCount / reviewNodes.length) * 100) : 0
  const unresolvedCount = Math.max(0, reviewNodes.length - reviewedCount)
  const reviewApplyGate = buildProposalApplyGate(
    currentApplyPreview,
    backendPreviewDecisionKey === currentDecisionKey && Boolean(simulationResult?.backendPreview),
  )
  const reviewStatus = useMemo(() => {
    if (appliedCounts) {
      return {
        tone: 'ok' as const,
        icon: CheckCircle2,
        iconClassName: 'text-emerald-500',
        label: '当前状态',
        title: '已写入项目',
        detail: '提案已经完成写入，当前停留在结果确认状态。',
      }
    }
    if (simulationResult?.backendPreview) {
      return {
        tone: 'ok' as const,
        icon: CheckCircle2,
        iconClassName: 'text-emerald-500',
        label: '当前状态',
        title: 'dry-run 已完成',
        detail: '后端已经校验当前接受/拒绝决策，但还没有提交到项目。',
      }
    }
    if (simulationResult) {
      return {
        tone: 'ok' as const,
        icon: Eye,
        iconClassName: 'text-emerald-500',
        label: '当前状态',
        title: '本地预览已完成',
        detail: '当前结果来自本地决策计算，尚未通过后端 dry-run 校验。',
      }
    }
    if (applying) {
      return {
        tone: 'warn' as const,
        icon: Loader2,
        iconClassName: 'animate-spin text-amber-500',
        label: '当前状态',
        title: '正在写入项目',
        detail: '提案写入流程正在执行，请等待结果返回。',
      }
    }
    if (simulating) {
      return {
        tone: 'warn' as const,
        icon: Loader2,
        iconClassName: 'animate-spin text-amber-500',
        label: '当前状态',
        title: '正在模拟写入',
        detail: '后端正在执行 dry-run 校验当前审阅决策。',
      }
    }
    if (reviewNodes.length === 0) {
      return {
        tone: 'neutral' as const,
        icon: Eye,
        iconClassName: 'text-muted-foreground',
        label: '当前状态',
        title: '等待制作提案',
        detail: '打开制作提案草稿后，这里会进入变更流审阅模式。',
      }
    }
    if (reviewedCount === 0) {
      return {
        tone: 'warn' as const,
        icon: AlertCircle,
        iconClassName: 'text-amber-500',
        label: '当前状态',
        title: '待开始审阅',
        detail: '先接受或拒绝变更节点，再看写入影响和门禁。',
      }
    }
    if (unresolvedCount > 0) {
      return {
        tone: 'warn' as const,
        icon: GitBranch,
        iconClassName: 'text-amber-500',
        label: '当前状态',
        title: '审阅进行中',
        detail: `还有 ${unresolvedCount} 项未处理，处理完后就可以进行 dry-run。`,
      }
    }
    if (reviewApplyGate.status === 'blocked') {
      return {
        tone: 'danger' as const,
        icon: AlertCircle,
        iconClassName: 'text-rose-500',
        label: '当前状态',
        title: '写入受阻',
        detail: reviewApplyGate.title,
      }
    }
    return {
      tone: 'ok' as const,
      icon: CheckCircle2,
      iconClassName: 'text-emerald-500',
      label: '当前状态',
      title: '可以进入 dry-run',
      detail: reviewApplyGate.detail,
    }
  }, [appliedCounts, applying, reviewApplyGate, reviewNodes.length, reviewedCount, simulating, simulationResult, unresolvedCount])

  useEffect(() => {
    setSimulationResult(null)
    setBackendPreviewDecisionKey('')
    setBackendPreviewIssue(null)
  }, [proposalSnapshotKey])

  function setNodeDecision(key: string, decision: 'accepted' | 'rejected') {
    setSimulationResult(null)
    setBackendPreviewIssue(null)
    setBackendPreviewDecisionKey('')
    onNodeDecisionsChange((prev) => ({ ...prev, [key]: decision }))
  }

  function setNodeDecisions(keys: string[], decision: 'accepted' | 'rejected') {
    setSimulationResult(null)
    setBackendPreviewIssue(null)
    setBackendPreviewDecisionKey('')
    onNodeDecisionsChange((prev) => {
      const next = { ...prev }
      for (const key of keys) next[key] = decision
      return next
    })
  }

  function acceptAllNodes() {
    setSimulationResult(null)
    setBackendPreviewIssue(null)
    setBackendPreviewDecisionKey('')
    onNodeDecisionsChange(Object.fromEntries(
      reviewNodes
        .map((node) => [node.key, 'accepted']),
    ))
  }

  function resetNodeDecisions() {
    setSimulationResult(null)
    setBackendPreviewIssue(null)
    setBackendPreviewDecisionKey('')
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
            content_units: (moment.content_units ?? []).flatMap((unit, unitIndex) => {
              const unitFallback = `${momentFallback}-content-${unitIndex}`
              if (nodeDecisions[proposalNodeDecisionKey('content_unit', unit, unitFallback)] !== 'accepted') return []
              return [{
                ...unit,
                keyframes: (unit.keyframes ?? []).filter((keyframe, keyframeIndex) =>
                  nodeDecisions[proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)] === 'accepted',
                ),
              }]
            }),
            keyframes: (moment.keyframes ?? []).filter((keyframe, keyframeIndex) =>
              nodeDecisions[proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)] === 'accepted',
            ),
            creative_references: (moment.creative_references ?? []).filter((reference, referenceIndex) =>
              nodeDecisions[proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)] === 'accepted',
            ),
            asset_slots: (moment.asset_slots ?? []).filter((slot, slotIndex) =>
              nodeDecisions[proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)] === 'accepted',
            ),
          }]
        }),
      }]
    })
    return { segments: acceptedSegments }
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
    const actions = { create: 0, update: 0 }
    const addAction = (node: { id?: number | null }) => {
      const action = proposalSnapshotAction(node)
      if (action === 'update') actions.update += 1
      else actions.create += 1
    }

    for (const segment of proposal.segments) {
      addAction(segment)
      if (!snapshotNodeHasID(segment)) counts.segments_created += 1
      for (const moment of segment.scene_moments ?? []) {
        addAction(moment)
        if (!snapshotNodeHasID(moment)) counts.scene_moments_created += 1
        for (const unit of moment.content_units ?? []) {
          addAction(unit)
          if (!snapshotNodeHasID(unit)) counts.content_units_created += 1
          for (const keyframe of unit.keyframes ?? []) {
            addAction(keyframe)
            if (!snapshotNodeHasID(keyframe)) counts.keyframes_created += 1
          }
        }
        for (const keyframe of moment.keyframes ?? []) {
          addAction(keyframe)
          if (!snapshotNodeHasID(keyframe)) counts.keyframes_created += 1
        }
        for (const reference of moment.creative_references ?? []) {
          addAction(reference)
          counts.creative_reference_usages += 1
        }
        for (const slot of moment.asset_slots ?? []) {
          addAction(slot)
          if (!snapshotNodeHasID(slot)) counts.asset_slots_created += 1
        }
      }
    }

    return {
      acceptedNodes: reviewNodes.filter((node) => nodeDecisions[node.key] === 'accepted').length,
      rejectedNodes: reviewNodes.filter((node) => nodeDecisions[node.key] === 'rejected').length,
      unresolvedNodes: Math.max(0, reviewNodes.length - reviewNodes.filter((node) => nodeDecisions[node.key] === 'accepted' || nodeDecisions[node.key] === 'rejected').length),
      counts,
      actions,
      preview: buildProposalApplyPreview(segments, nodeDecisions),
    }
  }

  async function handleSimulate() {
    setApplyError('')
    setBackendPreviewIssue(null)
    const localResult = buildSimulationResult()
    const proposal = buildAcceptedProposal()
    if (!projectId || proposal.segments.length === 0) {
      setSimulationResult(localResult)
      return
    }
    const missingId = findProductionProposalSnapshotIssue(proposal)
    if (missingId) {
      setApplyError(`${missingId.label} 缺少已有实体 ID。制作提案只能引用已有设定资料，请先补齐上游设定后再预览。`)
      setSimulationResult(localResult)
      return
    }
    setSimulating(true)
    try {
      const result = await previewProductionProposalApply(projectId, {
        mode: 'snapshot',
        production_id: proposalDraft.productionId,
        proposal_scope: proposalDraft.proposalScope ?? 'production',
        proposal,
      })
      setSimulationResult({
        ...localResult,
        counts: result.would_apply.counts,
        backendPreview: {
          dryRun: result.dry_run,
          counts: result.would_apply.counts,
          returned: {
            segments: result.would_apply.segments?.length ?? 0,
            sceneMoments: result.would_apply.scene_moments?.length ?? 0,
            creativeReferences: result.would_apply.counts.creative_references_created,
            assetSlots: result.would_apply.asset_slots?.length ?? 0,
            contentUnits: result.would_apply.content_units?.length ?? 0,
            keyframes: result.would_apply.keyframes?.length ?? 0,
          },
          semanticChanges: result.semantic_changes ?? [],
          warnings: result.warnings ?? [],
        },
      })
      setBackendPreviewDecisionKey(currentDecisionKey)
    } catch (err) {
      setBackendPreviewIssue(parseProposalBackendPreviewIssue(err))
      setSimulationResult(localResult)
      setBackendPreviewDecisionKey('')
    } finally {
      setSimulating(false)
    }
  }

  async function handleApply() {
    if (!projectId) return
    setBackendPreviewIssue(null)
    if (previewOnly) {
      handleSimulate()
      return
    }
    const applyPreview = buildProposalApplyPreview(segments, nodeDecisions)
    if (applyPreview.blocked.length > 0) {
      setApplyError('存在已接受但父级未接受的变更，请先处理“依赖未接受”队列。')
      return
    }
    const proposal = buildAcceptedProposal()
    if (proposal.segments.length === 0) {
      setApplyError('请至少接受一个段落后再写入项目')
      return
    }
    const missingId = findProductionProposalSnapshotIssue(proposal)
    if (missingId) {
      setApplyError(`${missingId.label} 缺少已有实体 ID。制作提案只能引用已有设定资料，请先补齐上游设定后再写入。`)
      return
    }
    if (backendPreviewDecisionKey !== currentDecisionKey || !simulationResult?.backendPreview) {
      setApplyError('请先运行一次后端预览，确认当前接受/拒绝决策可以写入。')
      return
    }
    setApplying(true)
    setApplyError('')
    try {
      const result = await applyProductionProposal(projectId, {
        mode: 'snapshot',
        production_id: proposalDraft.productionId,
        proposal_scope: proposalDraft.proposalScope ?? 'production',
        proposal,
      })
      if (proposalDraft.draftId) {
        await localAgentClient.updateDraft(proposalDraft.draftId, {
          status: 'applied',
          metadata: {
            appliedFrom: 'production-orchestration-page',
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
            {appliedCounts.creative_references_created > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">设定资料 +{appliedCounts.creative_references_created}</span>
            )}
            {appliedCounts.asset_slots_created > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">素材需求 +{appliedCounts.asset_slots_created}</span>
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
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{simulationResult.backendPreview ? '后端预览已生成' : '本地模拟已生成'}</p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-emerald-700/80 dark:text-emerald-300/80">
            {simulationResult.backendPreview ? '后端已在事务中 dry-run 校验本次写入，不会提交到项目。' : '本次预览仅基于当前接受/拒绝决策计算，不会提交到项目。'}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">已接受 {simulationResult.acceptedNodes}</span>
            <span className="rounded bg-rose-500/10 px-1.5 py-1">已拒绝 {simulationResult.rejectedNodes}</span>
            <span className="rounded bg-muted px-1.5 py-1">未审 {simulationResult.unresolvedNodes}</span>
            <span className="rounded bg-muted px-1.5 py-1">新增 {simulationResult.actions.create}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] text-emerald-700 dark:text-emerald-300">
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">编排段 +{simulationResult.counts.segments_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">情景 +{simulationResult.counts.scene_moments_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">内容 +{simulationResult.counts.content_units_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">画面锚点 +{simulationResult.counts.keyframes_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">设定资料 +{simulationResult.counts.creative_references_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">素材需求 +{simulationResult.counts.asset_slots_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">引用 +{simulationResult.counts.creative_reference_usages}</span>
          </div>
        </div>
        {simulationResult.backendPreview && (
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <p className="text-xs font-semibold text-foreground">后端 dry-run 结果</p>
              <Badge variant="secondary" className="ml-auto h-5 rounded-full px-2 text-[10px]">未写库</Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-center text-[10px] sm:grid-cols-3">
              <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回编排段 {simulationResult.backendPreview.returned.segments}</span>
              <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回情景 {simulationResult.backendPreview.returned.sceneMoments}</span>
              <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回内容 {simulationResult.backendPreview.returned.contentUnits}</span>
              <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回画面锚点 {simulationResult.backendPreview.returned.keyframes}</span>
              <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回素材 {simulationResult.backendPreview.returned.assetSlots}</span>
              <span className="rounded bg-muted px-1.5 py-1 text-foreground">新设定 {simulationResult.backendPreview.returned.creativeReferences}</span>
            </div>
            <BackendPreviewSemanticSummary
              changes={simulationResult.backendPreview.semanticChanges}
              warnings={simulationResult.backendPreview.warnings}
            />
          </div>
        )}
        <ProposalApplyGatePanel
          gate={buildProposalApplyGate(simulationResult.preview, Boolean(simulationResult.backendPreview))}
        />
        {backendPreviewIssue && <ProposalBackendPreviewIssuePanel issue={backendPreviewIssue} />}
        <ProposalApplyPreviewPanel preview={simulationResult.preview} />
        <div className={cn('grid gap-2', previewOnly ? 'grid-cols-1' : 'grid-cols-2')}>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={applying} onClick={() => setSimulationResult(null)}>
            返回审阅
          </Button>
          {!previewOnly && (
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={applying || !projectId || backendPreviewDecisionKey !== currentDecisionKey || !simulationResult.backendPreview || simulationResult.preview.blocked.length > 0}
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <GitBranch size={12} />
              变更流
              {proposalDraft.proposedAt && <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">已加载提案</Badge>}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">制作提案审阅</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              这是一条按变更流组织的审阅界面。先确认结构变更，再看上下文和写入门禁，最后再做 dry-run。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={acceptAllNodes}>
              <CheckCheck size={12} />
              全部接受
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={resetNodeDecisions}>
              <X size={12} />
              清空
            </Button>
          </div>
        </div>
        {proposalDraft.summary && (
          <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{proposalDraft.summary}</p>
        )}
        <div className="mt-4">
          <ProposalStatusCard status={reviewStatus} />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <ContextLine icon={GitBranch} label="提案节点" value={`${reviewNodes.length}`} />
          <ContextLine icon={CheckCircle2} label="已接受" value={`${acceptedCount}`} />
          <ContextLine icon={AlertCircle} label="已拒绝" value={`${rejectedCount}`} />
          <ContextLine icon={Eye} label="未审" value={`${unresolvedCount}`} />
          <ContextLine icon={Target} label="进度" value={`${reviewProgress}%`} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-col gap-3">
          {applyError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-800/50 dark:bg-rose-950/30">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />
              <p className="text-xs text-rose-700 dark:text-rose-300">{applyError}</p>
            </div>
          )}
          {backendPreviewIssue && <ProposalBackendPreviewIssuePanel issue={backendPreviewIssue} />}
          <ProposalSemanticDiffPanel
            groups={semanticDiff}
            decisions={nodeDecisions}
            onSetDecision={setNodeDecision}
            onSetDecisions={setNodeDecisions}
          />
          <ProposalApplyGatePanel gate={reviewApplyGate} />
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <Target size={13} className="text-primary" />
              <p className="text-xs font-semibold text-foreground">写入影响</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-center text-[10px]">
              <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">新建 {actionCounts.create}</span>
              <span className="rounded bg-amber-500/10 px-1.5 py-1 text-amber-700 dark:text-amber-300">更新 {actionCounts.update}</span>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              制作提案按后端 snapshot 写入：带 ID 的节点会更新，缺少 ID 的节点会新增，旧 snapshot 中未保留的节点会删除。
            </p>
          </div>
          <ProposalContextPanel
            context={proposalContext}
            decisions={nodeDecisions}
            onSetDecision={setNodeDecision}
          />
          <ProposalApplyPreviewPanel preview={currentApplyPreview} />
        </div>
      </div>

      <div className={cn('sticky bottom-0 z-10 shrink-0 border-t border-border bg-card/95 p-3 backdrop-blur', previewOnly ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2')}>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={applying || simulating}
          onClick={previewOnly ? resetNodeDecisions : onDiscard}
        >
          {previewOnly ? '清空决策' : '丢弃'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={applying || simulating}
          onClick={handleSimulate}
        >
          {simulating ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
          模拟写入
        </Button>
        {!previewOnly && (
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={applying || simulating || !projectId || reviewApplyGate.status !== 'ready'}
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

function ProposalReviewEmptyState({ onSwitchToStructure }: { onSwitchToStructure: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-lg border border-dashed border-border bg-background p-6">
        <div className="flex items-start gap-3">
          <GitBranch size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">当前没有可审阅的提案</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              审阅区只显示制作提案的 GitDiff 变更流。先打开一个制作提案草稿，或者回到结构视图继续编辑情绪段和情节。
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onSwitchToStructure}>
            <Route size={12} />
            回到结构
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
            <Link to={mergeSearch(ROUTES.project.preProduction, '', { tab: 'settings' })}>
              <Sparkles size={12} />
              设定工作台
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
            <Link to={mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' })}>
              <PackageCheck size={12} />
              素材需求
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

interface InlineProjectProposalEntry {
  key: string
  title: string
  detail: string
  target: string
  changeType: 'added' | 'modified' | 'deleted'
  kind: 'creative_references' | 'asset_slots'
  raw: Record<string, unknown>
}

interface InlineProjectProposalView {
  mode: 'patch' | 'snapshot'
  summary: string
  creativeReferences: InlineProjectProposalEntry[]
  assetSlots: InlineProjectProposalEntry[]
  impactNotes: string[]
}

function parseInlineProjectProposalDraft(
  draft: AgentDraft | null | undefined,
  creativeReferenceRecords: CreativeReferenceRecord[] = [],
  assetSlotRecords: AssetSlotRecord[] = [],
): InlineProjectProposalView | null {
  if (!draft) return null
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const proposal = isRecordValue(content.proposal) ? content.proposal : {}
    const mode = content.mode === 'snapshot' ? 'snapshot' as const : 'patch' as const
    const creativeReferences = asRecordArray(proposal.creative_references).map((item, index) => ({
      key: `${draft.id}:creative_references:${index}`,
      kind: 'creative_references' as const,
      title: asString(proposalField(item, ['name', 'title', 'label', 'kind']), `设定建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
      changeType: inlineProjectProposalChangeType(item),
      target: inlineProjectProposalChangeType(item) === 'deleted' ? `移出 #${item.id}` : typeof item.id === 'number' ? `合并到 #${item.id}` : '新增候选',
      raw: item,
    }))
    const assetSlots = asRecordArray(proposal.asset_slots).map((item, index) => ({
      key: `${draft.id}:asset_slots:${index}`,
      kind: 'asset_slots' as const,
      title: asString(proposalField(item, ['name', 'title', 'label', 'kind']), `素材建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
      changeType: inlineProjectProposalChangeType(item),
      target: inlineProjectProposalChangeType(item) === 'deleted' ? `移出 #${item.id}` : typeof item.id === 'number' ? `调整 #${item.id}` : '新增候选',
      raw: item,
    }))
    const snapshotDeleted = mode === 'snapshot'
      ? inferInlineProjectProposalSnapshotDeletes(draft, proposal, creativeReferenceRecords, assetSlotRecords)
      : { creativeReferences: [], assetSlots: [] }
    const impactNotes = [
      ...asRecordArray(content.impact_notes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...(Array.isArray(content.impact_notes) ? content.impact_notes.map((item) => asString(item)).filter(Boolean) : []),
    ].filter(Boolean)
    return {
      mode,
      summary: asString(content.summary, '暂无摘要'),
      creativeReferences: [...creativeReferences, ...snapshotDeleted.creativeReferences],
      assetSlots: [...assetSlots, ...snapshotDeleted.assetSlots],
      impactNotes,
    }
  } catch {
    return null
  }
}

function inferInlineProjectProposalSnapshotDeletes(
  draft: AgentDraft,
  proposal: Record<string, unknown>,
  creativeReferenceRecords: CreativeReferenceRecord[],
  assetSlotRecords: AssetSlotRecord[],
) {
  const proposedReferenceIds = new Set(asRecordArray(proposal.creative_references).map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0))
  const proposedAssetSlotIds = new Set(asRecordArray(proposal.asset_slots).map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0))
  const creativeReferences = creativeReferenceRecords
    .filter((record) => !['ignored', 'merged'].includes(String(record.status ?? '')))
    .flatMap((record) => {
    if (proposedReferenceIds.has(record.ID)) return []
    return [{
      key: `${draft.id}:creative_references:delete:${record.ID}`,
      kind: 'creative_references' as const,
      title: titleOfRecord(record),
      detail: String(record.description ?? '新提案未包含此设定，按 snapshot 语义视为删除候选。'),
      target: `移出 #${record.ID}`,
      changeType: 'deleted' as const,
      raw: { id: record.ID, fields: { name: titleOfRecord(record), status: 'ignored' } },
    }]
  })
  const assetSlots = assetSlotRecords
    .filter((record) => !['ignored', 'waived', 'merged'].includes(String(record.status ?? '')))
    .flatMap((record) => {
    if (proposedAssetSlotIds.has(record.ID)) return []
    return [{
      key: `${draft.id}:asset_slots:delete:${record.ID}`,
      kind: 'asset_slots' as const,
      title: titleOfRecord(record),
      detail: String(record.description ?? '新提案未包含此素材需求，按 snapshot 语义视为删除候选。'),
      target: `移出 #${record.ID}`,
      changeType: 'deleted' as const,
      raw: { id: record.ID, fields: { name: titleOfRecord(record), status: 'waived', kind: String(record.kind ?? 'image') } },
    }]
  })
  return { creativeReferences, assetSlots }
}

function inlineProjectProposalChangeType(item: Record<string, unknown>): InlineProjectProposalEntry['changeType'] {
  const status = asString(proposalField(item, ['status']))
  if (['ignored', 'waived'].includes(status)) return 'deleted'
  return typeof item.id === 'number' ? 'modified' : 'added'
}

function ProjectProposalReviewSummary({
  settingDraft,
  assetProposalDraft,
  projectName,
  productionName,
  creativeReferences,
  assetSlots,
}: {
  settingDraft: AgentDraft | null | undefined
  assetProposalDraft: AgentDraft | null | undefined
  projectName: string
  productionName: string
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
}) {
  const settingView = useMemo(() => parseInlineProjectProposalDraft(settingDraft, creativeReferences, []), [creativeReferences, settingDraft])
  const assetProposalView = useMemo(() => parseInlineProjectProposalDraft(assetProposalDraft, [], assetSlots), [assetProposalDraft, assetSlots])
  const deletedCount = (settingView?.creativeReferences ?? []).filter((entry) => entry.changeType === 'deleted').length
    + (assetProposalView?.assetSlots ?? []).filter((entry) => entry.changeType === 'deleted').length
  const hasDraft = Boolean(settingDraft || assetProposalDraft)
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Sparkles size={12} />
            上游提案审阅
          </div>
          <h2 className="mt-1 text-sm font-semibold text-foreground">设定与素材需求草稿</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {projectName} · {productionName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={hasDraft ? 'secondary' : 'outline'} className="h-6 rounded-full px-2 text-[10px]">
            {hasDraft ? '已加载' : '未加载'}
          </Badge>
          {settingDraft ? (
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Link to={withRouteParams(ROUTES.project.preProduction, { view: 'review', draftId: settingDraft.id })}>
                <Sparkles size={12} />
                打开设定审阅
              </Link>
            </Button>
          ) : null}
          {assetProposalDraft ? (
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Link to={withRouteParams(ROUTES.project.preProduction, { view: 'review', draftId: assetProposalDraft.id })}>
                <PackageCheck size={12} />
                打开素材需求审阅
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      {settingView || assetProposalView ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">设定资料</p>
              <p className="mt-1 text-xs font-medium text-foreground">{settingView?.creativeReferences.length ?? 0} 项</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">素材需求</p>
              <p className="mt-1 text-xs font-medium text-foreground">{assetProposalView?.assetSlots.length ?? 0} 项</p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">影响说明</p>
              <p className="mt-1 text-xs font-medium text-foreground">{(settingView?.impactNotes.length ?? 0) + (assetProposalView?.impactNotes.length ?? 0)} 条</p>
            </div>
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2">
              <p className="text-[10px] text-rose-700 dark:text-rose-300">删除候选</p>
              <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300">{deletedCount} 项</p>
            </div>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">{[settingView?.summary, assetProposalView?.summary].filter(Boolean).join(' / ')}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-border bg-muted/10 p-3">
              <p className="text-[10px] font-medium text-foreground">设定资料</p>
              <div className="mt-2 space-y-2">
                {(settingView?.creativeReferences ?? []).slice(0, 4).map((entry) => (
                  <div key={entry.key} className={cn('rounded border px-2 py-1.5 text-[10px]', entry.changeType === 'deleted' ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-background')}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{entry.title}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{entry.target}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{entry.detail}</p>
                  </div>
                ))}
                {!settingView?.creativeReferences.length ? <p className="text-[10px] text-muted-foreground">没有设定提案草稿。</p> : null}
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/10 p-3">
              <p className="text-[10px] font-medium text-foreground">素材需求</p>
              <div className="mt-2 space-y-2">
                {(assetProposalView?.assetSlots ?? []).slice(0, 4).map((entry) => (
                  <div key={entry.key} className={cn('rounded border px-2 py-1.5 text-[10px]', entry.changeType === 'deleted' ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-background')}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{entry.title}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{entry.target}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{entry.detail}</p>
                  </div>
                ))}
                {!assetProposalView?.assetSlots.length ? <p className="text-[10px] text-muted-foreground">没有素材需求提案草稿。</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
          还没有上游提案草稿。生成制作提案时，如果 agent 发现必须补齐项目级设定或素材需求，这里会显示对应草稿。
        </div>
      )}
    </section>
  )
}

function DecisionBadge({ decision }: { decision: 'accepted' | 'rejected' }) {
  return (
    <span className={cn(
      'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium',
      decision === 'accepted'
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    )}>
      {decision === 'accepted' ? '已接受' : '已拒绝'}
    </span>
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
  action: ProposalSnapshotAction
  kind: 'segment' | 'scene_moment' | 'content_unit' | 'keyframe' | 'creative_reference' | 'asset_slot'
}

interface ProposalContextItem {
  nodeKey: string
  action?: ProposalSnapshotAction
  title: string
  detail: string
  parent: string
}

interface ProposalContextResources {
  creativeReferences: ProposalContextItem[]
  assetSlots: ProposalContextItem[]
}

type ProposalSemanticDiffKind = 'structure' | 'content' | 'reference' | 'asset'
type ProposalSemanticDiffGroup = {
  key: string
  acceptKeys: string[]
  title: string
  detail: string
  action?: ProposalSnapshotAction
  kind: ProposalSemanticDiffKind
  nodeKeys: string[]
  visibleNodeKeys?: string[]
  stats: string[]
  children: ProposalSemanticDiffItem[]
}
type ProposalSemanticDiffItem = {
  key: string
  acceptKeys: string[]
  title: string
  detail: string
  action?: ProposalSnapshotAction
  kind: ProposalSemanticDiffKind
  before?: string
  after?: string
}
type ProposalSemanticDiffDecisionFilter = 'pending' | 'all' | 'accepted' | 'rejected'
type ProposalSemanticDiffActionFilter = 'all' | ProposalSnapshotAction
type ProposalSemanticDiffKindFilter = 'all' | ProposalSemanticDiffKind

function collectProposalReviewNodes(segments: ProposalSegmentNode[]): ProposalReviewNode[] {
  return segments.flatMap((segment, index) => collectSegmentProposalReviewNodes(segment, index))
}

function collectSegmentProposalReviewNodes(segment: ProposalSegmentNode, index: number): ProposalReviewNode[] {
  const segmentId = proposalNodeIdentity(segment, String(index))
  return [
    { key: proposalNodeDecisionKey('segment', segment, String(index)), action: proposalSnapshotAction(segment), kind: 'segment' },
    ...(segment.scene_moments ?? []).flatMap((moment, momentIndex) =>
      collectSceneProposalReviewNodes(moment, `${segmentId}-${momentIndex}`),
    ),
  ]
}

function collectSceneProposalReviewNodes(moment: ProposalSceneMomentNode, fallback: string): ProposalReviewNode[] {
  return [
    { key: proposalNodeDecisionKey('scene_moment', moment, fallback), action: proposalSnapshotAction(moment), kind: 'scene_moment' },
    ...(moment.content_units ?? []).flatMap((unit, index) => {
      const unitFallback = `${fallback}-content-${index}`
      return [
        {
          key: proposalNodeDecisionKey('content_unit', unit, unitFallback),
          action: proposalSnapshotAction(unit),
          kind: 'content_unit' as const,
        },
        ...(unit.keyframes ?? []).map((keyframe, keyframeIndex) => ({
          key: proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`),
          action: proposalSnapshotAction(keyframe),
          kind: 'keyframe' as const,
        })),
      ]
    }),
    ...(moment.keyframes ?? []).map((keyframe, index) => ({
      key: proposalNodeDecisionKey('keyframe', keyframe, `${fallback}-keyframe-${index}`),
      action: proposalSnapshotAction(keyframe),
      kind: 'keyframe' as const,
    })),
    ...(moment.creative_references ?? []).map((reference, index) => ({
      key: proposalNodeDecisionKey('creative_reference', reference, `${fallback}-reference-${index}`),
      action: proposalSnapshotAction(reference),
      kind: 'creative_reference' as const,
    })),
    ...(moment.asset_slots ?? []).map((slot, index) => ({
      key: proposalNodeDecisionKey('asset_slot', slot, `${fallback}-asset-${index}`),
      action: proposalSnapshotAction(slot),
      kind: 'asset_slot' as const,
    })),
  ]
}

function collectProposalContextResources(segments: ProposalSegmentNode[]): ProposalContextResources {
  const context: ProposalContextResources = {
    creativeReferences: [],
    assetSlots: [],
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
          action: proposalSnapshotAction(reference),
          title: reference.name || '未命名设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          parent,
        })
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        context.assetSlots.push({
          nodeKey: proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`),
          action: proposalSnapshotAction(slot),
          title: slot.name || '未命名素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          parent,
        })
      })

    })
  })

  return context
}

function buildProposalSemanticDiff(segments: ProposalSegmentNode[]): ProposalSemanticDiffGroup[] {
  return segments.map((segment, segmentIndex) => {
    const segmentId = proposalNodeIdentity(segment, String(segmentIndex))
    const segmentKey = proposalNodeDecisionKey('segment', segment, String(segmentIndex))
    const moments = segment.scene_moments ?? []
    const children: ProposalSemanticDiffItem[] = []

    moments.forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = proposalNodeDecisionKey('scene_moment', moment, momentFallback)
      children.push({
        key: momentKey,
        acceptKeys: [segmentKey, momentKey],
        title: moment.title || `情景 ${momentIndex + 1}`,
        detail: compactParts([moment.time_text, moment.location_text, moment.mood, moment.rationale]),
        action: proposalSnapshotAction(moment),
        kind: 'structure',
        before: proposalBeforeText(moment.before, ['action_text', 'description', 'title']),
        after: compactParts([moment.action_text, moment.description]),
      })
      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = proposalNodeDecisionKey('content_unit', unit, unitFallback)
        children.push({
          key: unitKey,
          acceptKeys: [segmentKey, momentKey, unitKey],
          title: unit.title || `制作项 ${unitIndex + 1}`,
          detail: compactParts([unit.kind, unit.shot_size, unit.camera_angle, unit.duration_sec ? `${unit.duration_sec}s` : '', unit.description]),
          action: proposalSnapshotAction(unit),
          kind: 'content',
          before: proposalBeforeText(unit.before, ['description', 'title']),
          after: compactParts([unit.description]),
        })
        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          children.push({
            key: keyframeKey,
            acceptKeys: [segmentKey, momentKey, unitKey, keyframeKey],
            title: keyframe.title || `镜头关键帧 ${keyframeIndex + 1}`,
            detail: compactParts([keyframe.description, keyframe.prompt]),
            action: proposalSnapshotAction(keyframe),
            kind: 'content',
            before: proposalBeforeText(keyframe.before, ['description', 'prompt', 'title']),
            after: compactParts([keyframe.description, keyframe.prompt]),
          })
        })
      })
      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        children.push({
          key: keyframeKey,
          acceptKeys: [segmentKey, momentKey, keyframeKey],
          title: keyframe.title || `情节预览画面 ${keyframeIndex + 1}`,
          detail: compactParts([keyframe.description, keyframe.prompt]),
          action: proposalSnapshotAction(keyframe),
          kind: 'content',
          before: proposalBeforeText(keyframe.before, ['description', 'prompt', 'title']),
          after: compactParts([keyframe.description, keyframe.prompt]),
        })
      })
      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        children.push({
          key: referenceKey,
          acceptKeys: [segmentKey, momentKey, referenceKey],
          title: reference.name || '设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          action: proposalSnapshotAction(reference),
          kind: 'reference',
        })
      })
      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        children.push({
          key: slotKey,
          acceptKeys: [segmentKey, momentKey, slotKey],
          title: slot.name || '素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          action: proposalSnapshotAction(slot),
          kind: 'asset',
        })
      })
    })

    return {
      key: segmentKey,
      title: segment.title || `编排段 ${segmentIndex + 1}`,
      detail: compactParts([segment.kind, segment.summary, segment.rationale]),
      action: proposalSnapshotAction(segment),
      kind: 'structure',
      acceptKeys: [segmentKey],
      nodeKeys: [segmentKey, ...children.map((item) => item.key)],
      stats: [
        `${moments.length} 情景`,
        `${children.filter((item) => item.kind === 'content').length} 内容分镜`,
        `${children.filter((item) => item.kind === 'reference').length} 设定引用`,
        `${children.filter((item) => item.kind === 'asset').length} 素材需求`,
      ],
      children,
    }
  })
}

function proposalBeforeText(before: Record<string, unknown> | undefined, keys: string[]) {
  if (!before) return ''
  return compactParts(keys.map((key) => before[key]))
}

function isProductionDiffItemBlockedByProjectBoundary(item: ProposalSemanticDiffItem) {
  return item.kind === 'reference' && item.action === 'create'
}

function proposalSemanticDiffAcceptKeys(item: ProposalSemanticDiffItem): string[] {
  return isProductionDiffItemBlockedByProjectBoundary(item) ? [] : item.acceptKeys
}

function ProposalSemanticDiffPanel({
  groups,
  decisions,
  onSetDecision,
  onSetDecisions,
}: {
  groups: ProposalSemanticDiffGroup[]
  decisions: ProposalNodeDecisions
  onSetDecision: (key: string, decision: 'accepted' | 'rejected') => void
  onSetDecisions: (keys: string[], decision: 'accepted' | 'rejected') => void
}) {
  const [decisionFilter, setDecisionFilter] = useState<ProposalSemanticDiffDecisionFilter>('pending')
  const [actionFilter, setActionFilter] = useState<ProposalSemanticDiffActionFilter>('all')
  const [kindFilter, setKindFilter] = useState<ProposalSemanticDiffKindFilter>('all')
  const summary = useMemo(() => summarizeProposalSemanticDiff(groups, decisions), [decisions, groups])
  const filteredGroups = useMemo(
    () => filterProposalSemanticDiffGroups(groups, decisions, { decisionFilter, actionFilter, kindFilter }),
    [actionFilter, decisionFilter, decisions, groups, kindFilter],
  )

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-4 text-[11px] text-muted-foreground">
        当前提案没有可审阅的制作变更。
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <GitBranch size={13} className="text-primary" />
          <p className="text-xs font-semibold text-foreground">变更流</p>
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{filteredGroups.length}/{groups.length} 段</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[10px]">
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">总计 {summary.total}</span>
          <span className="rounded bg-muted px-1.5 py-1 text-foreground">未审 {summary.pending}</span>
          <span className="rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-300">接受 {summary.accepted}</span>
          <span className="rounded bg-rose-500/10 px-1.5 py-1 text-rose-700 dark:text-rose-300">拒绝 {summary.rejected}</span>
        </div>
        <div className="mt-3 space-y-2">
          <ProposalDiffFilterRow
            items={[
              ['pending', '未审'],
              ['all', '全部'],
              ['accepted', '已接受'],
              ['rejected', '已拒绝'],
            ]}
            value={decisionFilter}
            onChange={(value) => setDecisionFilter(value as ProposalSemanticDiffDecisionFilter)}
          />
          <ProposalDiffFilterRow
            items={[
              ['all', '全部动作'],
              ['create', '新建'],
              ['update', '更新'],
            ]}
            value={actionFilter}
            onChange={(value) => setActionFilter(value as ProposalSemanticDiffActionFilter)}
          />
          <ProposalDiffFilterRow
            items={[
              ['all', '全部类型'],
              ['structure', '结构'],
              ['content', '内容'],
              ['reference', '设定'],
              ['asset', '素材'],
            ]}
            value={kindFilter}
            onChange={(value) => setKindFilter(value as ProposalSemanticDiffKindFilter)}
          />
        </div>
      </div>

      {filteredGroups.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-background p-4 text-[11px] text-muted-foreground">
          当前筛选下没有变更项。
        </div>
      )}

      {filteredGroups.map((group) => {
        const visibleKeys = visibleProposalSemanticDiffKeys(group)
        const groupDecision = summarizeGroupDecision(visibleKeys, decisions)
        return (
          <div key={group.key} className={cn('rounded-lg border border-border bg-background', groupDecision === 'rejected' && 'opacity-60')}>
            <div className="border-b border-border px-3 py-2">
              <div className="flex items-start gap-2">
                <ProposalDiffActionBadge action={group.action} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-semibold text-foreground">{group.title}</p>
                    {groupDecision !== 'mixed' && groupDecision && <DecisionBadge decision={groupDecision} />}
                    {groupDecision === 'mixed' && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">部分处理</span>}
                  </div>
                  {group.detail && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{group.detail}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {proposalSemanticDiffGroupStats(group).map((stat) => (
                      <span key={stat} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{stat}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5 pl-7">
                <Button size="sm" variant={groupDecision === 'accepted' ? 'secondary' : 'outline'} className="h-6 px-2 text-[10px]" onClick={() => onSetDecisions(uniqueStrings([group.key, ...group.children.flatMap((item): string[] => proposalSemanticDiffAcceptKeys(item))]), 'accepted')}>
                  接受可见项
                </Button>
                <Button size="sm" variant={groupDecision === 'rejected' ? 'secondary' : 'ghost'} className="h-6 px-2 text-[10px]" onClick={() => onSetDecisions(visibleKeys, 'rejected')}>
                  拒绝可见项
                </Button>
              </div>
            </div>
            <div className="divide-y divide-border/60">
              {group.children.map((item) => (
                <ProposalSemanticDiffRow
                  key={item.key}
                  item={item}
                  decision={decisions[item.key]}
                  onSetDecision={onSetDecision}
                  onSetDecisions={onSetDecisions}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function buildProposalApplyPreview(segments: ProposalSegmentNode[], decisions: ProposalNodeDecisions): ProposalApplyPreview {
  const preview: ProposalApplyPreview = {
    writePlan: [],
    rejected: [],
    pending: [],
    blocked: [],
  }

  function pushByDecision(item: ProposalApplyPreviewItem, decision: ProposalNodeDecision | undefined, blocked = false) {
    if (blocked) {
      preview.blocked.push(item)
    } else if (decision === 'accepted') {
      preview.writePlan.push(item)
    } else if (decision === 'rejected') {
      preview.rejected.push(item)
    } else {
      preview.pending.push(item)
    }
  }

  segments.forEach((segment, segmentIndex) => {
    const segmentId = proposalNodeIdentity(segment, String(segmentIndex))
    const segmentKey = proposalNodeDecisionKey('segment', segment, String(segmentIndex))
    const segmentDecision = decisions[segmentKey]
    const segmentTitle = segment.title || `编排段 ${segmentIndex + 1}`
    pushByDecision({
      key: segmentKey,
      title: segmentTitle,
      detail: compactParts([segment.kind, segment.summary, segment.rationale]),
      kind: 'segment',
      action: proposalSnapshotAction(segment),
    }, segmentDecision)

    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = proposalNodeDecisionKey('scene_moment', moment, momentFallback)
      const momentDecision = decisions[momentKey]
      const momentTitle = moment.title || `情景 ${momentIndex + 1}`
      const momentBlocked = momentDecision === 'accepted' && segmentDecision !== 'accepted'
      pushByDecision({
        key: momentKey,
        title: momentTitle,
        detail: compactParts([moment.time_text, moment.location_text, moment.mood, moment.action_text, moment.description]),
        kind: 'scene_moment',
        action: proposalSnapshotAction(moment),
        parent: segmentTitle,
      }, momentDecision, momentBlocked)

      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = proposalNodeDecisionKey('content_unit', unit, unitFallback)
        const unitDecision = decisions[unitKey]
        const unitTitle = unit.title || `制作项 ${unitIndex + 1}`
        const unitBlocked = unitDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: unitKey,
          title: unitTitle,
          detail: compactParts([unit.kind, unit.shot_size, unit.camera_angle, unit.duration_sec ? `${unit.duration_sec}s` : '', unit.description]),
          kind: 'content_unit',
          action: proposalSnapshotAction(unit),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, unitDecision, unitBlocked)

        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          const keyframeDecision = decisions[keyframeKey]
          const keyframeBlocked = keyframeDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted' || unitDecision !== 'accepted')
          pushByDecision({
            key: keyframeKey,
            title: keyframe.title || `镜头关键帧 ${keyframeIndex + 1}`,
            detail: compactParts([keyframe.description, keyframe.prompt]),
            kind: 'keyframe',
            action: proposalSnapshotAction(keyframe),
            parent: `${segmentTitle} / ${momentTitle} / ${unitTitle}`,
          }, keyframeDecision, keyframeBlocked)
        })
      })

      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        const keyframeDecision = decisions[keyframeKey]
        const keyframeBlocked = keyframeDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: keyframeKey,
          title: keyframe.title || `情节预览画面 ${keyframeIndex + 1}`,
          detail: compactParts([keyframe.description, keyframe.prompt]),
          kind: 'keyframe',
          action: proposalSnapshotAction(keyframe),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, keyframeDecision, keyframeBlocked)
      })

      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        const referenceDecision = decisions[referenceKey]
        const referenceBlocked = referenceDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted' || !snapshotNodeHasID(reference))
        pushByDecision({
          key: referenceKey,
          title: reference.name || '设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          kind: 'creative_reference',
          action: proposalSnapshotAction(reference),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, referenceDecision, referenceBlocked)
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        const slotDecision = decisions[slotKey]
        const slotBlocked = slotDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: slotKey,
          title: slot.name || '素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          kind: 'asset_slot',
          action: proposalSnapshotAction(slot),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, slotDecision, slotBlocked)
      })
    })
  })

  return preview
}

function ProposalApplyPreviewPanel({ preview }: { preview: ProposalApplyPreview }) {
  return (
    <div className="space-y-2">
      <ProposalApplyPreviewGroup
        tone="success"
        title="将写入"
        items={preview.writePlan}
        empty="还没有接受任何可写入项"
      />
      <ProposalApplyPreviewGroup
        tone="warning"
        title="依赖未接受"
        items={preview.blocked}
        empty="没有被父级决策阻塞的已接受项"
      />
      <ProposalApplyPreviewGroup
        tone="muted"
        title="未处理"
        items={preview.pending}
        empty="没有未审项"
      />
      <ProposalApplyPreviewGroup
        tone="danger"
        title="已拒绝"
        items={preview.rejected}
        empty="没有拒绝项"
      />
    </div>
  )
}

function BackendPreviewSemanticSummary({
  changes,
  warnings,
}: {
  changes: ProductionProposalPreviewSemanticChange[]
  warnings: ProductionProposalPreviewWarning[]
}) {
  if (changes.length === 0 && warnings.length === 0) return null
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-2">
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={12} className="shrink-0" />
            <p className="text-[11px] font-semibold">后端提示</p>
            <span className="ml-auto rounded bg-background/60 px-1.5 py-0.5 text-[10px]">{warnings.length}</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {warnings.slice(0, 3).map((warning, index) => (
              <p key={`${warning.code}-${index}`} className="text-[10px] leading-4">
                <span className="font-medium">{warning.code}</span>
                <span className="opacity-80"> · {warning.message}</span>
              </p>
            ))}
            {warnings.length > 3 && <p className="text-[10px] opacity-70">还有 {warnings.length - 3} 条提示未显示</p>}
          </div>
        </div>
      )}
      {changes.length > 0 && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-foreground">后端 Diff</p>
            <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{changes.length}</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {changes.slice(0, 6).map((change, index) => (
              <div key={`${change.kind}-${change.client_id ?? change.id ?? index}`} className="flex items-center gap-1.5 rounded bg-background/70 px-2 py-1">
                <ProposalDiffActionBadge action={change.action} compact />
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-foreground">{change.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{contentOrchestrationChangeKindLabel(change.kind)}</span>
              </div>
            ))}
            {changes.length > 6 && <p className="text-[10px] text-muted-foreground">还有 {changes.length - 6} 项未显示</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function buildProposalApplyGate(preview: ProposalApplyPreview, backendPreviewReady: boolean): ProposalApplyGate {
  if (preview.writePlan.length === 0) {
    return {
      status: 'empty',
      title: '还没有可写入内容',
      detail: '请先在变更队列中接受至少一个编排段和它的情景。',
    }
  }
  if (preview.blocked.length > 0) {
    return {
      status: 'blocked',
      title: '存在不能写入的变更',
      detail: '请处理依赖未接受的节点；如果变更是新增或更新设定/素材需求，需要回到设定工作台或素材需求工作台处理。',
    }
  }
  if (!backendPreviewReady) {
    return {
      status: 'needs_preview',
      title: '需要后端预览确认',
      detail: '当前决策还没有通过后端 dry-run。请先点击“模拟写入”完成校验。',
    }
  }
  if (preview.pending.length > 0) {
    return {
      status: 'ready',
      title: '可写入已接受内容',
      detail: `仍有 ${preview.pending.length} 项未处理，写入时会跳过它们。`,
    }
  }
  return {
    status: 'ready',
    title: '可以写入项目',
    detail: '所有可写入项已通过后端 dry-run，本次写入不会包含已拒绝项。',
  }
}

function ProposalStatusCard({
  status,
}: {
  status: {
    tone: 'neutral' | 'ok' | 'warn' | 'danger'
    icon: LucideIcon
    iconClassName?: string
    label: string
    title: string
    detail: string
  }
}) {
  const Icon = status.icon
  const toneClass = status.tone === 'ok'
    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
    : status.tone === 'warn'
      ? 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300'
      : status.tone === 'danger'
        ? 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300'
        : 'border-border bg-background text-muted-foreground'
  return (
    <div className={cn('rounded-lg border p-3', toneClass)}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon size={13} className={cn('shrink-0', status.iconClassName)} />
        <p className="text-xs font-semibold">{status.label}</p>
        <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium">{status.title}</span>
      </div>
      <p className="mt-1 text-[11px] leading-4 opacity-85">{status.detail}</p>
    </div>
  )
}

function ProposalApplyGatePanel({ gate, compact = false }: { gate: ProposalApplyGate; compact?: boolean }) {
  const toneClass = gate.status === 'ready'
    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
    : gate.status === 'blocked'
      ? 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300'
      : gate.status === 'empty'
        ? 'border-border bg-background text-muted-foreground'
        : 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300'
  const Icon = gate.status === 'ready' ? CheckCircle2 : gate.status === 'blocked' ? AlertCircle : Eye
  return (
    <div className={cn('rounded-lg border', compact ? 'p-2.5' : 'p-3', toneClass)}>
      <div className="flex items-center gap-2">
        <Icon size={13} className="shrink-0" />
        <p className="text-xs font-semibold">{gate.title}</p>
      </div>
      {!compact && <p className="mt-1 text-[11px] leading-4 opacity-80">{gate.detail}</p>}
    </div>
  )
}

function ProposalBackendPreviewIssuePanel({ issue }: { issue: ProposalBackendPreviewIssue }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300">
      <div className="flex items-start gap-2">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold">后端预览未通过</p>
            {issue.code && <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10px]">{issue.code}</span>}
          </div>
          <p className="mt-1 text-[11px] leading-4">{issue.message}</p>
          {issue.detail && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 text-[10px] leading-4">{issue.detail}</pre>}
          <p className="mt-2 text-[10px] leading-4 opacity-80">请回到变更队列调整接受/拒绝决策，或重新生成缺少 ID 的复用/更新节点后再预览。</p>
        </div>
      </div>
    </div>
  )
}

function ProposalApplyPreviewGroup({
  title,
  items,
  empty,
  tone,
}: {
  title: string
  items: ProposalApplyPreviewItem[]
  empty: string
  tone: 'success' | 'warning' | 'danger' | 'muted'
}) {
  const toneClass = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300'
      : tone === 'danger'
        ? 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300'
        : 'border-border bg-background text-muted-foreground'

  return (
    <div className={cn('rounded-lg border p-3', toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{title}</p>
        <span className="rounded bg-background/60 px-1.5 py-0.5 text-[10px]">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[11px] leading-4 opacity-80">{empty}</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {items.slice(0, 8).map((item) => (
            <div key={item.key} className="rounded bg-background/70 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <ProposalDiffActionBadge action={item.action} compact />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{item.title}</span>
                <span className="shrink-0 text-[10px] opacity-70">{proposalApplyPreviewKindLabel(item.kind)}</span>
              </div>
              {item.parent && <p className="mt-0.5 truncate text-[10px] opacity-70">{item.parent}</p>}
              {item.detail && <p className="mt-1 line-clamp-2 text-[10px] leading-4 opacity-80">{item.detail}</p>}
            </div>
          ))}
          {items.length > 8 && <p className="text-[10px] opacity-70">还有 {items.length - 8} 项未显示</p>}
        </div>
      )}
    </div>
  )
}

function proposalApplyPreviewKindLabel(kind: ProposalApplyPreviewItem['kind']) {
  if (kind === 'segment') return '编排段'
  if (kind === 'scene_moment') return '情景'
  if (kind === 'content_unit') return '内容'
  if (kind === 'keyframe') return '画面锚点'
  if (kind === 'creative_reference') return '设定'
  return '素材'
}

function ProposalDiffActionBadge({ action, compact = false }: { action: ProposalSnapshotAction | undefined; compact?: boolean }) {
  const cls = compact ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[9px]'
  if (action === 'update') {
    return <span className={cn('shrink-0 rounded font-mono font-medium text-amber-600 dark:text-amber-400', cls)}>~</span>
  }
  return <span className={cn('shrink-0 rounded font-mono font-medium text-emerald-600 dark:text-emerald-400', cls)}>+</span>
}

function contentOrchestrationChangeKindLabel(kind: string) {
  if (kind === 'segment') return '编排段'
  if (kind === 'scene_moment') return '情景'
  if (kind === 'content_unit') return '内容'
  if (kind === 'keyframe') return '画面锚点'
  if (kind === 'creative_reference') return '设定'
  if (kind === 'asset_slot') return '素材'
  return kind
}

function parseProposalBackendPreviewIssue(error: unknown): ProposalBackendPreviewIssue {
  const responseData = isRecordValue((error as { response?: { data?: unknown } })?.response?.data)
    ? (error as { response: { data: APIErrorBody } }).response.data
    : undefined
  const message = responseData ? translateApiError(responseData, 'common.requestFailed') : error instanceof Error ? error.message : '后端预览失败'
  const debug = responseData?.debug
  const detail = typeof debug === 'string'
    ? debug
    : debug !== undefined
      ? JSON.stringify(debug, null, 2)
      : undefined
  return {
    message,
    detail,
    code: responseData?.code,
  }
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function nestedFields(item: Record<string, unknown>): Record<string, unknown> {
  return isRecord(item.fields) ? item.fields : {}
}

function proposalField(item: Record<string, unknown>, keys: string[]): unknown {
  const fields = nestedFields(item)
  for (const key of keys) {
    if (item[key] !== undefined) return item[key]
    if (fields[key] !== undefined) return fields[key]
  }
  return undefined
}

function ProposalDiffFilterRow({
  items,
  value,
  onChange,
}: {
  items: Array<[string, string]>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {items.map(([itemValue, label]) => (
        <button
          key={itemValue}
          type="button"
          onClick={() => onChange(itemValue)}
          className={cn(
            'h-6 shrink-0 rounded px-2 text-[10px] font-medium transition-colors',
            value === itemValue ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ProposalSemanticDiffRow({
  item,
  decision,
  onSetDecision,
  onSetDecisions,
}: {
  item: ProposalSemanticDiffItem
  decision?: ProposalNodeDecision
  onSetDecision: (key: string, decision: 'accepted' | 'rejected') => void
  onSetDecisions: (keys: string[], decision: 'accepted' | 'rejected') => void
}) {
  const Icon = item.kind === 'reference' ? Sparkles : item.kind === 'asset' ? PackageCheck : item.kind === 'content' ? Film : Route
  const projectBoundaryBlocked = isProductionDiffItemBlockedByProjectBoundary(item)
  return (
    <div className={cn(
      'border-l-2 px-3 py-2',
      item.action === 'update' ? 'border-l-amber-400 bg-amber-500/5' : 'border-l-emerald-400 bg-emerald-500/5',
      decision === 'rejected' && 'opacity-60',
    )}>
      <div className="flex items-start gap-2">
        <Icon size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
        <ProposalDiffActionBadge action={item.action} compact />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[11px] font-medium text-foreground">{item.title}</p>
            {decision && <DecisionBadge decision={decision} />}
            {!decision && projectBoundaryBlocked && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300">回上游工作台</span>}
          </div>
          {item.detail && <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.detail}</p>}
          {(item.before || item.after) && (
            <div className="mt-2 grid gap-1.5 text-[10px] leading-4">
              {item.before && <p className="rounded bg-rose-500/10 px-2 py-1 text-rose-700 dark:text-rose-300">原：{item.before}</p>}
              {item.after && <p className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">新：{item.after}</p>}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5 pl-12">
        <Button
          size="sm"
          variant={decision === 'accepted' ? 'secondary' : 'outline'}
          className="h-6 px-2 text-[10px]"
          onClick={() => onSetDecisions(projectBoundaryBlocked ? [] : item.acceptKeys, 'accepted')}
          disabled={projectBoundaryBlocked}
          title={projectBoundaryBlocked ? '设定和素材需求需要回到设定工作台或素材需求工作台处理' : undefined}
        >
          {projectBoundaryBlocked ? '回上游工作台' : '接受'}
        </Button>
        <Button size="sm" variant={decision === 'rejected' ? 'secondary' : 'ghost'} className="h-6 px-2 text-[10px]" onClick={() => onSetDecision(item.key, 'rejected')}>
          拒绝
        </Button>
      </div>
    </div>
  )
}

function summarizeGroupDecision(keys: string[], decisions: ProposalNodeDecisions): ProposalNodeDecision | 'mixed' | undefined {
  const decided = keys.map((key) => decisions[key]).filter(Boolean)
  if (decided.length === 0) return undefined
  if (decided.length !== keys.length) return 'mixed'
  return decided.every((decision) => decision === 'accepted') ? 'accepted'
    : decided.every((decision) => decision === 'rejected') ? 'rejected'
      : 'mixed'
}

function visibleProposalSemanticDiffKeys(group: ProposalSemanticDiffGroup) {
  return group.visibleNodeKeys ?? group.nodeKeys
}

function proposalSemanticDiffGroupStats(group: ProposalSemanticDiffGroup): string[] {
  return [
    `${group.children.filter((item) => item.kind === 'structure').length} 情景`,
    `${group.children.filter((item) => item.kind === 'content').length} 内容分镜`,
    `${group.children.filter((item) => item.kind === 'reference').length} 设定引用`,
    `${group.children.filter((item) => item.kind === 'asset').length} 素材需求`,
  ]
}

function summarizeProposalSemanticDiff(groups: ProposalSemanticDiffGroup[], decisions: ProposalNodeDecisions) {
  const keys = groups.flatMap((group) => group.nodeKeys)
  const accepted = keys.filter((key) => decisions[key] === 'accepted').length
  const rejected = keys.filter((key) => decisions[key] === 'rejected').length
  return {
    total: keys.length,
    accepted,
    rejected,
    pending: Math.max(0, keys.length - accepted - rejected),
  }
}

function filterProposalSemanticDiffGroups(
  groups: ProposalSemanticDiffGroup[],
  decisions: ProposalNodeDecisions,
  filters: {
    decisionFilter: ProposalSemanticDiffDecisionFilter
    actionFilter: ProposalSemanticDiffActionFilter
    kindFilter: ProposalSemanticDiffKindFilter
  },
) {
  return groups.flatMap((group) => {
    const groupMatches = semanticDiffNodeMatches({
      key: group.key,
      action: group.action,
      kind: group.kind,
    }, decisions, filters)
	    const children = group.children.filter((item) => semanticDiffNodeMatches(item, decisions, filters))
	    if (!groupMatches && children.length === 0) return []
	    return [{
	      ...group,
	      visibleNodeKeys: [
	        ...(groupMatches ? [group.key] : []),
	        ...children.map((item) => item.key),
	      ],
	      children,
	    }]
	  })
	}

function semanticDiffNodeMatches(
  node: { key: string; action?: ProposalSnapshotAction; kind: ProposalSemanticDiffKind },
  decisions: ProposalNodeDecisions,
  filters: {
    decisionFilter: ProposalSemanticDiffDecisionFilter
    actionFilter: ProposalSemanticDiffActionFilter
    kindFilter: ProposalSemanticDiffKindFilter
  },
) {
  const decision = decisions[node.key]
  const decisionMatched = filters.decisionFilter === 'all'
    || (filters.decisionFilter === 'pending' ? !decision : decision === filters.decisionFilter)
  const actionMatched = filters.actionFilter === 'all' || normalizeProposalSemanticAction(node.action) === filters.actionFilter
  const kindMatched = filters.kindFilter === 'all' || node.kind === filters.kindFilter
  return decisionMatched && actionMatched && kindMatched
}

function normalizeProposalSemanticAction(action?: ProposalSnapshotAction): ProposalSemanticDiffActionFilter {
  return action === 'update' ? 'update' : 'create'
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
      <ProposalContextGroup icon={Sparkles} title="设定资料" items={context.creativeReferences} empty="本提案没有设定资料引用" decisions={decisions} onSetDecision={onSetDecision} />
      <ProposalContextGroup icon={PackageCheck} title="素材需求" items={context.assetSlots} empty="本提案没有素材需求" decisions={decisions} onSetDecision={onSetDecision} />
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
                <ProposalDiffActionBadge action={item.action} compact />
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
                  <Button
                    size="sm"
                    variant={decision === 'accepted' ? 'secondary' : 'outline'}
                    className="h-6 px-2 text-[10px]"
                    onClick={() => onSetDecision(item.nodeKey, 'accepted')}
                  >
                    接受
	                  </Button>
	                  <Button size="sm" variant={decision === 'rejected' ? 'secondary' : 'ghost'} className="h-6 px-2 text-[10px]" onClick={() => onSetDecision(item.nodeKey, 'rejected')}>
	                    拒绝
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
  const counts = { create: 0, update: 0 }
  function add(node: { id?: number | null }) {
    if (proposalSnapshotAction(node) === 'update') counts.update += 1
    else counts.create += 1
  }
  for (const segment of segments) {
    add(segment)
    for (const moment of segment.scene_moments ?? []) {
      add(moment)
      for (const unit of moment.content_units ?? []) {
        add(unit)
        for (const keyframe of unit.keyframes ?? []) add(keyframe)
      }
      for (const keyframe of moment.keyframes ?? []) add(keyframe)
      for (const reference of moment.creative_references ?? []) add(reference)
      for (const slot of moment.asset_slots ?? []) add(slot)
    }
  }
  return counts
}

function proposalDecisionSnapshotKey(nodes: ProposalReviewNode[], decisions: ProposalNodeDecisions) {
  return nodes
    .map((node) => `${node.key}=${decisions[node.key] ?? 'pending'}`)
    .join('|')
}

function findProductionProposalSnapshotIssue(proposal: { segments: ProposalSegmentNode[] }): { label: string } | null {
  for (const segment of proposal.segments) {
    for (const moment of segment.scene_moments ?? []) {
      for (const reference of moment.creative_references ?? []) {
        if (!snapshotNodeHasID(reference)) {
          return { label: reference.name ?? reference.client_id ?? '设定资料' }
        }
      }
    }
  }
  return null
}

function snapshotNodeHasID(node: { id?: number | null }) {
  return typeof node.id === 'number' && node.id > 0
}

function proposalSnapshotAction(node: { id?: number | null }): ProposalSnapshotAction {
  return snapshotNodeHasID(node) ? 'update' : 'create'
}

function normalizeTitleKey(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function buildProductionCurrentOverview(input: {
  production?: (SemanticEntityRecord & { name?: string; status?: string }) | null
  scriptVersion?: ScriptVersion | null
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
}): ContextOverview {
  const latestSegment = input.segments.at(-1) ?? null
  const latestMoment = input.sceneMoments.at(-1) ?? null
  const nextStep = !input.scriptVersion
    ? ['先绑定一个剧本版本，才能基于现状审阅编排。']
    : input.segments.length === 0
      ? ['当前还没有编排段，先准备一版制作提案草稿。']
      : ['可继续审阅制作提案草稿，再按 Git Diff 式确认变更。']

  return {
    position: [
      `制作：${titleOfRecord(input.production)}`,
      input.production?.status ? `状态：${String(input.production.status)}` : '状态：未设置',
      input.scriptVersion ? `剧本：${input.scriptVersion.title}` : '剧本：未绑定',
    ],
    sourceLabel: input.scriptVersion?.title ?? '当前现状',
    source: [
      `编排段 ${input.segments.length}`,
      `情景 ${input.sceneMoments.length}`,
      `设定资料 ${input.creativeReferences.length}`,
      `素材需求 ${input.assetSlots.length}`,
    ],
    relations: [
      latestSegment ? `最新编排段：${titleOfRecord(latestSegment)}` : '暂无编排段',
      latestMoment ? `最新情景：${titleOfRecord(latestMoment)}` : '暂无情景',
      input.assetSlots.length > 0 ? '素材需求已覆盖部分当前制作上下文' : '当前还没有素材需求',
    ],
    nextStep,
    primaryActionLabel: input.scriptVersion ? '审阅制作提案' : '绑定剧本',
    primaryActionIcon: input.scriptVersion ? Wand2 : ScrollText,
  }
}

function buildProductionDraftSeedMetadata(input: {
  projectId: number
  production?: (SemanticEntityRecord & { script_version_id?: number; name?: string }) | null
  scriptVersion?: ScriptVersion | null
  projectScripts: ScriptVersion[]
  modelRef: string
}) {
  const body = (input.scriptVersion?.content || input.scriptVersion?.raw_source || '').trim()
  return {
    mode: 'snapshot',
    include: ['production', 'production_script_brief', 'project_scripts'],
    hydrated: true,
    hydratedAt: new Date().toISOString(),
    modelRef: input.modelRef,
    data: {
      production: input.production ? summarizeDraftSeedEntity(input.production) : null,
      production_script_brief: {
        productionId: input.production?.ID,
        scriptVersionId: input.scriptVersion?.ID,
        scriptVersionTitle: input.scriptVersion?.title,
        scriptVersionUpdatedAt: input.scriptVersion?.UpdatedAt,
        brief: input.production?.description || input.scriptVersion?.summary || '',
        body_length: body.length,
      },
      project_scripts: input.projectScripts.map((script) => ({
        ID: script.ID,
        project_id: script.project_id,
        script_id: script.script_id,
        title: script.title,
        source_type: script.source_type,
        summary: script.summary,
        status: script.status,
        UpdatedAt: script.UpdatedAt,
      })),
    },
    sourceVersions: {
      production: input.production ? { id: input.production.ID, updatedAt: input.production.UpdatedAt } : null,
      production_script_brief: input.scriptVersion ? { id: input.scriptVersion.ID, updatedAt: input.scriptVersion.UpdatedAt } : null,
      project_scripts: input.projectScripts.map((script) => ({ id: script.ID, updatedAt: script.UpdatedAt })),
    },
    target: {
      projectId: input.projectId,
      entityType: 'production',
      entityId: input.production?.ID,
    },
  }
}

function summarizeDraftSeedEntity(record: SemanticEntityRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of ['ID', 'project_id', 'script_version_id', 'name', 'title', 'description', 'status', 'source_type', 'UpdatedAt']) {
    if (record[key] !== undefined) out[key] = record[key]
  }
  return out
}



function AgentRunStatusBadge({ status }: { status: AgentRun['status'] }) {
  const map: Record<AgentRun['status'], { label: string; cls: string }> = {
    queued: { label: '排队中', cls: 'bg-slate-500/10 text-slate-600' },
    in_progress: { label: '运行中', cls: 'bg-blue-500/10 text-blue-600' },
    requires_action: { label: '等待确认', cls: 'bg-amber-500/10 text-amber-600' },
    completed: { label: '已完成', cls: 'bg-emerald-500/10 text-emerald-600' },
    completed_with_warnings: { label: '完成(有警告)', cls: 'bg-amber-500/10 text-amber-600' },
    failed: { label: '失败', cls: 'bg-rose-500/10 text-rose-600' },
    cancelled: { label: '已停止', cls: 'bg-muted text-muted-foreground' },
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

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function referencesForOwner(ownerType: string, ownerId: number, lookup: OrchestrationLookup) {
  return (lookup.usagesByOwnerKey.get(ownerKey(ownerType, ownerId)) ?? [])
    .map((usage) => usage.creative_reference_id ? lookup.creativeReferenceById.get(Number(usage.creative_reference_id)) : null)
    .filter((reference): reference is CreativeReferenceRecord => Boolean(reference))
}

function formatOwnerLabel(ownerType?: string, ownerId?: number, lookup?: OrchestrationLookup) {
  if (!ownerType || !ownerId || !lookup) return ''
  const key = ownerKey(ownerType, ownerId)
  if (ownerType === 'segment') return lookup.segmentById.get(ownerId) ? `编排段 · ${titleOfRecord(lookup.segmentById.get(ownerId))}` : `编排段 #${ownerId}`
  if (ownerType === 'scene_moment') return lookup.sceneMomentById.get(ownerId) ? `情景 · ${titleOfRecord(lookup.sceneMomentById.get(ownerId))}` : `情景 #${ownerId}`
  if (ownerType === 'content_unit') return lookup.contentUnitById.get(ownerId) ? `下游制作项 · ${titleOfRecord(lookup.contentUnitById.get(ownerId))}` : `下游制作项 #${ownerId}`
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
      units.length > 0 ? `下游制作项：\n${units.map(serializeContentUnit).join('\n\n')}` : '',
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
      units.length > 0 ? `下游制作项：\n${units.map(serializeContentUnit).join('\n\n')}` : '',
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
      relatedUnits.length > 0 ? `相关内容：${relatedUnits.map((item) => titleOfRecord(item)).join(' / ')}` : '',
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
      slot.prompt_hint ? `创作提示：${slot.prompt_hint}` : '',
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
      `下游制作项：${titleOfRecord(unit)}`,
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

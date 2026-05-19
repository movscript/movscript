import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Film,
  FileText,
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
  type SemanticEntityPayload,
} from '@/api/semanticEntities'
import { buildCommandFirstClientInput, buildPageKey } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import { cn } from '@/lib/utils'
import { translateApiError, type APIErrorBody } from '@/lib/apiError'
import { isGeneratedKeyframeCandidateRecord } from '@/lib/agentGeneratedResourceBinding'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import {
  buildEmptyProductionProposalDraftContent,
  PRODUCTION_PROPOSAL_DRAFT_SCHEMA,
} from '@/lib/productionProposalDraft'
import { localAgentClient, type AgentDraft, type AgentRun, type AgentRunStep } from '@/lib/localAgentClient'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@movscript/ui'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EntityFilter = 'all' | 'segments' | 'sceneMoments' | 'writingExpressions' | 'creativeReferences' | 'assetSlots' | 'contentUnits'
type AnalysisScope = 'production' | 'segments' | 'segmentAnalysis' | 'sceneMoments' | 'creativeReferences' | 'assetSlots' | 'contentUnits'
type WorkspaceView = 'structure' | 'review'
type WritingExpressionType = 'dialogue' | 'action' | 'silence' | 'narration' | 'subtitle' | 'visual'
type SegmentRecord = SemanticEntityRecord & {
  production_id?: number
  title?: string; kind?: string; summary?: string; content?: string
  source_range?: string; order?: number; status?: string; script_version_id?: number; script_block_id?: number
}
type SceneMomentRecord = SemanticEntityRecord & {
  segment_id?: number; title?: string; time_text?: string; location_text?: string
  action_text?: string; condition_text?: string; mood?: string; order?: number; status?: string; description?: string; script_block_id?: number
}
type CreativeReferenceRecord = SemanticEntityRecord & {
  name?: string; kind?: string; importance?: string; status?: string; description?: string; content?: string; alias?: string
}
type AssetSlotRecord = SemanticEntityRecord & {
  production_id?: number; name?: string; kind?: string; priority?: string; status?: string
  description?: string; owner_type?: string; owner_id?: number
}
type ContentUnitRecord = SemanticEntityRecord & {
  production_id?: number; segment_id?: number; scene_moment_id?: number
  title?: string; kind?: string; order?: number; duration_sec?: number; description?: string
  shot_size?: string; camera_angle?: string; camera_motion?: string; status?: string; prompt?: string; script_block_id?: number
}
type ScriptBlockRecord = SemanticEntityRecord & {
  script_id?: number; script_version_id?: number; parent_block_id?: number
  kind?: string; speaker?: string; content?: string; summary?: string; title?: string
  order?: number; status?: string; start_line?: number; end_line?: number
}
type WritingExpressionRecord = SemanticEntityRecord & {
  scene_moment_id?: number; script_block_id?: number; kind?: WritingExpressionType
  speaker?: string; text?: string; note?: string; intent?: string; order?: number
}
type KeyframeRecord = SemanticEntityRecord & {
  production_id?: number; scene_moment_id?: number; content_unit_id?: number
  title?: string; description?: string; prompt?: string; order?: number; status?: string
}

interface OrchestrationData {
  productions: (SemanticEntityRecord & { script_version_id?: number; name?: string })[]
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  creativeReferenceUsages: SemanticEntityRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  scriptBlocks: ScriptBlockRecord[]
  writingExpressions: WritingExpressionRecord[]
  keyframes: KeyframeRecord[]
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

type ProposalSnapshotAction = 'create' | 'update' | 'delete'

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
  script_block_id?: number
  before?: Record<string, unknown>
  keyframes?: ProposalKeyframeNode[]
  __delete?: boolean
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
  __delete?: boolean
}
interface ProposalCreativeRefNode {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
  __delete?: boolean
}
interface ProposalAssetSlotNode {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  description?: string
  priority?: string
  source_label?: string
  __delete?: boolean
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
  script_block_id?: number
  content_units?: ProposalContentUnitNode[]
  creative_references?: ProposalCreativeRefNode[]
  asset_slots?: ProposalAssetSlotNode[]
  keyframes?: ProposalKeyframeNode[]
  rationale?: string
  before?: Record<string, unknown>
  __delete?: boolean
}
interface ProposalSegmentNode {
  id?: number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  status?: string
  script_block_id?: number
  scene_moments?: ProposalSceneMomentNode[]
  rationale?: string
  before?: Record<string, unknown>
  __delete?: boolean
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
  actions: { create: number; update: number; delete: number }
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
  { key: 'sceneMoments', label: '情节结构', icon: Route },
  { key: 'writingExpressions', label: '表达条目', icon: ScrollText },
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
  shot: '镜头',
  voiceover: '旁白/画外音',
  dialogue_audio: '对白音频',
  sound: '音效',
  music_beat: '节拍',
  subtitle: '字幕',
  caption_card: '字幕卡',
  transition: '转场',
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadOrchestrationData(projectId: number): Promise<OrchestrationData> {
  const [productions, segments, sceneMoments, creativeReferences, creativeReferenceUsages, assetSlots, contentUnits, scriptBlocks, writingExpressions, keyframes] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('productions')),
    listSemanticEntities(projectId, semanticEntityConfig('segments')),
    listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferences')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferenceUsages')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
    listSemanticEntities(projectId, semanticEntityConfig('scriptBlocks')),
    listSemanticEntities(projectId, semanticEntityConfig('writingExpressions')),
    listSemanticEntities(projectId, semanticEntityConfig('keyframes')),
  ])
  return {
    productions,
    segments: segments as SegmentRecord[],
    sceneMoments: sceneMoments as SceneMomentRecord[],
    creativeReferences: creativeReferences as CreativeReferenceRecord[],
    creativeReferenceUsages,
    assetSlots: assetSlots as AssetSlotRecord[],
    contentUnits: contentUnits as ContentUnitRecord[],
    scriptBlocks: scriptBlocks as ScriptBlockRecord[],
    writingExpressions: writingExpressions as WritingExpressionRecord[],
    keyframes: keyframes as KeyframeRecord[],
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

  const [createType, setCreateType] = useState<EntityFilter | null>(null)
  const [editEntry, setEditEntry] = useState<{ type: EntityFilter; record: SemanticEntityRecord } | null>(null)
  const [proposalPreviewDraft, setProposalPreviewDraft] = useState<ProposalDraftContent | null>(null)
  const [proposalNodeDecisions, setProposalNodeDecisions] = useState<ProposalNodeDecisions>({})
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('structure')
  const [selectedWritingMomentId, setSelectedWritingMomentId] = useState<number | null>(null)
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
  const scriptSourceText = scriptSourceTextForVersion(selectedScriptVersion)
  const scriptText = scriptSourceText.trim()
  const canLaunchLinkedProposal = Boolean(scriptText) && !isFetchingScriptVersions
  const bindScriptVersionMutation = useMutation({
    mutationFn: async (scriptVersionId: number | null) => {
      if (!projectId || !effectiveProductionId) throw new Error('请先选择制作')
      return updateSemanticEntity(projectId, semanticEntityConfig('productions'), effectiveProductionId, {
        script_version_id: scriptVersionId,
        source_type: scriptVersionId ? 'script' : 'direct',
      })
    },
    onSuccess: () => {
      toast.success('制作剧本已更新')
      void refetch()
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: scriptVersionsQueryKey })
    },
    onError: (error) => {
      const apiErrorData = (error as { response?: { data?: unknown } })?.response?.data
      const responseData = isRecordValue(apiErrorData) ? apiErrorData as APIErrorBody : null
      toast.error(responseData ? translateApiError(responseData, 'common.requestFailed') : error instanceof Error ? error.message : '绑定剧本失败')
    },
  })
  const bindSceneMomentScriptBlockMutation = useMutation({
    mutationFn: async ({ momentId, scriptBlockId }: { momentId: number; scriptBlockId: number | null }) => {
      if (!projectId) throw new Error('请先选择项目')
      return updateSemanticEntity(projectId, semanticEntityConfig('sceneMoments'), momentId, {
        script_block_id: scriptBlockId,
      })
    },
    onSuccess: () => {
      toast.success('当前情节参考已更新')
      void refetch()
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      const apiErrorData = (error as { response?: { data?: unknown } })?.response?.data
      const responseData = isRecordValue(apiErrorData) ? apiErrorData as APIErrorBody : null
      toast.error(responseData ? translateApiError(responseData, 'common.requestFailed') : error instanceof Error ? error.message : '绑定情节参考失败')
    },
  })
  const createAndBindSceneMomentScriptBlockMutation = useMutation({
    mutationFn: async ({ momentId, startLine, endLine }: { momentId: number; startLine: number; endLine: number }) => {
      if (!projectId) throw new Error('请先选择项目')
      if (!selectedScriptVersion) throw new Error('请先绑定制作剧本')
      const content = scriptBlockContentFromLines(scriptSourceText, startLine, endLine)
      if (!content.trim()) throw new Error('请选择有正文的剧本范围')
      const blocksForVersion = data?.scriptBlocks?.filter((block) => Number(block.script_version_id) === selectedScriptVersion.ID) ?? []
      const inferred = inferScriptBlockKind(content)
      const block = await createSemanticEntity(projectId, semanticEntityConfig('scriptBlocks'), {
        script_id: selectedScriptVersion.script_id,
        script_version_id: selectedScriptVersion.ID,
        order: blocksForVersion.length + 1,
        kind: inferred.kind,
        speaker: inferred.speaker,
        content,
        start_line: startLine,
        end_line: endLine,
        start_char: 0,
        end_char: 0,
        status: 'active',
      }) as ScriptBlockRecord
      await updateSemanticEntity(projectId, semanticEntityConfig('sceneMoments'), momentId, {
        script_block_id: block.ID,
      })
      return block
    },
    onSuccess: () => {
      toast.success('剧本块已创建并绑定')
      void refetch()
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      const apiErrorData = (error as { response?: { data?: unknown } })?.response?.data
      const responseData = isRecordValue(apiErrorData) ? apiErrorData as APIErrorBody : null
      toast.error(responseData ? translateApiError(responseData, 'common.requestFailed') : error instanceof Error ? error.message : '创建剧本块失败')
    },
  })
  const updateSceneMomentMutation = useMutation({
    mutationFn: async ({ momentId, payload }: { momentId: number; payload: SemanticEntityPayload }) => {
      if (!projectId) throw new Error('请先选择项目')
      return updateSemanticEntity(projectId, semanticEntityConfig('sceneMoments'), momentId, payload)
    },
    onSuccess: () => {
      toast.success('情节已更新')
      void refetch()
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      const apiErrorData = (error as { response?: { data?: unknown } })?.response?.data
      const responseData = isRecordValue(apiErrorData) ? apiErrorData as APIErrorBody : null
      toast.error(responseData ? translateApiError(responseData, 'common.requestFailed') : error instanceof Error ? error.message : '保存情节失败')
    },
  })
  const updateWritingExpressionMutation = useMutation({
    mutationFn: async ({ target, payload }: { target: WritingExpressionEditTarget; payload: WritingExpressionSavePayload }) => {
      if (!projectId) throw new Error('请先选择项目')
      if (target.kind === 'writingExpressions') {
        const entityPayload = writingExpressionPayload(payload)
        return updateSemanticEntity(projectId, semanticEntityConfig('writingExpressions'), target.id, {
          kind: entityPayload.kind,
          speaker: entityPayload.speaker,
          text: entityPayload.text,
          note: entityPayload.note,
          intent: entityPayload.intent,
        })
      }
      return createSemanticEntity(projectId, semanticEntityConfig('writingExpressions'), writingExpressionPayload({
        ...payload,
        scene_moment_id: target.sceneMomentId,
        script_block_id: target.scriptBlockId ?? payload.script_block_id ?? null,
        order: target.order,
      }))
    },
    onSuccess: () => {
      toast.success('表达条目已更新')
      void refetch()
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      const apiErrorData = (error as { response?: { data?: unknown } })?.response?.data
      const responseData = isRecordValue(apiErrorData) ? apiErrorData as APIErrorBody : null
      toast.error(responseData ? translateApiError(responseData, 'common.requestFailed') : error instanceof Error ? error.message : '保存表达条目失败')
    },
  })
  const createWritingExpressionMutation = useMutation({
    mutationFn: async ({ momentId, order, scriptBlockId }: { momentId: number; order: number; scriptBlockId?: number | null }) => {
      if (!projectId) throw new Error('请先选择项目')
      return createSemanticEntity(projectId, semanticEntityConfig('writingExpressions'), {
        scene_moment_id: momentId,
        script_block_id: scriptBlockId ?? null,
        order,
        kind: 'dialogue',
        speaker: '',
        text: '',
        note: '',
        intent: '',
      })
    },
    onSuccess: () => {
      toast.success('已新增表达条目')
      void refetch()
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      const apiErrorData = (error as { response?: { data?: unknown } })?.response?.data
      const responseData = isRecordValue(apiErrorData) ? apiErrorData as APIErrorBody : null
      toast.error(responseData ? translateApiError(responseData, 'common.requestFailed') : error instanceof Error ? error.message : '新增表达条目失败')
    },
  })
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
  const allWritingExpressions = useMemo(
    () => (data?.writingExpressions ?? [])
      .filter((item) => item.scene_moment_id ? currentSceneMomentIds.has(Number(item.scene_moment_id)) : false)
      .sort(byOrder),
    [currentSceneMomentIds, data?.writingExpressions],
  )
  const allContentUnits = useMemo(
    () => filterContentUnitsForProduction(data?.contentUnits ?? [], effectiveProductionId, currentSegmentIds, currentSceneMomentIds).sort(byOrder),
    [currentSceneMomentIds, currentSegmentIds, data?.contentUnits, effectiveProductionId]
  )
  const allScriptBlocks = useMemo(
    () => (data?.scriptBlocks ?? [])
      .filter((block) => !selectedScriptVersion || Number(block.script_version_id) === selectedScriptVersion.ID)
      .sort(byOrder),
    [data?.scriptBlocks, selectedScriptVersion],
  )
  const currentContentUnitIds = useMemo(() => new Set(allContentUnits.map((unit) => unit.ID)), [allContentUnits])
  const allKeyframes = useMemo(
    () => (data?.keyframes ?? [])
      .filter((keyframe) => !isGeneratedKeyframeCandidateRecord(keyframe))
      .filter((keyframe) => (
        Number(keyframe.production_id) === effectiveProductionId
        || (keyframe.scene_moment_id ? currentSceneMomentIds.has(Number(keyframe.scene_moment_id)) : false)
        || (keyframe.content_unit_id ? currentContentUnitIds.has(Number(keyframe.content_unit_id)) : false)
      ))
      .sort(byOrder),
    [currentContentUnitIds, currentSceneMomentIds, data?.keyframes, effectiveProductionId],
  )
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
  const currentProductionSnapshot = useMemo(
    () => buildCurrentProductionProposalSnapshot({
      segments: allSegments,
      sceneMoments: allSceneMoments,
      contentUnits: allContentUnits,
      keyframes: allKeyframes,
      assetSlots: allAssetSlots,
    }),
    [allAssetSlots, allContentUnits, allKeyframes, allSceneMoments, allSegments],
  )
  const proposalReviewNodeCount = useMemo(
    () => proposalPreviewDraft ? collectProposalReviewNodes(buildProposalReviewSegments(proposalPreviewDraft.proposal.segments, currentProductionSnapshot)).length : 0,
    [currentProductionSnapshot, proposalPreviewDraft],
  )
  const workspaceStatusLabel = workspaceView === 'review'
    ? proposalPreviewDraft
      ? `待审节点 ${proposalReviewNodeCount}`
      : '等待 AI 草稿'
    : `${allSegments.length} 编排段 · ${allSceneMoments.length} 情节`
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
  useEffect(() => {
    const requestedMomentId = Number(searchParams.get('scene_moment_id')) || 0
    const requestedMoment = requestedMomentId ? allSceneMoments.find((moment) => moment.ID === requestedMomentId) : null
    if (requestedMoment) {
      setSelectedWritingMomentId(requestedMoment.ID)
      return
    }
    if (selectedWritingMomentId && allSceneMoments.some((moment) => moment.ID === selectedWritingMomentId)) return
    setSelectedWritingMomentId(allSceneMoments[0]?.ID ?? null)
  }, [allSceneMoments, searchParams, selectedWritingMomentId])
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
          ? `请围绕当前选中的编排段 #${target.entityId} 生成 production_proposal。若发现必须引用但不存在的项目级设定资料，先转 setting_proposal；若缺少素材需求锚点，先转 asset_proposal。不要把这些上游对象写进 project_standards_proposal。`
          : '请基于当前 production snapshot 生成 production_proposal。若发现必须引用但不存在的项目级设定资料，先转 setting_proposal；若缺少素材需求锚点，先转 asset_proposal。不要把这些上游对象写进 project_standards_proposal。',
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
    await linkReferenceToOwner('segment', createSegmentId, referenceId, evidence, 'supporting')
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
                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
                    <Button
                      size="sm"
                      variant={workspaceView === 'structure' ? 'secondary' : 'ghost'}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => setWorkspaceView('structure')}
                    >
                      <Route size={13} />
                      编排写作
                    </Button>
                    <Button
                      size="sm"
                      variant={workspaceView === 'review' ? 'secondary' : 'ghost'}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => setWorkspaceView('review')}
                    >
                      <GitBranch size={13} />
                      AI 提案
                      {proposalPreviewDraft && <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">{proposalReviewNodeCount}</Badge>}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant={workspaceView === 'review' && !proposalPreviewDraft ? 'outline' : 'secondary'} className="h-6 rounded-full px-2 text-[10px]">
                      {workspaceStatusLabel}
                    </Badge>
                    {workspaceView === 'review' ? (
                      <span>{proposalPreviewDraft ? '逐条审 AI 提案' : '打开 AI 提案后逐条审阅'}</span>
                    ) : (
                      <>
                        <span>按编排段、情节和表达条目写清楚这一段戏</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {orchestrationStage !== 'idle' && (
                      <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]">
                        生成编排提案
                      </Badge>
                    )}
                    <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => handleAnalyzeTarget({ scope: 'production' })} disabled={!projectId || !effectiveProductionId}>
                      <Wand2 size={13} />
                      生成编排提案
                    </Button>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {workspaceView === 'review' ? (
                  <div className="flex h-full w-full flex-col gap-4 p-4">
                    <ProjectLayerProposalReviewSummary
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
                        currentSnapshot={currentProductionSnapshot}
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
                    scriptVersions={scriptVersions}
                    scriptText={scriptText}
                    scriptSourceText={scriptSourceText}
                    isFetchingScriptVersions={isFetchingScriptVersions}
                    isBindingScriptVersion={bindScriptVersionMutation.isPending}
                    onBindScriptVersion={(scriptVersionId) => bindScriptVersionMutation.mutate(scriptVersionId)}
                    overview={currentProductionOverview}
                    creativeReferences={allCreativeReferences}
                    segments={allSegments}
                    sceneMoments={allSceneMoments}
                    writingExpressions={allWritingExpressions}
                    scriptBlocks={allScriptBlocks}
                    selectedMomentId={selectedWritingMomentId}
                    isBindingSceneMomentScriptBlock={bindSceneMomentScriptBlockMutation.isPending || createAndBindSceneMomentScriptBlockMutation.isPending}
                    lookup={lookup}
                    onEditSegment={(record) => setEditEntry({ type: 'segments', record })}
                    onCreateSegment={() => {
                      setCreateSegmentId(null)
                      setCreateType('segments')
                    }}
                    onCreateSceneMoment={(segmentId) => {
                      setCreateSegmentId(segmentId)
                      setCreateType('sceneMoments')
                    }}
                    onSelectSceneMoment={(momentId) => {
                      setSelectedWritingMomentId(momentId)
                      setSearchParams((current) => {
                        const next = new URLSearchParams(current)
                        next.set('scene_moment_id', String(momentId))
                        return next
                      }, { replace: true })
                    }}
                    onBindSceneMomentScriptBlock={(momentId, scriptBlockId) => bindSceneMomentScriptBlockMutation.mutate({ momentId, scriptBlockId })}
                    onCreateAndBindSceneMomentScriptBlock={(momentId, startLine, endLine) => createAndBindSceneMomentScriptBlockMutation.mutate({ momentId, startLine, endLine })}
                    onSaveSceneMoment={(momentId, payload) => updateSceneMomentMutation.mutate({ momentId, payload })}
                    onSaveExpressionLine={(target, payload) => updateWritingExpressionMutation.mutate({ target, payload })}
                    onAddExpressionLine={(momentId, order, scriptBlockId) => createWritingExpressionMutation.mutate({ momentId, order, scriptBlockId })}
                    isSavingSceneMoment={updateSceneMomentMutation.isPending}
                    isSavingExpressionLine={updateWritingExpressionMutation.isPending || createWritingExpressionMutation.isPending}
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
          defaults={createDefaultsForType(createType, effectiveProductionId, createSegmentId ?? undefined, undefined)}
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
    <div className="flex w-full flex-col gap-4 p-4">
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

function ScriptVersionBindingBar({
  scriptVersions,
  selectedScriptVersion,
  isFetching,
  isSaving,
  disabled,
  onChange,
}: {
  scriptVersions: ScriptVersion[]
  selectedScriptVersion: ScriptVersion | null
  isFetching: boolean
  isSaving: boolean
  disabled: boolean
  onChange: (scriptVersionId: number | null) => void
}) {
  const selectedValue = selectedScriptVersion ? String(selectedScriptVersion.ID) : '__none__'
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <ScrollText size={12} />
          制作剧本
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          制作只选择一份剧本；编排段和情节再分别引用具体剧本块。
        </p>
      </div>
      <div className="flex min-w-[260px] flex-wrap items-center justify-end gap-2">
        <Select
          value={selectedValue}
          onValueChange={(value) => onChange(value === '__none__' ? null : Number(value))}
          disabled={disabled || isFetching || isSaving || scriptVersions.length === 0}
        >
          <SelectTrigger className="h-8 w-[260px] text-xs">
            <SelectValue placeholder={isFetching ? '读取剧本...' : '选择剧本'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">不绑定剧本</SelectItem>
            {scriptVersions.map((version) => (
              <SelectItem key={version.ID} value={String(version.ID)}>
                {scriptVersionOptionLabel(version)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSaving ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : null}
        {scriptVersions.length === 0 ? (
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Link to={ROUTES.project.scripts}>
              <Plus size={12} />
              去创建剧本
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function ProductionScriptSourceSummary({ scriptVersion, scriptText }: { scriptVersion: ScriptVersion | null; scriptText: string }) {
  if (!scriptVersion) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-border bg-muted/10 px-3 py-3">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <ScrollText size={12} />
          未选择制作剧本
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">选择后，编排段和情节可以继续绑定到这份剧本下的具体剧本块。</p>
      </div>
    )
  }
  const scriptLength = scriptText.length
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/10 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <ScrollText size={12} />
            制作绑定剧本
          </div>
          <p className="mt-1 truncate text-xs font-medium text-foreground">{scriptVersionOptionLabel(scriptVersion)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
          {formatVersionUpdatedAt(scriptVersion.UpdatedAt)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {scriptLength > 0 ? `这份剧本已作为制作级来源，约 ${scriptLength} 字。中部情节编辑区会从这里选择剧本块。` : '当前剧本没有正文内容，请回到剧本页补充正文。'}
      </p>
    </div>
  )
}

function SceneMomentScriptBlockBinder({
  selectedMoment,
  momentBlock,
  scriptBlocks,
  scriptSourceText,
  isSaving,
  onBindMomentScriptBlock,
  onCreateAndBindMomentScriptBlock,
}: {
  selectedMoment: SceneMomentRecord | null
  momentBlock: ScriptBlockRecord | null
  scriptBlocks: ScriptBlockRecord[]
  scriptSourceText: string
  isSaving: boolean
  onBindMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <ScrollText size={12} />
            绑定剧本块
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">先选当前情节对应的主剧本块；弹窗里可以查看上下文并扩选范围。</p>
        </div>
        {isSaving ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="mt-3 rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{momentBlock ? scriptBlockSelectLabel(momentBlock) : '未绑定剧本块'}</p>
            <p className={cn('mt-1 text-xs leading-5', momentBlock ? 'line-clamp-3 text-foreground' : 'text-muted-foreground')}>
              {momentBlock ? firstText(momentBlock.content, momentBlock.summary, momentBlock.title, `剧本块 #${momentBlock.ID}`) : '选择剧本块后，下面的情节说明和表达条目会有明确文本来源。'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {momentBlock && selectedMoment && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={isSaving}
                onClick={() => onBindMomentScriptBlock(selectedMoment.ID, null)}
              >
                取消绑定
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={!selectedMoment || isSaving}
              onClick={() => setOpen(true)}
            >
              <ScrollText size={12} />
              选择剧本块
            </Button>
          </div>
        </div>
      </div>
      <ScriptBlockPickerDialog
        open={open}
        onOpenChange={setOpen}
        selectedMoment={selectedMoment}
        selectedBlock={momentBlock}
        scriptBlocks={scriptBlocks}
        scriptSourceText={scriptSourceText}
        isSaving={isSaving}
        onBindMomentScriptBlock={onBindMomentScriptBlock}
        onCreateAndBindMomentScriptBlock={onCreateAndBindMomentScriptBlock}
      />
    </div>
  )
}

function ScriptBlockPickerDialog({
  open,
  onOpenChange,
  selectedMoment,
  selectedBlock,
  scriptBlocks,
  scriptSourceText,
  isSaving,
  onBindMomentScriptBlock,
  onCreateAndBindMomentScriptBlock,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedMoment: SceneMomentRecord | null
  selectedBlock: ScriptBlockRecord | null
  scriptBlocks: ScriptBlockRecord[]
  scriptSourceText: string
  isSaving: boolean
  onBindMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
}) {
  const initialIndex = Math.max(0, scriptBlocks.findIndex((block) => block.ID === selectedBlock?.ID))
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [rangeStart, setRangeStart] = useState(initialIndex)
  const [rangeEnd, setRangeEnd] = useState(initialIndex)
  const scriptLines = useMemo(() => scriptLineEntries(scriptSourceText), [scriptSourceText])
  const [createStartLine, setCreateStartLine] = useState<number | null>(null)
  const [createEndLine, setCreateEndLine] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    const nextIndex = Math.max(0, scriptBlocks.findIndex((block) => block.ID === selectedBlock?.ID))
    setActiveIndex(nextIndex)
    setRangeStart(nextIndex)
    setRangeEnd(nextIndex)
    setCreateStartLine(null)
    setCreateEndLine(null)
  }, [open, scriptBlocks, selectedBlock?.ID])

  const activeBlock = scriptBlocks[activeIndex] ?? null
  const previewBlocks = scriptBlocks.slice(Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd) + 1)
  const createRangeStart = Math.min(createStartLine ?? 0, createEndLine ?? createStartLine ?? 0)
  const createRangeEnd = Math.max(createStartLine ?? 0, createEndLine ?? createStartLine ?? 0)
  const selectedCreateLines = createStartLine ? scriptLines.filter((line) => line.number >= createRangeStart && line.number <= createRangeEnd) : []
  const selectedCreateText = selectedCreateLines.map((line) => line.content).join('\n')

  function chooseBlock(index: number) {
    setActiveIndex(index)
    setRangeStart(index)
    setRangeEnd(index)
  }

  function confirmSelection() {
    if (!selectedMoment || !activeBlock) return
    onBindMomentScriptBlock(selectedMoment.ID, activeBlock.ID)
    onOpenChange(false)
  }

  function chooseScriptLine(lineNumber: number) {
    if (!createStartLine || (createStartLine && createEndLine)) {
      setCreateStartLine(lineNumber)
      setCreateEndLine(null)
      return
    }
    setCreateEndLine(lineNumber)
  }

  function confirmCreateSelection() {
    if (!selectedMoment || !createStartLine) return
    onCreateAndBindMomentScriptBlock(selectedMoment.ID, createRangeStart, createRangeEnd)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="flex max-h-[88vh] w-[min(960px,calc(100vw-32px))] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle>选择剧本块</DialogTitle>
          <DialogDescription>
            选择一个主剧本块绑定到当前情节；扩选只用于查看连续上下文，不会改变主绑定。
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              {scriptBlocks.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                  当前还没有已创建的剧本块，可以在右侧从剧本正文直接创建。
                </div>
              ) : scriptBlocks.map((block, index) => {
                const active = index === activeIndex
                return (
                  <button
                    key={block.ID}
                    type="button"
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50 hover:bg-primary/5',
                    )}
                    onClick={() => chooseBlock(index)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">{scriptBlockLineLabel(block)}</span>
                      {selectedBlock?.ID === block.ID && <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">已绑定</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {firstText(block.content, block.summary, block.title, `剧本块 #${block.ID}`)}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="min-h-0 overflow-auto p-4">
            <div className="mb-4 rounded-md border border-border bg-muted/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <Plus size={12} />
                    从剧本创建
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">点击剧本行选择起点，再点击另一行扩成范围；创建后会立即绑定到当前情节。</p>
                </div>
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={!selectedMoment || !createStartLine || !selectedCreateText.trim() || isSaving}
                  onClick={confirmCreateSelection}
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  创建并绑定
                </Button>
              </div>
              {scriptLines.length === 0 ? (
                <div className="mt-3 rounded-md border border-dashed border-border bg-background px-3 py-4 text-xs leading-5 text-muted-foreground">
                  当前制作剧本没有正文，暂时无法创建剧本块。
                </div>
              ) : (
                <>
                  <div className="mt-3 max-h-48 space-y-1 overflow-auto rounded-md border border-border bg-background p-2">
                    {scriptLines.map((line) => {
                      const selected = createStartLine ? line.number >= createRangeStart && line.number <= createRangeEnd : false
                      const anchor = line.number === createStartLine || line.number === createEndLine
                      return (
                        <button
                          key={`script-create-line-${line.number}`}
                          type="button"
                          className={cn(
                            'grid w-full grid-cols-[44px_minmax(0,1fr)] gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                            selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                            anchor ? 'ring-1 ring-primary/40' : '',
                          )}
                          onClick={() => chooseScriptLine(line.number)}
                        >
                          <span className="text-[11px] tabular-nums text-muted-foreground">{line.number}</span>
                          <span className={cn('whitespace-pre-wrap leading-5', !line.content.trim() && 'text-muted-foreground/60')}>{line.content || ' '}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {createStartLine ? `待创建：行 ${createRangeStart}-${createRangeEnd}` : '尚未选择剧本行'}
                    </p>
                    {selectedCreateText.trim() && (
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-foreground">{selectedCreateText}</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-foreground">{activeBlock ? scriptBlockSelectLabel(activeBlock) : '未选择剧本块'}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">当前主绑定：{activeBlock ? scriptBlockLineLabel(activeBlock) : '无'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={rangeStart <= 0}
                  onClick={() => setRangeStart((value) => Math.max(0, value - 1))}
                >
                  扩选上文
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={rangeEnd >= scriptBlocks.length - 1}
                  onClick={() => setRangeEnd((value) => Math.min(scriptBlocks.length - 1, value + 1))}
                >
                  扩选下文
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={!activeBlock}
                  onClick={() => {
                    setRangeStart(activeIndex)
                    setRangeEnd(activeIndex)
                  }}
                >
                  收起范围
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {scriptBlocks.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-6 text-sm leading-6 text-muted-foreground">
                  当前还没有可绑定的剧本块。可以先在上方从剧本正文选择行，创建后会自动绑定到当前情节。
                </div>
              ) : previewBlocks.map((block) => (
                <article
                  key={`script-preview-${block.ID}`}
                  className={cn('rounded-md border p-3', block.ID === activeBlock?.ID ? 'border-primary bg-primary/5' : 'border-border bg-background')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={block.ID === activeBlock?.ID ? 'secondary' : 'outline'} className="h-5 rounded-full px-1.5 text-[10px]">
                      {block.ID === activeBlock?.ID ? '主剧本块' : '扩选上下文'}
                    </Badge>
                    <span className="text-[11px] font-medium text-muted-foreground">{scriptBlockLineLabel(block)}</span>
                    {block.speaker && <span className="text-[11px] text-muted-foreground">{String(block.speaker)}</span>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {firstText(block.content, block.summary, block.title, `剧本块 #${block.ID}`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={isSaving} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!selectedMoment || !activeBlock || isSaving} onClick={confirmSelection}>
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            绑定主剧本块
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function scriptVersionOptionLabel(version: ScriptVersion) {
  return version.title || `剧本 #${version.ID}`
}

function scriptVersionContextLabel(version: ScriptVersion) {
  return version.title || `剧本 #${version.ID}`
}

type ScriptLineEntry = {
  number: number
  content: string
}

function scriptSourceTextForVersion(version: ScriptVersion | null) {
  if (!version) return ''
  return normalizeScriptSourceText(version.content || version.raw_source || '')
}

function normalizeScriptSourceText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function scriptLineEntries(scriptSourceText: string): ScriptLineEntry[] {
  const lines = normalizeScriptSourceText(scriptSourceText).split('\n')
  if (lines.length === 1 && lines[0] === '') return []
  return lines.map((content, index) => ({ number: index + 1, content }))
}

function scriptBlockContentFromLines(scriptSourceText: string, startLine: number, endLine: number) {
  return scriptLineEntries(scriptSourceText)
    .filter((line) => line.number >= startLine && line.number <= endLine)
    .map((line) => line.content)
    .join('\n')
}

function inferScriptBlockKind(text: string) {
  const firstLine = text.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const speakerMatch = firstLine.match(/^([^：:]{1,24})[：:]\s*(.+)$/)
  if (speakerMatch) return { kind: 'dialogue', speaker: speakerMatch[1].trim() }
  if (/^(INT\.|EXT\.|内景|外景|场景|第.+场)/i.test(firstLine)) return { kind: 'scene_heading', speaker: '' }
  return { kind: 'action', speaker: '' }
}

function scriptBlockLineLabel(block: ScriptBlockRecord) {
  const startLine = Number(block.start_line)
  const endLine = Number(block.end_line)
  if (Number.isFinite(startLine) && startLine > 0 && Number.isFinite(endLine) && endLine > 0) return `行 ${startLine}-${endLine}`
  if (Number.isFinite(startLine) && startLine > 0) return `行 ${startLine}`
  return `剧本块 #${block.ID}`
}

function scriptBlockSelectLabel(block: ScriptBlockRecord) {
  const source = scriptBlockLineLabel(block)
  const text = summarizeText(firstText(block.content, block.summary, block.title), 18)
  const speaker = firstText(block.speaker)
  return [source, speaker, text].filter(Boolean).join(' · ')
}

function formatVersionUpdatedAt(value?: string) {
  if (!value) return '未记录时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function ProductionOrchestrationWorkspace({
  projectName,
  selectedProduction,
  selectedScriptVersion,
  scriptVersions,
  scriptText,
  scriptSourceText,
  isFetchingScriptVersions,
  isBindingScriptVersion,
  onBindScriptVersion,
  overview,
  creativeReferences,
  segments,
  sceneMoments,
  writingExpressions,
  scriptBlocks,
  selectedMomentId,
  isBindingSceneMomentScriptBlock,
  lookup,
  onEditSegment,
  onCreateSegment,
  onCreateSceneMoment,
  onSelectSceneMoment,
  onBindSceneMomentScriptBlock,
  onCreateAndBindSceneMomentScriptBlock,
  onSaveSceneMoment,
  onSaveExpressionLine,
  onAddExpressionLine,
  isSavingSceneMoment,
  isSavingExpressionLine,
}: {
  projectName: string
  selectedProduction: (SemanticEntityRecord & { name?: string; status?: string }) | null
  selectedScriptVersion: ScriptVersion | null
  scriptVersions: ScriptVersion[]
  scriptText: string
  scriptSourceText: string
  isFetchingScriptVersions: boolean
  isBindingScriptVersion: boolean
  onBindScriptVersion: (scriptVersionId: number | null) => void
  overview: ContextOverview
  creativeReferences: CreativeReferenceRecord[]
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  writingExpressions: WritingExpressionRecord[]
  scriptBlocks: ScriptBlockRecord[]
  selectedMomentId: number | null
  isBindingSceneMomentScriptBlock: boolean
  lookup: OrchestrationLookup
  onEditSegment: (record: SemanticEntityRecord) => void
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onSelectSceneMoment: (momentId: number) => void
  onBindSceneMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindSceneMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
  onSaveSceneMoment: (momentId: number, payload: SemanticEntityPayload) => void
  onSaveExpressionLine: (target: WritingExpressionEditTarget, payload: WritingExpressionSavePayload) => void
  onAddExpressionLine: (momentId: number, order: number, scriptBlockId?: number | null) => void
  isSavingSceneMoment: boolean
  isSavingExpressionLine: boolean
}) {
  const productionLabel = selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : '未选择制作'
  const selectedMoment = selectedMomentId ? sceneMoments.find((moment) => moment.ID === selectedMomentId) ?? null : sceneMoments[0] ?? null
  const selectedSegment = selectedMoment?.segment_id ? segments.find((segment) => segment.ID === Number(selectedMoment.segment_id)) ?? null : segments[0] ?? null
  const selectedMomentScriptBlock = selectedMoment?.script_block_id ? scriptBlocks.find((block) => block.ID === Number(selectedMoment.script_block_id)) ?? null : null
  const selectedMomentContentUnits = selectedMoment ? lookup.contentUnitById ? Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === selectedMoment.ID) : [] : []
  const selectedMomentExpressions = selectedMoment ? writingExpressions.filter((item) => Number(item.scene_moment_id) === selectedMoment.ID) : []
  const expressionLines = buildWritingExpressionLines(selectedMoment, selectedMomentScriptBlock, selectedMomentContentUnits, selectedMomentExpressions)
  const speakerOptions = buildSpeakerOptions(selectedMoment, creativeReferences, lookup)
  const selectedSegmentMoments = selectedSegment ? sceneMoments.filter((moment) => Number(moment.segment_id) === selectedSegment.ID) : []
  const selectedSegmentLineCount = selectedSegmentMoments.reduce((sum, moment) => {
    const block = moment.script_block_id ? scriptBlocks.find((item) => item.ID === Number(moment.script_block_id)) ?? null : null
    const units = Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === moment.ID)
    const expressions = writingExpressions.filter((item) => Number(item.scene_moment_id) === moment.ID)
    return sum + buildWritingExpressionLines(moment, block, units, expressions).length
  }, 0)
  const writingProgressLabel = expressionLines.length === 0 ? '待补表达' : `${expressionLines.length} 条表达`
  return (
    <div className="min-h-full space-y-3 p-4">
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <Boxes size={12} />
              制作信息
            </div>
            <h1 className="mt-1 text-lg font-semibold text-foreground">{productionLabel}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              制作在这里绑定剧本；情节编辑时再从这份剧本里选择具体剧本块。
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant="outline" className="h-7 rounded-full px-2 text-xs">{segments.length} 编排段</Badge>
            <Badge variant="outline" className="h-7 rounded-full px-2 text-xs">{sceneMoments.length} 情节</Badge>
            <Badge variant="outline" className="h-7 rounded-full px-2 text-xs">{writingProgressLabel}</Badge>
          </div>
        </div>
        <ScriptVersionBindingBar
          scriptVersions={scriptVersions}
          selectedScriptVersion={selectedScriptVersion}
          isFetching={isFetchingScriptVersions}
          isSaving={isBindingScriptVersion}
          disabled={!selectedProduction}
          onChange={onBindScriptVersion}
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <ContextLine icon={Layers3} label="项目" value={projectName} />
          <ContextLine icon={ScrollText} label="制作剧本" value={selectedScriptVersion ? selectedScriptVersion.title || `剧本 #${selectedScriptVersion.ID}` : '未绑定'} />
          <ContextLine icon={FileText} label="可选剧本块" value={`${scriptBlocks.length} 个`} />
          <ContextLine icon={Target} label="下一步" value={overview.nextStep[0] ?? '继续写作'} />
        </div>
        <ProductionScriptSourceSummary scriptVersion={selectedScriptVersion} scriptText={scriptText} />
      </section>

      <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-hidden rounded-lg border border-border bg-background lg:sticky lg:top-[76px] lg:self-start">
        <div className="border-b border-border bg-muted/30 px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">编排段列表</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">按顺序查看编排段，并选择要编辑的情节。</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" aria-label="新增编排段" onClick={onCreateSegment}>
              <Plus size={12} />
            </Button>
          </div>
        </div>
        <div className="max-h-none overflow-visible p-2 lg:max-h-[calc(100vh-190px)] lg:overflow-auto">
          {segments.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs leading-5 text-muted-foreground">
              还没有编排段。先添加一个铺垫、发现、反转或释放段，再把情节放进去。
            </div>
          ) : (
            <div className="space-y-2">
              {segments.map((segment, index) => {
                const moments = sceneMoments.filter((moment) => Number(moment.segment_id) === segment.ID)
                const active = selectedSegment?.ID === segment.ID
                return (
                  <section key={segment.ID} className="overflow-hidden rounded-md border border-border bg-background">
                    <div className={cn('border-b border-border px-3 py-2.5', active ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : 'bg-muted/20')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">{String(index + 1).padStart(2, '0')}</span>
                            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', statusTone[String(segment.status ?? '')] ?? 'bg-muted text-muted-foreground')}>
                              {statusLabel[String(segment.status ?? '')] ?? String(segment.status ?? '草稿')}
                            </span>
                          </div>
                          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{titleOfRecord(segment)}</h3>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{String(segment.summary ?? segment.content ?? '这一段还没有说明情绪功能。')}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" aria-label={`编辑编排段 ${titleOfRecord(segment)}`} onClick={() => onEditSegment(segment)}>
                          <Pencil size={11} />
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[10px]">{moments.length} 情节</Badge>
                        <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[10px]">{segmentKindLabel[String(segment.kind ?? '')] ?? '编排段'}</Badge>
                      </div>
                    </div>
                    <div className="space-y-1.5 p-2">
                      {moments.length === 0 ? (
                        <button
                          type="button"
                          className="w-full rounded border border-dashed border-border bg-muted/10 px-2 py-3 text-left text-[11px] leading-4 text-muted-foreground hover:border-primary/50 hover:bg-primary/5"
                          onClick={() => onCreateSceneMoment(segment.ID)}
                        >
                          这个编排段还没有情节，点击添加。
                        </button>
                      ) : moments.map((moment) => {
                        const momentActive = selectedMoment?.ID === moment.ID
                        const lines = buildWritingExpressionLines(
                          moment,
                          moment.script_block_id ? scriptBlocks.find((block) => block.ID === Number(moment.script_block_id)) ?? null : null,
                          Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === moment.ID),
                          writingExpressions.filter((item) => Number(item.scene_moment_id) === moment.ID),
                        )
                        return (
                          <button
                            key={moment.ID}
                            type="button"
                            className={cn(
                              'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                              momentActive ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50 hover:bg-primary/5',
                            )}
                            onClick={() => onSelectSceneMoment(moment.ID)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-foreground">{titleOfRecord(moment)}</p>
                                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{moment.action_text || moment.description || '还没有写具体发生什么。'}</p>
                              </div>
                              <Badge variant={lines.length === 0 ? 'warning' : 'outline'} className="h-5 rounded-full px-1.5 text-[10px]">{lines.length} 条</Badge>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 space-y-3">
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <Route size={12} />
                当前编排段
              </div>
              <h2 className="mt-1 text-sm font-semibold text-foreground">{selectedSegment ? titleOfRecord(selectedSegment) : '未选择编排段'}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {selectedSegment ? String(selectedSegment.summary ?? selectedSegment.content ?? '这一段还没有说明编排功能。') : '选择情节后，这里会显示它所属编排段的节奏任务。'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">{selectedSegmentMoments.length} 个情节 · {selectedSegmentLineCount} 条表达</Badge>
              {selectedSegment && (
                <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onCreateSceneMoment(selectedSegment.ID)}>
                  <Plus size={12} />
                  添加情节
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <GitBranch size={12} />
              情节编辑
            </div>
            <h1 className="mt-1 text-lg font-semibold text-foreground">{selectedMoment ? titleOfRecord(selectedMoment) : '选择一个情节开始写'}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              情节负责具体发生什么；先绑定剧本块，再写对白、动作、旁白、字幕、沉默和画面信息。
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <ContextLine icon={Route} label="所属编排段" value={selectedSegment ? titleOfRecord(selectedSegment) : '未选择'} />
          <ContextLine icon={Target} label="戏剧任务" value={selectedMoment?.description || selectedMoment?.action_text || selectedSegment?.summary || '待补'} />
          <ContextLine icon={ScrollText} label="表达数量" value={writingProgressLabel} />
        </div>
        <InlineSceneMomentEditor
          moment={selectedMoment}
          momentBlock={selectedMomentScriptBlock}
          scriptBlocks={scriptBlocks}
          scriptSourceText={scriptSourceText}
          isSaving={isSavingSceneMoment}
          isBindingScriptBlock={isBindingSceneMomentScriptBlock}
          onSave={onSaveSceneMoment}
          onBindMomentScriptBlock={onBindSceneMomentScriptBlock}
          onCreateAndBindMomentScriptBlock={onCreateAndBindSceneMomentScriptBlock}
        />
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <ScrollText size={12} />
              表达条目
            </div>
            <h2 className="mt-1 text-sm font-semibold text-foreground">对白、动作、沉默、旁白和画面信息</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">没有对白的片段也不空白，它可以用动作、字幕、旁白、产品信息或停顿完成表达。</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => selectedMoment && onAddExpressionLine(selectedMoment.ID, expressionLines.length + 1, selectedMomentScriptBlock?.ID ?? null)}
            disabled={!selectedMoment || isSavingExpressionLine}
          >
            <Plus size={12} />
            新增表达
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {expressionLines.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs leading-5 text-muted-foreground">
              当前情节还没有表达条目。可以先写动作、对白、旁白、字幕或沉默点。
            </div>
          ) : expressionLines.map((line, index) => (
            <EditableWritingExpressionLine
              key={`${line.editTarget.kind}-${line.editTarget.id}`}
              index={index}
              line={line}
              speakerOptions={speakerOptions}
              isSaving={isSavingExpressionLine}
              onSave={onSaveExpressionLine}
            />
          ))}
        </div>
      </section>
      </div>

      </div>
    </div>
  )
}

function InlineSceneMomentEditor({
  moment,
  momentBlock,
  scriptBlocks,
  scriptSourceText,
  isSaving,
  isBindingScriptBlock,
  onSave,
  onBindMomentScriptBlock,
  onCreateAndBindMomentScriptBlock,
}: {
  moment: SceneMomentRecord | null
  momentBlock: ScriptBlockRecord | null
  scriptBlocks: ScriptBlockRecord[]
  scriptSourceText: string
  isSaving: boolean
  isBindingScriptBlock: boolean
  onSave: (momentId: number, payload: SemanticEntityPayload) => void
  onBindMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
}) {
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    action_text: '',
    mood: '',
    time_text: '',
    location_text: '',
  })
  useEffect(() => {
    setDraft({
      title: firstText(moment?.title),
      description: firstText(moment?.description),
      action_text: firstText(moment?.action_text),
      mood: firstText(moment?.mood),
      time_text: firstText(moment?.time_text),
      location_text: firstText(moment?.location_text),
    })
  }, [moment?.ID, moment?.action_text, moment?.description, moment?.location_text, moment?.mood, moment?.time_text, moment?.title])

  if (!moment) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs leading-5 text-muted-foreground">
        先从左侧选择一个情节，再编辑具体发生的事。
      </div>
    )
  }

  const original = {
    title: firstText(moment.title),
    description: firstText(moment.description),
    action_text: firstText(moment.action_text),
    mood: firstText(moment.mood),
    time_text: firstText(moment.time_text),
    location_text: firstText(moment.location_text),
  }
  const changed = Object.keys(draft).some((key) => draft[key as keyof typeof draft].trim() !== original[key as keyof typeof original].trim())

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/10 p-3">
      <SceneMomentScriptBlockBinder
        selectedMoment={moment}
        momentBlock={momentBlock}
        scriptBlocks={scriptBlocks}
        scriptSourceText={scriptSourceText}
        isSaving={isBindingScriptBlock}
        onBindMomentScriptBlock={onBindMomentScriptBlock}
        onCreateAndBindMomentScriptBlock={onCreateAndBindMomentScriptBlock}
      />
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          情节标题
          <Textarea
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            className="mt-1 min-h-10 resize-none bg-background text-sm"
            placeholder="这场戏发生了什么"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          情绪落点
          <Textarea
            value={draft.mood}
            onChange={(event) => setDraft((prev) => ({ ...prev, mood: event.target.value }))}
            className="mt-1 min-h-10 resize-none bg-background text-sm"
            placeholder="紧张、迟疑、释然..."
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          时间
          <Textarea
            value={draft.time_text}
            onChange={(event) => setDraft((prev) => ({ ...prev, time_text: event.target.value }))}
            className="mt-1 min-h-10 resize-none bg-background text-sm"
            placeholder="清晨、夜里、发布会前..."
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          地点
          <Textarea
            value={draft.location_text}
            onChange={(event) => setDraft((prev) => ({ ...prev, location_text: event.target.value }))}
            className="mt-1 min-h-10 resize-none bg-background text-sm"
            placeholder="办公室、车内、展台..."
          />
        </label>
      </div>
      <label className="mt-2 block text-xs text-muted-foreground">
        情节说明
        <Textarea
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          className="mt-1 min-h-16 resize-y bg-background text-sm leading-6"
          placeholder="这段情节承担的推进作用"
        />
      </label>
      <label className="mt-2 block text-xs text-muted-foreground">
        可见动作
        <Textarea
          value={draft.action_text}
          onChange={(event) => setDraft((prev) => ({ ...prev, action_text: event.target.value }))}
          className="mt-1 min-h-20 resize-y bg-background text-sm leading-6"
          placeholder="观众能看到的人物动作、场面变化或信息揭示"
        />
      </label>
      <div className="mt-3 flex justify-end gap-2">
        {changed && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={isSaving} onClick={() => setDraft(original)}>
            取消
          </Button>
        )}
        <Button
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={!changed || isSaving}
          onClick={() => onSave(moment.ID, {
            title: draft.title.trim(),
            description: draft.description.trim(),
            action_text: draft.action_text.trim(),
            mood: draft.mood.trim(),
            time_text: draft.time_text.trim(),
            location_text: draft.location_text.trim(),
          })}
        >
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          保存情节
        </Button>
      </div>
    </div>
  )
}

function EditableWritingExpressionLine({
  index,
  line,
  speakerOptions,
  isSaving,
  onSave,
}: {
  index: number
  line: WritingExpressionLine
  speakerOptions: SpeakerOption[]
  isSaving: boolean
  onSave: (target: WritingExpressionEditTarget, payload: WritingExpressionSavePayload) => void
}) {
  const [draft, setDraft] = useState<WritingExpressionSavePayload>(() => writingExpressionLineDraft(line))
  useEffect(() => {
    setDraft(writingExpressionLineDraft(line))
  }, [line.intent, line.note, line.speaker, line.text, line.type])
  const original = writingExpressionLineDraft(line)
  const changed = !writingExpressionDraftEquals(draft, original)
  const typeLabel = writingTypeLabel(draft.kind)
  const selectedSpeakerValue = speakerOptionValueForDraft(draft.speaker, speakerOptions)
  return (
    <details className="group overflow-hidden rounded-md border border-border bg-card" open={index === 0}>
      <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-2.5 marker:hidden">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[10px]">{typeLabel}</Badge>
            <Badge variant={line.persisted ? 'outline' : 'secondary'} className="h-5 rounded-full px-1.5 text-[10px]">
              {line.persisted ? '已保存' : '参考转写'}
            </Badge>
            {draft.speaker.trim() && <span className="text-[11px] text-muted-foreground">{draft.speaker.trim()}</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-foreground">{draft.text || textPlaceholderForWritingType(draft.kind)}</p>
          {(draft.intent || draft.note) && (
            <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{[draft.intent, draft.note].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <ChevronDown size={14} className="mt-2 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border bg-background/70 p-3">
        <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)_96px]">
          <div className="min-w-0 space-y-2">
            <Select value={draft.kind} onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value as WritingExpressionType }))}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {writingExpressionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="block text-[11px] text-muted-foreground">
              {speakerLabelForWritingType(draft.kind)}
              <Select
                value={selectedSpeakerValue}
                onValueChange={(value) => {
                  if (value === '__custom__') {
                    setDraft((prev) => ({ ...prev, speaker: speakerOptions.some((option) => option.name === prev.speaker.trim()) ? '' : prev.speaker }))
                    return
                  }
                  const option = speakerOptions.find((item) => speakerOptionValue(item) === value)
                  if (option) setDraft((prev) => ({ ...prev, speaker: option.name }))
                }}
              >
                <SelectTrigger className="mt-1 h-8 w-full bg-background text-xs">
                  <SelectValue placeholder="从设定选择" />
                </SelectTrigger>
                <SelectContent>
                  {speakerOptions.map((option) => (
                    <SelectItem key={speakerOptionValue(option)} value={speakerOptionValue(option)}>
                      {option.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">自定义人物 / 群众演员</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                value={draft.speaker}
                onChange={(event) => setDraft((prev) => ({ ...prev, speaker: event.target.value }))}
                className="mt-1 min-h-10 resize-none bg-background text-xs"
                placeholder={speakerPlaceholderForWritingType(draft.kind)}
              />
            </label>
          </div>
          <div className="min-w-0 space-y-2">
            <Textarea
              value={draft.text}
              onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
              className="min-h-20 resize-y text-sm leading-6"
              placeholder={textPlaceholderForWritingType(draft.kind)}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Textarea
                value={draft.intent}
                onChange={(event) => setDraft((prev) => ({ ...prev, intent: event.target.value }))}
                className="min-h-12 resize-y bg-background text-xs leading-5"
                placeholder={`${typeLabel}的目的`}
              />
              <Textarea
                value={draft.note}
                onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
                className="min-h-12 resize-y bg-background text-xs leading-5"
                placeholder="潜台词 / 表演说明"
              />
            </div>
          </div>
          <div className="flex items-start justify-end gap-1.5">
            {changed && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={isSaving}
                onClick={() => setDraft(original)}
              >
                取消
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!changed || !draft.text.trim() || isSaving}
              onClick={() => onSave(line.editTarget, normalizeWritingExpressionDraft(draft))}
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {line.persisted ? '保存' : '转为条目'}
            </Button>
          </div>
        </div>
      </div>
    </details>
  )
}

type WritingExpressionEditTarget =
  | { kind: 'writingExpressions'; id: number }
  | { kind: 'fallback'; id: string; sceneMomentId: number; scriptBlockId?: number | null; order: number }

interface WritingExpressionSavePayload {
  scene_moment_id?: number
  script_block_id?: number | null
  order?: number
  kind: WritingExpressionType
  speaker: string
  text: string
  note: string
  intent: string
}

interface WritingExpressionLine {
  type: WritingExpressionType
  label: string
  speaker: string
  text: string
  editTarget: WritingExpressionEditTarget
  note: string
  intent: string
  persisted: boolean
}

interface SpeakerOption {
  id: number
  name: string
  label: string
  current: boolean
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function summarizeText(value: unknown, limit = 28) {
  const text = firstText(value).replace(/\s+/g, ' ')
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function buildWritingExpressionLines(
  moment: SceneMomentRecord | null | undefined,
  scriptBlock: ScriptBlockRecord | null | undefined,
  contentUnits: ContentUnitRecord[],
  expressions: WritingExpressionRecord[] = [],
): WritingExpressionLine[] {
  if (!moment) return []
  const persisted = expressions.slice().sort(byOrder)
  if (persisted.length > 0) {
    return persisted.map((item) => {
      const type = normalizeWritingExpressionType(item.kind)
      return {
        type,
        label: writingTypeLabel(type),
        speaker: firstText(item.speaker, defaultSpeakerForWritingType(type)),
        text: firstText(item.text),
        editTarget: { kind: 'writingExpressions', id: item.ID },
        note: firstText(item.note),
        intent: firstText(item.intent),
        persisted: true,
      }
    })
  }
  const lines: WritingExpressionLine[] = []
  let order = 1
  const actionText = firstText(moment.action_text, moment.description)
  if (actionText) {
    lines.push({
      type: 'action',
      label: '动作',
      speaker: '场面',
      text: actionText,
      editTarget: {
        kind: 'fallback',
        id: `moment-action-${moment.ID}`,
        sceneMomentId: moment.ID,
        scriptBlockId: moment.script_block_id ?? null,
        order: order++,
      },
      note: firstText(moment.condition_text, moment.location_text, '先让观众看清发生了什么。'),
      intent: '交代事件',
      persisted: false,
    })
  }
  if (moment.mood) {
    lines.push({
      type: 'silence',
      label: '情绪',
      speaker: titleOfRecord(moment),
      text: `情绪：${moment.mood}`,
      editTarget: { kind: 'fallback', id: `moment-mood-${moment.ID}`, sceneMomentId: moment.ID, scriptBlockId: moment.script_block_id ?? null, order: order++ },
      note: '这不是台词，而是写给表演和节奏的停顿提醒。',
      intent: '情绪转折',
      persisted: false,
    })
  }
  if (scriptBlock) {
    const type = writingTypeFromScriptBlock(scriptBlock)
    const content = firstText(scriptBlock.content, scriptBlock.summary, scriptBlock.title)
    if (content) {
      lines.push({
        type,
        label: writingTypeLabel(type),
        speaker: firstText(scriptBlock.speaker, type === 'dialogue' ? '未指定说话人' : writingTypeLabel(type)),
        text: content,
        editTarget: {
          kind: 'fallback',
          id: `script-block-${scriptBlock.ID}`,
          sceneMomentId: moment.ID,
          scriptBlockId: scriptBlock.ID,
          order: order++,
        },
        note: scriptBlock.kind === 'dialogue' ? '检查这句话是否符合人物此刻的克制程度。' : '来自当前剧本稿，可在这里判断是否需要改写。',
        intent: scriptBlock.kind === 'dialogue' ? '人物表达' : '剧本表达',
        persisted: false,
      })
    }
  }
  for (const unit of contentUnits.slice().sort(byOrder)) {
    const type = writingTypeFromContentUnit(unit)
    const text = firstText(unit.description, unit.prompt, unit.title)
    if (!text) continue
    lines.push({
      type,
      label: writingTypeLabel(type),
      speaker: type === 'narration' ? '旁白' : type === 'subtitle' ? '字幕' : type === 'visual' ? '画面' : '场面',
      text,
      editTarget: {
        kind: 'fallback',
        id: `content-unit-${unit.ID}`,
        sceneMomentId: moment.ID,
        scriptBlockId: unit.script_block_id ?? moment.script_block_id ?? null,
        order: order++,
      },
      note: '这是已有的表达补充，可以保留为当前稿参考。',
      intent: type === 'visual' ? '画面信息' : type === 'narration' ? '补充情绪' : '表达补充',
      persisted: false,
    })
  }
  return lines
}

function writingTypeFromScriptBlock(block: ScriptBlockRecord): WritingExpressionType {
  switch (block.kind) {
    case 'dialogue':
      return 'dialogue'
    case 'transition':
      return 'subtitle'
    case 'note':
    case 'parenthetical':
      return 'silence'
    case 'scene_heading':
    case 'action':
    default:
      return 'action'
  }
}

function writingTypeFromContentUnit(unit: ContentUnitRecord): WritingExpressionType {
  switch (unit.kind) {
    case 'voiceover':
      return 'narration'
    case 'dialogue_audio':
      return 'dialogue'
    case 'subtitle':
    case 'caption_card':
      return 'subtitle'
    case 'shot':
      return 'visual'
    case 'sound':
    case 'music_beat':
    case 'transition':
    default:
      return 'action'
  }
}

function writingTypeLabel(type: WritingExpressionType) {
  switch (type) {
    case 'dialogue':
      return '对白'
    case 'action':
      return '动作'
    case 'silence':
      return '沉默'
    case 'narration':
      return '旁白'
    case 'subtitle':
      return '字幕'
    case 'visual':
      return '画面信息'
  }
}

const writingExpressionTypeOptions: { value: WritingExpressionType; label: string }[] = [
  { value: 'dialogue', label: '对白' },
  { value: 'action', label: '动作' },
  { value: 'silence', label: '沉默' },
  { value: 'narration', label: '旁白' },
  { value: 'subtitle', label: '字幕' },
  { value: 'visual', label: '画面信息' },
]

function normalizeWritingExpressionType(value: unknown): WritingExpressionType {
  return writingExpressionTypeOptions.some((option) => option.value === value) ? value as WritingExpressionType : 'action'
}

function defaultSpeakerForWritingType(type: WritingExpressionType) {
  if (type === 'dialogue') return '未指定人物'
  if (type === 'narration') return '旁白'
  if (type === 'subtitle') return '字幕'
  if (type === 'visual') return '画面'
  if (type === 'silence') return '停顿'
  return '场面'
}

function speakerLabelForWritingType(type: WritingExpressionType) {
  if (type === 'dialogue') return '人物'
  if (type === 'narration') return '声源'
  if (type === 'subtitle') return '字幕来源'
  if (type === 'visual') return '画面主体'
  if (type === 'silence') return '停顿主体'
  return '动作主体'
}

function speakerPlaceholderForWritingType(type: WritingExpressionType) {
  if (type === 'dialogue') return '谁说'
  if (type === 'narration') return '旁白 / 画外音'
  if (type === 'subtitle') return '屏幕文字 / 标语'
  if (type === 'visual') return '镜头 / 产品 / 环境'
  if (type === 'silence') return '谁停住了'
  return '谁在做'
}

function textPlaceholderForWritingType(type: WritingExpressionType) {
  if (type === 'dialogue') return '写下人物会说出口的话'
  if (type === 'narration') return '写旁白'
  if (type === 'subtitle') return '写字幕或屏幕文字'
  if (type === 'visual') return '写需要被看见的画面信息'
  if (type === 'silence') return '写沉默、停顿或没说出口的反应'
  return '写动作或事件推进'
}

function writingExpressionLineDraft(line: WritingExpressionLine): WritingExpressionSavePayload {
  return normalizeWritingExpressionDraft({
    kind: line.type,
    speaker: line.speaker,
    text: line.text,
    note: line.note,
    intent: line.intent,
  })
}

function normalizeWritingExpressionDraft(draft: WritingExpressionSavePayload): WritingExpressionSavePayload {
  return {
    scene_moment_id: draft.scene_moment_id,
    script_block_id: draft.script_block_id ?? null,
    order: draft.order,
    kind: normalizeWritingExpressionType(draft.kind),
    speaker: draft.speaker.trim(),
    text: draft.text.trim(),
    note: draft.note.trim(),
    intent: draft.intent.trim(),
  }
}

function writingExpressionDraftEquals(a: WritingExpressionSavePayload, b: WritingExpressionSavePayload) {
  return normalizeWritingExpressionType(a.kind) === normalizeWritingExpressionType(b.kind)
    && a.speaker.trim() === b.speaker.trim()
    && a.text.trim() === b.text.trim()
    && a.note.trim() === b.note.trim()
    && a.intent.trim() === b.intent.trim()
}

function writingExpressionPayload(draft: WritingExpressionSavePayload): SemanticEntityPayload {
  const normalized = normalizeWritingExpressionDraft(draft)
  return {
    scene_moment_id: normalized.scene_moment_id ?? null,
    script_block_id: normalized.script_block_id ?? null,
    order: normalized.order ?? 0,
    kind: normalized.kind,
    speaker: normalized.speaker,
    text: normalized.text,
    note: normalized.note,
    intent: normalized.intent,
  }
}

function buildSpeakerOptions(
  moment: SceneMomentRecord | null | undefined,
  creativeReferences: CreativeReferenceRecord[],
  lookup: OrchestrationLookup,
): SpeakerOption[] {
  const currentReferences = moment ? referencesForOwner('scene_moment', moment.ID, lookup).filter(isPersonReference) : []
  const currentIds = new Set(currentReferences.map((reference) => reference.ID))
  const allPeople = creativeReferences.filter(isPersonReference)
  const ordered = [...currentReferences, ...allPeople.filter((reference) => !currentIds.has(reference.ID))]
  const seenNames = new Set<string>()
  return ordered.flatMap((reference) => {
    const name = titleOfRecord(reference).trim()
    if (!name || seenNames.has(name)) return []
    seenNames.add(name)
    return [{
      id: reference.ID,
      name,
      label: currentIds.has(reference.ID) ? `${name} · 当前情节` : `${name} · 设定`,
      current: currentIds.has(reference.ID),
    }]
  })
}

function isPersonReference(reference: CreativeReferenceRecord) {
  return String(reference.kind ?? '').trim() === 'person'
}

function isPlaceReference(reference: CreativeReferenceRecord) {
  return String(reference.kind ?? '').trim() === 'place'
}

function speakerOptionValue(option: SpeakerOption) {
  return `reference:${option.id}`
}

function speakerOptionValueForDraft(speaker: string, options: SpeakerOption[]) {
  const text = speaker.trim()
  const option = options.find((item) => item.name === text)
  return option ? speakerOptionValue(option) : '__custom__'
}

function summarizeWritingExpressionTypes(lines: WritingExpressionLine[]) {
  if (lines.length === 0) return '待写'
  const labels = Array.from(new Set(lines.map((line) => line.label)))
  return labels.slice(0, 3).join(' / ') + (labels.length > 3 ? ` +${labels.length - 3}` : '')
}

function buildWritingPeopleCards(
  moment: SceneMomentRecord | null | undefined,
  references: CreativeReferenceRecord[],
  allReferences: CreativeReferenceRecord[],
) {
  const personReferences = references.filter((reference) => reference.kind === 'person')
  const fallbackPeople = allReferences.filter((reference) => reference.kind === 'person').slice(0, 2)
  const people = personReferences.length > 0 ? personReferences : fallbackPeople
  if (people.length === 0) {
    return [{
      name: '人物未指定',
      role: '待补',
      mood: firstText(moment?.mood, '待定'),
      note: '先补出场人物、当前目标和他们知道的信息，台词才有抓手。',
    }]
  }
  return people.map((reference, index) => ({
    name: titleOfRecord(reference),
    role: index === 0 ? '主视角' : '对手 / 关系人物',
    mood: firstText(moment?.mood, reference.importance, '待定'),
    note: firstText(reference.description, reference.content, '需要补充这个人物在当前情节里的目标、信息差和说话方式。'),
  }))
}

function buildWritingAiSuggestions(moment: SceneMomentRecord | null | undefined, lines: WritingExpressionLine[]) {
  const dialogue = lines.find((line) => line.type === 'dialogue')
  const action = lines.find((line) => line.type === 'action')
  return [
    {
      title: '更克制的对白',
      text: dialogue ? `把“${summarizeText(dialogue.text, 18)}”压成更短、更像人物忍住情绪的一句。` : '先补一句人物真正会说出口的短对白。',
      tag: '减少解释',
    },
    {
      title: '无对白表达',
      text: action ? `保留“${summarizeText(action.text, 20)}”，再加一个停顿或手部动作表达潜台词。` : '把信息改成一个能被看见的动作或物件线索。',
      tag: '动作版',
    },
    {
      title: '旁白 / 字幕版',
      text: moment?.mood ? `用一句不重复画面的旁白承接“${moment.mood}”。` : '为商业片或无对白片段准备一条更轻的旁白。',
      tag: '可选表达',
    },
  ]
}

function buildWritingFeedback(moment: SceneMomentRecord | null | undefined, lines: WritingExpressionLine[]) {
  const hasAction = lines.some((line) => line.type === 'action' || line.type === 'visual')
  const hasDialogue = lines.some((line) => line.type === 'dialogue')
  const hasEmotion = Boolean(moment?.mood) || lines.some((line) => line.type === 'silence')
  return [
    {
      tone: hasAction ? 'ok' as const : 'warn' as const,
      title: hasAction ? '发生了什么能看懂' : '还缺一个可见动作',
      detail: hasAction ? '当前稿里有动作或画面信息，观众不会只听解释。' : '补一个动作、物件或环境线索，让信息能被看见。',
    },
    {
      tone: hasDialogue && !hasAction ? 'warn' as const : 'ok' as const,
      title: hasDialogue && !hasAction ? '对白可能承担太多解释' : '对白和非对白表达比较平衡',
      detail: hasDialogue && !hasAction ? '建议把一部分信息交给动作或沉默。' : '当前情节不完全依赖台词推进。',
    },
    {
      tone: hasEmotion ? 'ok' as const : 'bad' as const,
      title: hasEmotion ? '情绪有落点' : '情绪落点还不清楚',
      detail: hasEmotion ? '情绪或停顿已经被标出来，可以继续压台词。' : '补一句人物此刻的情绪目标，避免表达散掉。',
    },
  ]
}

function buildCurrentProductionProposalSnapshot(input: {
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  contentUnits: ContentUnitRecord[]
  keyframes: KeyframeRecord[]
  assetSlots: AssetSlotRecord[]
}): { segments: ProposalSegmentNode[] } {
  const assetSlotsBySceneMoment = new Map<number, AssetSlotRecord[]>()
  const unitsBySceneMoment = new Map<number, ContentUnitRecord[]>()
  const keyframesBySceneMoment = new Map<number, KeyframeRecord[]>()
  const keyframesByContentUnit = new Map<number, KeyframeRecord[]>()

  for (const slot of input.assetSlots) {
    if (String(slot.owner_type ?? '') !== 'scene_moment') continue
    const ownerId = positiveRecordNumber(slot.owner_id)
    if (!ownerId) continue
    pushGroupedRecord(assetSlotsBySceneMoment, ownerId, slot)
  }
  for (const unit of input.contentUnits) {
    const sceneMomentId = positiveRecordNumber(unit.scene_moment_id)
    if (!sceneMomentId) continue
    pushGroupedRecord(unitsBySceneMoment, sceneMomentId, unit)
  }
  for (const keyframe of input.keyframes) {
    const contentUnitId = positiveRecordNumber(keyframe.content_unit_id)
    if (contentUnitId) {
      pushGroupedRecord(keyframesByContentUnit, contentUnitId, keyframe)
      continue
    }
    const sceneMomentId = positiveRecordNumber(keyframe.scene_moment_id)
    if (sceneMomentId) pushGroupedRecord(keyframesBySceneMoment, sceneMomentId, keyframe)
  }

  return {
    segments: input.segments.map((segment) => {
      const moments = input.sceneMoments
        .filter((moment) => Number(moment.segment_id) === segment.ID)
        .sort(byOrder)
        .map((moment) => {
          const contentUnits = (unitsBySceneMoment.get(moment.ID) ?? []).slice().sort(byOrder).map((unit) => ({
            id: unit.ID,
            client_id: stringRecordValue(unit.client_id),
            title: stringRecordValue(unit.title) || titleOfRecord(unit),
            kind: stringRecordValue(unit.kind),
            description: stringRecordValue(unit.description),
            shot_size: stringRecordValue(unit.shot_size),
            camera_angle: stringRecordValue(unit.camera_angle),
            duration_sec: positiveRecordNumber(unit.duration_sec),
            order: positiveRecordNumber(unit.order),
            status: stringRecordValue(unit.status),
            script_block_id: positiveRecordNumber(unit.script_block_id),
            keyframes: (keyframesByContentUnit.get(unit.ID) ?? []).slice().sort(byOrder).map(proposalKeyframeFromRecord),
          }))
          return {
            id: moment.ID,
            client_id: stringRecordValue(moment.client_id),
            title: stringRecordValue(moment.title) || titleOfRecord(moment),
            time_text: stringRecordValue(moment.time_text),
            location_text: stringRecordValue(moment.location_text),
            action_text: stringRecordValue(moment.action_text),
            mood: stringRecordValue(moment.mood),
            description: stringRecordValue(moment.description),
            order: positiveRecordNumber(moment.order),
            status: stringRecordValue(moment.status),
            script_block_id: positiveRecordNumber(moment.script_block_id),
            content_units: contentUnits,
            keyframes: (keyframesBySceneMoment.get(moment.ID) ?? []).slice().sort(byOrder).map(proposalKeyframeFromRecord),
            creative_references: [],
            asset_slots: (assetSlotsBySceneMoment.get(moment.ID) ?? []).slice().sort(byOrder).map((slot) => ({
              id: slot.ID,
              client_id: stringRecordValue(slot.client_id),
              name: stringRecordValue(slot.name) || titleOfRecord(slot),
              kind: stringRecordValue(slot.kind),
              description: stringRecordValue(slot.description),
              priority: stringRecordValue(slot.priority),
              source_label: '当前项目',
            })),
          } satisfies ProposalSceneMomentNode
        })
      return {
        id: segment.ID,
        client_id: stringRecordValue(segment.client_id),
        title: stringRecordValue(segment.title) || titleOfRecord(segment),
        kind: stringRecordValue(segment.kind),
        summary: stringRecordValue(segment.summary ?? segment.content),
        order: positiveRecordNumber(segment.order),
        status: stringRecordValue(segment.status),
        script_block_id: positiveRecordNumber(segment.script_block_id),
        scene_moments: moments,
      } satisfies ProposalSegmentNode
    }),
  }

  function proposalKeyframeFromRecord(keyframe: KeyframeRecord): ProposalKeyframeNode {
    return {
      id: keyframe.ID,
      client_id: stringRecordValue(keyframe.client_id),
      title: stringRecordValue(keyframe.title) || titleOfRecord(keyframe),
      description: stringRecordValue(keyframe.description),
      prompt: stringRecordValue(keyframe.prompt),
      order: positiveRecordNumber(keyframe.order),
      status: stringRecordValue(keyframe.status),
    }
  }
}

function buildProposalReviewSegments(proposalSegments: ProposalSegmentNode[], currentSnapshot: { segments: ProposalSegmentNode[] }): ProposalSegmentNode[] {
  const next = cloneProposalSegments(proposalSegments)
  const currentById = new Map(currentSnapshot.segments.filter((segment) => snapshotNodeHasID(segment)).map((segment) => [segment.id!, segment]))
  const proposedIds = new Set(next.filter((segment) => snapshotNodeHasID(segment)).map((segment) => segment.id!))

  for (const segment of next) {
    if (!snapshotNodeHasID(segment)) continue
    const current = currentById.get(segment.id!)
    if (current) appendDeletedChildren(segment, current)
  }
  for (const current of currentSnapshot.segments) {
    if (!snapshotNodeHasID(current) || proposedIds.has(current.id!)) continue
    next.push(markProposalSegmentDeleted(current))
  }
  return next
}

function appendDeletedChildren(proposed: ProposalSegmentNode, current: ProposalSegmentNode) {
  const proposedMoments = proposed.scene_moments ?? []
  const currentMoments = current.scene_moments ?? []
  const proposedMomentIds = new Set(proposedMoments.filter(snapshotNodeHasID).map((moment) => moment.id!))
  for (const moment of proposedMoments) {
    if (!snapshotNodeHasID(moment)) continue
    const currentMoment = currentMoments.find((item) => item.id === moment.id)
    if (currentMoment) appendDeletedMomentChildren(moment, currentMoment)
  }
  const deletedMoments = currentMoments
    .filter((moment) => snapshotNodeHasID(moment) && !proposedMomentIds.has(moment.id!))
    .map(markProposalMomentDeleted)
  if (deletedMoments.length > 0) proposed.scene_moments = [...proposedMoments, ...deletedMoments]
}

function appendDeletedMomentChildren(proposed: ProposalSceneMomentNode, current: ProposalSceneMomentNode) {
  proposed.content_units = appendDeletedNodes(
    proposed.content_units ?? [],
    current.content_units ?? [],
    markProposalContentUnitDeleted,
  )
  proposed.keyframes = appendDeletedNodes(
    proposed.keyframes ?? [],
    current.keyframes ?? [],
    markProposalKeyframeDeleted,
  )
  proposed.asset_slots = appendDeletedNodes(
    proposed.asset_slots ?? [],
    current.asset_slots ?? [],
    markProposalAssetSlotDeleted,
  )
  for (const unit of proposed.content_units ?? []) {
    if (!snapshotNodeHasID(unit)) continue
    const currentUnit = (current.content_units ?? []).find((item) => item.id === unit.id)
    if (!currentUnit) continue
    unit.keyframes = appendDeletedNodes(unit.keyframes ?? [], currentUnit.keyframes ?? [], markProposalKeyframeDeleted)
  }
}

function appendDeletedNodes<T extends { id?: number; __delete?: boolean }>(proposed: T[], current: T[], markDeleted: (node: T) => T): T[] {
  const proposedIds = new Set(proposed.filter(snapshotNodeHasID).map((node) => node.id!))
  const deleted = current
    .filter((node) => snapshotNodeHasID(node) && !proposedIds.has(node.id!))
    .map(markDeleted)
  return deleted.length > 0 ? [...proposed, ...deleted] : proposed
}

function buildMergedProductionProposal(
  currentSnapshot: { segments: ProposalSegmentNode[] },
  reviewSegments: ProposalSegmentNode[],
  decisions: ProposalNodeDecisions,
): { segments: ProposalSegmentNode[] } {
  const next = cloneProposalSegments(currentSnapshot.segments)
  reviewSegments.forEach((segment, segmentIndex) => {
    const segmentKey = proposalNodeDecisionKey('segment', segment, String(segmentIndex))
    if (decisions[segmentKey] !== 'accepted') return
    const segmentId = proposalNodeIdentity(segment, String(segmentIndex))
    if (segment.__delete) {
      removeNodeById(next, segment.id)
      return
    }
    const targetSegment = upsertSegmentNode(next, segment)
    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = proposalNodeDecisionKey('scene_moment', moment, momentFallback)
      if (decisions[momentKey] !== 'accepted') return
      if (moment.__delete) {
        targetSegment.scene_moments = removeNodeById(targetSegment.scene_moments ?? [], moment.id)
        return
      }
      const targetMoment = upsertMomentNode(targetSegment, moment)
      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = proposalNodeDecisionKey('content_unit', unit, unitFallback)
        if (decisions[unitKey] !== 'accepted') return
        if (unit.__delete) {
          targetMoment.content_units = removeNodeById(targetMoment.content_units ?? [], unit.id)
          return
        }
        const targetUnit = upsertContentUnitNode(targetMoment, unit)
        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          if (decisions[keyframeKey] !== 'accepted') return
          if (keyframe.__delete) {
            targetUnit.keyframes = removeNodeById(targetUnit.keyframes ?? [], keyframe.id)
            return
          }
          targetUnit.keyframes = upsertNode(targetUnit.keyframes ?? [], keyframe)
        })
      })
      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        if (decisions[keyframeKey] !== 'accepted') return
        if (keyframe.__delete) {
          targetMoment.keyframes = removeNodeById(targetMoment.keyframes ?? [], keyframe.id)
          return
        }
        targetMoment.keyframes = upsertNode(targetMoment.keyframes ?? [], keyframe)
      })
      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        if (decisions[referenceKey] !== 'accepted' || reference.__delete) return
        targetMoment.creative_references = upsertNode(targetMoment.creative_references ?? [], reference)
      })
      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        if (decisions[slotKey] !== 'accepted') return
        if (slot.__delete) {
          targetMoment.asset_slots = removeNodeById(targetMoment.asset_slots ?? [], slot.id)
          return
        }
        targetMoment.asset_slots = upsertNode(targetMoment.asset_slots ?? [], slot)
      })
    })
  })
  return { segments: next.map(stripProposalInternalFields) }
}

function upsertSegmentNode(segments: ProposalSegmentNode[], segment: ProposalSegmentNode) {
  const nextSegment = {
    ...stripProposalInternalFields(segment),
    scene_moments: snapshotNodeHasID(segment)
      ? segments.find((item) => item.id === segment.id)?.scene_moments ?? []
      : [],
  }
  if (!snapshotNodeHasID(segment)) {
    segments.push(nextSegment)
    return nextSegment
  }
  const index = segments.findIndex((item) => item.id === segment.id)
  if (index >= 0) {
    segments[index] = nextSegment
    return segments[index]
  }
  segments.push(nextSegment)
  return nextSegment
}

function upsertMomentNode(segment: ProposalSegmentNode, moment: ProposalSceneMomentNode) {
  const moments = segment.scene_moments ?? []
  segment.scene_moments = moments
  const existing = snapshotNodeHasID(moment) ? moments.find((item) => item.id === moment.id) : undefined
  const nextMoment = {
    ...stripProposalInternalFields(moment),
    content_units: existing?.content_units ?? [],
    keyframes: existing?.keyframes ?? [],
    creative_references: existing?.creative_references ?? [],
    asset_slots: existing?.asset_slots ?? [],
  }
  if (snapshotNodeHasID(nextMoment)) {
    const index = moments.findIndex((item) => item.id === nextMoment.id)
    if (index >= 0) {
      const next = [...moments]
      next[index] = nextMoment
      segment.scene_moments = next
      return next[index]
    }
  }
  segment.scene_moments = [...moments, nextMoment]
  return nextMoment
}

function upsertContentUnitNode(moment: ProposalSceneMomentNode, unit: ProposalContentUnitNode) {
  const units = moment.content_units ?? []
  moment.content_units = units
  const existing = snapshotNodeHasID(unit) ? units.find((item) => item.id === unit.id) : undefined
  const nextUnit = {
    ...stripProposalInternalFields(unit),
    keyframes: existing?.keyframes ?? [],
  }
  if (snapshotNodeHasID(nextUnit)) {
    const index = units.findIndex((item) => item.id === nextUnit.id)
    if (index >= 0) {
      const next = [...units]
      next[index] = nextUnit
      moment.content_units = next
      return next[index]
    }
  }
  moment.content_units = [...units, nextUnit]
  return nextUnit
}

function upsertNode<T extends { id?: number | null; __delete?: boolean }>(nodes: T[], node: T): T[] {
  const cleaned = stripProposalInternalFields(node) as T
  if (snapshotNodeHasID(cleaned)) {
    const index = nodes.findIndex((item) => item.id === cleaned.id)
    if (index >= 0) {
      const next = [...nodes]
      next[index] = cleaned
      return next
    }
  }
  return [...nodes, cleaned]
}

function removeNodeById<T extends { id?: number | null }>(nodes: T[], id?: number | null): T[] {
  if (!id) return nodes
  return nodes.filter((node) => node.id !== id)
}

function markProposalSegmentDeleted(segment: ProposalSegmentNode): ProposalSegmentNode {
  return {
    ...cloneProposalNode(segment),
    __delete: true,
    scene_moments: (segment.scene_moments ?? []).map(markProposalMomentDeleted),
  }
}

function markProposalMomentDeleted(moment: ProposalSceneMomentNode): ProposalSceneMomentNode {
  return {
    ...cloneProposalNode(moment),
    __delete: true,
    content_units: (moment.content_units ?? []).map(markProposalContentUnitDeleted),
    keyframes: (moment.keyframes ?? []).map(markProposalKeyframeDeleted),
    creative_references: [],
    asset_slots: (moment.asset_slots ?? []).map(markProposalAssetSlotDeleted),
  }
}

function markProposalContentUnitDeleted(unit: ProposalContentUnitNode): ProposalContentUnitNode {
  return {
    ...cloneProposalNode(unit),
    __delete: true,
    keyframes: (unit.keyframes ?? []).map(markProposalKeyframeDeleted),
  }
}

function markProposalKeyframeDeleted(keyframe: ProposalKeyframeNode): ProposalKeyframeNode {
  return { ...cloneProposalNode(keyframe), __delete: true }
}

function markProposalAssetSlotDeleted(slot: ProposalAssetSlotNode): ProposalAssetSlotNode {
  return { ...cloneProposalNode(slot), __delete: true }
}

function stripProposalInternalFields<T>(node: T): T {
  if (Array.isArray(node)) return node.map(stripProposalInternalFields) as T
  if (!isRecordValue(node)) return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '__delete') continue
    out[key] = stripProposalInternalFields(value)
  }
  return out as T
}

function cloneProposalSegments(segments: ProposalSegmentNode[]) {
  return segments.map((segment) => cloneProposalNode(segment))
}

function cloneProposalNode<T>(node: T): T {
  return stripProposalInternalFields(JSON.parse(JSON.stringify(node))) as T
}

function positiveRecordNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function ProposalReviewPanel({
  projectId,
  proposalDraft,
  currentSnapshot,
  nodeDecisions,
  onNodeDecisionsChange,
  previewOnly = false,
  onAccepted,
  onDiscard,
  onApplied,
}: {
  projectId?: number
  proposalDraft: ProposalDraftContent
  currentSnapshot: { segments: ProposalSegmentNode[] }
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
  const proposalSegments = proposalDraft.proposal?.segments ?? []
  const segments = useMemo(() => buildProposalReviewSegments(proposalSegments, currentSnapshot), [currentSnapshot, proposalSegments])
  const proposalContext = useMemo(() => collectProposalContextResources(segments), [segments])
  const semanticDiff = useMemo(() => buildProposalSemanticDiff(segments), [segments])
  const currentApplyPreview = useMemo(() => buildProposalApplyPreview(segments, nodeDecisions), [nodeDecisions, segments])
  const proposalSnapshotKey = useMemo(() => JSON.stringify({ proposal: proposalDraft.proposal ?? null, currentSnapshot }), [currentSnapshot, proposalDraft.proposal])
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
        title: '写入预检已完成',
        detail: '系统已经校验当前接受/拒绝决策，但还没有提交到项目。',
      }
    }
    if (simulationResult) {
      return {
        tone: 'ok' as const,
        icon: Eye,
        iconClassName: 'text-emerald-500',
        label: '当前状态',
        title: '本地预览已完成',
        detail: '当前结果来自本地决策计算，尚未通过写入预检。',
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
        title: '正在预检影响',
        detail: '系统正在校验当前审阅决策能否写入。',
      }
    }
    if (reviewNodes.length === 0) {
      return {
        tone: 'neutral' as const,
        icon: Eye,
        iconClassName: 'text-muted-foreground',
        label: '当前状态',
        title: '等待制作提案',
        detail: '打开制作提案草稿后，这里会进入提案审阅模式。',
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
        detail: `还有 ${unresolvedCount} 项未处理，处理完后就可以进行写入预检。`,
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
      title: '可以进入写入预检',
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
    return buildMergedProductionProposal(currentSnapshot, segments, nodeDecisions)
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
    const actions = { create: 0, update: 0, delete: 0 }
    const addAction = (node: { id?: number | null; __delete?: boolean }) => {
      const action = proposalSnapshotAction(node)
      if (action === 'delete') actions.delete += 1
      else if (action === 'update') actions.update += 1
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
    if (currentApplyPreview.writePlan.length === 0) {
      setSimulationResult(localResult)
      return
    }
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
    if (applyPreview.writePlan.length === 0 || proposal.segments.length === 0) {
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
              <span className="rounded bg-emerald-500/10 px-1.5 py-1">情节 +{appliedCounts.scene_moments_created}</span>
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
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{simulationResult.backendPreview ? '写入预检已生成' : '本地预览已生成'}</p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-emerald-700/80 dark:text-emerald-300/80">
            {simulationResult.backendPreview ? '系统已校验本次写入影响，不会提交到项目。' : '本次预览仅基于当前接受/拒绝决策计算，不会提交到项目。'}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">已接受 {simulationResult.acceptedNodes}</span>
            <span className="rounded bg-rose-500/10 px-1.5 py-1">已拒绝 {simulationResult.rejectedNodes}</span>
            <span className="rounded bg-muted px-1.5 py-1">未审 {simulationResult.unresolvedNodes}</span>
            <span className="rounded bg-muted px-1.5 py-1">新增 {simulationResult.actions.create}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] text-emerald-700 dark:text-emerald-300">
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">编排段 +{simulationResult.counts.segments_created}</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">情节 +{simulationResult.counts.scene_moments_created}</span>
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
              <p className="text-xs font-semibold text-foreground">写入预检结果</p>
              <Badge variant="secondary" className="ml-auto h-5 rounded-full px-2 text-[10px]">未写库</Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-center text-[10px] sm:grid-cols-3">
              <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回编排段 {simulationResult.backendPreview.returned.segments}</span>
              <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回情节 {simulationResult.backendPreview.returned.sceneMoments}</span>
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
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <GitBranch size={13} className="text-primary" />
            <p className="text-xs font-semibold text-foreground">继续审阅提案</p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            预检结果保留在上方；如果继续调整接受或拒绝，系统会自动清除旧预检结果并回到最新决策。
          </p>
          <div className="mt-3">
            <ProposalSemanticDiffPanel
              groups={semanticDiff}
              decisions={nodeDecisions}
              onSetDecision={setNodeDecision}
              onSetDecisions={setNodeDecisions}
            />
          </div>
        </div>
        <div className={cn('grid gap-2', previewOnly ? 'grid-cols-1' : 'grid-cols-2')}>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={applying} onClick={() => setSimulationResult(null)}>
            隐藏预检结果
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
              提案审阅
              {proposalDraft.proposedAt && <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">已加载提案</Badge>}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">AI 编排提案</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              逐条审阅 AI 提案，决定哪些编排和表达可以进入当前稿。
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
        <div className="flex min-h-0 w-full flex-col gap-3">
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
              <span className="rounded bg-rose-500/10 px-1.5 py-1 text-rose-700 dark:text-rose-300">删除 {actionCounts.delete}</span>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              写入时会按完整提案同步：已有节点会更新，新节点会创建，未保留的旧节点会进入删除候选。
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
          预检影响
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
            <h2 className="text-sm font-semibold text-foreground">当前没有 AI 编排提案</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              这里显示 AI 给出的编排提案。可以逐条接受、退回，或者回到编排写作区继续编辑编排段和情节。
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onSwitchToStructure}>
            <Route size={12} />
            回到编排写作
          </Button>
        </div>
      </div>
    </div>
  )
}

interface InlineProjectLayerProposalEntry {
  key: string
  title: string
  detail: string
  target: string
  changeType: 'added' | 'modified' | 'deleted'
  kind: 'creative_references' | 'asset_slots'
  raw: Record<string, unknown>
}

interface InlineProjectLayerProposalView {
  mode: 'patch' | 'snapshot'
  summary: string
  creativeReferences: InlineProjectLayerProposalEntry[]
  assetSlots: InlineProjectLayerProposalEntry[]
  impactNotes: string[]
}

function parseInlineProjectLayerProposalDraft(
  draft: AgentDraft | null | undefined,
  creativeReferenceRecords: CreativeReferenceRecord[] = [],
  assetSlotRecords: AssetSlotRecord[] = [],
): InlineProjectLayerProposalView | null {
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
      changeType: inlineProjectLayerProposalChangeType(item),
      target: inlineProjectLayerProposalChangeType(item) === 'deleted' ? `移出 #${item.id}` : typeof item.id === 'number' ? `合并到 #${item.id}` : '新增候选',
      raw: item,
    }))
    const assetSlots = asRecordArray(proposal.asset_slots).map((item, index) => ({
      key: `${draft.id}:asset_slots:${index}`,
      kind: 'asset_slots' as const,
      title: asString(proposalField(item, ['name', 'title', 'label', 'kind']), `素材建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'summary', 'content', 'rationale']), '暂无说明'),
      changeType: inlineProjectLayerProposalChangeType(item),
      target: inlineProjectLayerProposalChangeType(item) === 'deleted' ? `移出 #${item.id}` : typeof item.id === 'number' ? `调整 #${item.id}` : '新增候选',
      raw: item,
    }))
    const snapshotDeleted = mode === 'snapshot'
      ? inferInlineProjectLayerProposalSnapshotDeletes(draft, proposal, creativeReferenceRecords, assetSlotRecords)
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

function inferInlineProjectLayerProposalSnapshotDeletes(
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

function inlineProjectLayerProposalChangeType(item: Record<string, unknown>): InlineProjectLayerProposalEntry['changeType'] {
  const status = asString(proposalField(item, ['status']))
  if (['ignored', 'waived'].includes(status)) return 'deleted'
  return typeof item.id === 'number' ? 'modified' : 'added'
}

function ProjectLayerProposalReviewSummary({
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
  const settingView = useMemo(() => parseInlineProjectLayerProposalDraft(settingDraft, creativeReferences, []), [creativeReferences, settingDraft])
  const assetProposalView = useMemo(() => parseInlineProjectLayerProposalDraft(assetProposalDraft, [], assetSlots), [assetProposalDraft, assetSlots])
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
      const momentTitle = moment.title || `情节 ${momentIndex + 1}`
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
        title: moment.title || `情节 ${momentIndex + 1}`,
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
        `${moments.length} 情节`,
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
          <p className="text-xs font-semibold text-foreground">提案审阅</p>
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
              ['delete', '删除'],
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
      const momentTitle = moment.title || `情节 ${momentIndex + 1}`
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
      detail: '请先在提案审阅中接受至少一个编排段和它的情节。',
    }
  }
  if (preview.blocked.length > 0) {
    return {
      status: 'blocked',
      title: '存在不能写入的变更',
      detail: '请处理依赖未接受的节点；如果变更是新增或更新设定/素材需求，需要先处理对应上游草稿。',
    }
  }
  if (!backendPreviewReady) {
    return {
      status: 'needs_preview',
      title: '需要写入预检',
      detail: '当前决策还没有通过写入预检。请先点击“预检影响”完成校验。',
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
    detail: '所有可写入项已通过写入预检，本次写入不会包含已拒绝项。',
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
  if (kind === 'scene_moment') return '情节'
  if (kind === 'content_unit') return '内容'
  if (kind === 'keyframe') return '画面锚点'
  if (kind === 'creative_reference') return '设定'
  return '素材'
}

function ProposalDiffActionBadge({ action, compact = false }: { action: ProposalSnapshotAction | undefined; compact?: boolean }) {
  const cls = compact ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[9px]'
  if (action === 'delete') {
    return <span className={cn('shrink-0 rounded font-mono font-medium text-rose-600 dark:text-rose-400', cls)}>-</span>
  }
  if (action === 'update') {
    return <span className={cn('shrink-0 rounded font-mono font-medium text-amber-600 dark:text-amber-400', cls)}>~</span>
  }
  return <span className={cn('shrink-0 rounded font-mono font-medium text-emerald-600 dark:text-emerald-400', cls)}>+</span>
}

function contentOrchestrationChangeKindLabel(kind: string) {
  if (kind === 'segment') return '编排段'
  if (kind === 'scene_moment') return '情节'
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
      item.action === 'delete' ? 'border-l-rose-400 bg-rose-500/5' : item.action === 'update' ? 'border-l-amber-400 bg-amber-500/5' : 'border-l-emerald-400 bg-emerald-500/5',
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
          title={projectBoundaryBlocked ? '设定和素材需求需要先处理对应上游草稿' : undefined}
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
    `${group.children.filter((item) => item.kind === 'structure').length} 情节`,
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
  if (action === 'delete') return 'delete'
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
  const counts = { create: 0, update: 0, delete: 0 }
  function add(node: { id?: number | null; __delete?: boolean }) {
    const action = proposalSnapshotAction(node)
    if (action === 'delete') counts.delete += 1
    else if (action === 'update') counts.update += 1
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

function proposalSnapshotAction(node: { id?: number | null; __delete?: boolean }): ProposalSnapshotAction {
  if (node.__delete) return 'delete'
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
    ? ['先选择一份剧本正文，再继续写情节。']
    : input.segments.length === 0
      ? ['当前还没有编排段，先添加一个节奏容器。']
      : ['继续确认每个情节里的对白、动作、旁白和沉默。']

  return {
    position: [
      `制作：${titleOfRecord(input.production)}`,
      input.production?.status ? `状态：${String(input.production.status)}` : '状态：未设置',
      input.scriptVersion ? `剧本：${input.scriptVersion.title}` : '剧本：未绑定',
    ],
    sourceLabel: input.scriptVersion?.title ?? '当前现状',
    source: [
      `编排段 ${input.segments.length}`,
      `情节 ${input.sceneMoments.length}`,
      `设定资料 ${input.creativeReferences.length}`,
      `素材需求 ${input.assetSlots.length}`,
    ],
    relations: [
      latestSegment ? `最新编排段：${titleOfRecord(latestSegment)}` : '暂无编排段',
      latestMoment ? `最新情节：${titleOfRecord(latestMoment)}` : '暂无情节',
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
  if (type === 'writingExpressions') return { scene_moment_id: sceneMomentId ?? null, kind: 'dialogue', order: 1 }
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
  if (ownerType === 'scene_moment') return lookup.sceneMomentById.get(ownerId) ? `情节 · ${titleOfRecord(lookup.sceneMomentById.get(ownerId))}` : `情节 #${ownerId}`
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
  if (moment) items.push(`情节 · ${titleOfRecord(moment)}`)
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
      moments.length > 0 ? `情节：\n${moments.map(serializeSceneMoment).join('\n\n')}` : '',
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
      `情节：${titleOfRecord(moment)}`,
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
      relatedMoments.length > 0 ? `出现情节：${relatedMoments.map((item) => titleOfRecord(item)).join(' / ')}` : '',
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
      `制作项：${titleOfRecord(unit)}`,
      unit.kind ? `类型：${unit.kind}` : '',
      unit.description ? `描述：${unit.description}` : '',
      unit.prompt ? `提示：${unit.prompt}` : '',
      unit.shot_size ? `景别：${unit.shot_size}` : '',
      unit.camera_angle ? `机位角度：${unit.camera_angle}` : '',
      unit.camera_motion ? `运镜：${unit.camera_motion}` : '',
      segmentRecord ? `所属编排段：${titleOfRecord(segmentRecord)}` : '',
      moment ? `所属情节：${titleOfRecord(moment)}` : '',
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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  GitBranch,
  PackageCheck,
  Route,
  ScrollText,
  Sparkles,
  Wand2,
  LayoutList,
} from 'lucide-react'

import {
  createSemanticEntity,
  semanticEntityConfig,
  type SemanticEntityRecord,
  type SemanticEntityPayload,
} from '@/api/semanticEntities'
import { buildPageKey } from '@/lib/agentCommandInput'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import {
  ProductionSceneEditorHeader,
  ProductionSelectedSegmentSummary,
  ProductionStructureWorkspaceLayout,
  ProductionWorkspaceOverviewPanel,
  type ProductionSegmentNavigatorItem,
} from '@/components/workbench/ProductionOrchestrationStructure'
import {
  InlineSceneMomentEditor,
  ProductionWritingExpressionsPanel,
  SceneMomentSettingsEditor,
} from '@/components/workbench/ProductionSceneWriting'
import {
  ProductionProposalApplyPreviewPanel,
  type ProductionProposalApplyPreview as ProposalApplyPreview,
} from '@/components/proposals/ProductionProposalApplyPreviewPanel'
import { ProductionProposalReviewPanel } from '@/components/proposals/ProductionProposalReviewPanel'
import { ProductionProposalReviewEmptyState } from '@/components/proposals/ProductionProposalReviewEmptyState'
import { ProductionUpstreamProposalReviewSummary } from '@/components/proposals/ProductionUpstreamProposalReviewSummary'
import { ProjectWorkbenchShell } from '@/components/workbench/WorkbenchChrome'
import { isGeneratedKeyframeCandidateRecord } from '@/lib/agentGeneratedResourceBinding'
import { sceneIdentifier } from '@/lib/productionIdentifiers'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import {
  buildProductionCurrentOverview,
  type ProductionCurrentOverview as ContextOverview,
} from '@/lib/productionOrchestrationOverview'
import {
  buildProductionOrchestrationLookup,
  createProductionOrchestrationDefaultsForType,
  type ProductionOrchestrationEntityFilter as EntityFilter,
  type ProductionOrchestrationLookup,
} from '@/lib/productionOrchestrationEntityModel'
import type { ProductionAnalysisTarget as AnalysisTarget } from '@/lib/productionAnalysisText'
import { scriptSourceTextForVersion } from '@/lib/productionScriptBlocks'
import {
  buildWritingExpressionLines,
  firstText,
  type ProductionWritingExpressionEditTarget as WritingExpressionEditTarget,
  type ProductionWritingExpressionLine as WritingExpressionLine,
  type ProductionWritingExpressionSavePayload as WritingExpressionSavePayload,
  summarizeText,
} from '@/lib/productionWritingExpressions'
import {
  buildBindProductionScriptVersionMutationOptions,
  buildBindSceneMomentScriptBlockMutationOptions,
  buildCreateAndBindSceneMomentScriptBlockMutationOptions,
  buildCreateWritingExpressionMutationOptions,
  buildLinkSceneMomentReferenceMutationOptions,
  buildUpdateSceneMomentMutationOptions,
  buildUpdateWritingExpressionMutationOptions,
} from '@/lib/productionOrchestrationMutationController'
import {
  loadProductionOrchestrationData,
  type AssetSlotRecord,
  type ContentUnitRecord,
  type CreativeReferenceRecord,
  type KeyframeRecord,
  type OrchestrationData,
  type SceneMomentRecord,
  type ScriptBlockRecord,
  type SegmentRecord,
  type WritingExpressionRecord,
} from '@/lib/productionOrchestrationData'
import {
  buildCurrentProductionProposalSnapshot,
  buildProposalReviewSegments,
  collectProposalReviewNodes,
  parseProductionProposalDraft,
  type ProposalDraftContent,
  type ProposalNodeDecisions,
} from '@/lib/productionProposalReviewModel'
import {
  buildProductionProposalReviewSearchParams,
  ensureProductionProposalDraft as ensureProductionProposalDraftModel,
  launchProductionProposalAgent,
  productionProposalLaunchLabel,
} from '@/lib/productionProposalAgentLaunch'
import { localAgentClient } from '@/lib/localAgentClient'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WorkspaceView = 'structure' | 'review'

type OrchestrationLookup = ProductionOrchestrationLookup<
  SegmentRecord,
  SceneMomentRecord,
  CreativeReferenceRecord,
  SemanticEntityRecord,
  AssetSlotRecord,
  ContentUnitRecord
>

interface OverviewMetric {
  icon: LucideIcon
  label: string
  value: number | string
  tone?: 'muted' | 'ok' | 'warn'
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
    queryFn: () => loadProductionOrchestrationData(projectId!),
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
  const mutationBase = { projectId, queryClient, queryKey, refetch }
  const bindScriptVersionMutation = useMutation(buildBindProductionScriptVersionMutationOptions({
    ...mutationBase,
    productionId: effectiveProductionId,
    scriptVersionsQueryKey,
  }))
  const bindSceneMomentScriptBlockMutation = useMutation(buildBindSceneMomentScriptBlockMutationOptions(mutationBase))
  const createAndBindSceneMomentScriptBlockMutation = useMutation(buildCreateAndBindSceneMomentScriptBlockMutationOptions({
    ...mutationBase,
    selectedScriptVersion,
    scriptSourceText,
    scriptBlocks: data?.scriptBlocks ?? [],
  }))
  const updateSceneMomentMutation = useMutation(buildUpdateSceneMomentMutationOptions(mutationBase))
  const linkSceneMomentReferenceMutation = useMutation(buildLinkSceneMomentReferenceMutationOptions(mutationBase))
  const updateWritingExpressionMutation = useMutation(buildUpdateWritingExpressionMutationOptions(mutationBase))
  const createWritingExpressionMutation = useMutation(buildCreateWritingExpressionMutationOptions(mutationBase))
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
      creativeReferences: allCreativeReferences,
      creativeReferenceUsages: data?.creativeReferenceUsages ?? [],
      contentUnits: allContentUnits,
      keyframes: allKeyframes,
      assetSlots: allAssetSlots,
    }),
    [allAssetSlots, allContentUnits, allCreativeReferences, data?.creativeReferenceUsages, allKeyframes, allSceneMoments, allSegments],
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
  const lookup = useMemo(() => buildProductionOrchestrationLookup({
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

  async function ensureProductionProposalDraftForLaunch(target: AnalysisTarget) {
    if (!projectId || !effectiveProductionId) return null
    if (!canLaunchLinkedProposal) {
      toast.error('请先绑定可用剧本后再发起制作提案。')
      return null
    }

    const productionDraft = await ensureProductionProposalDraftModel({
      projectId,
      productionId: effectiveProductionId,
      production: selectedProduction,
      productionPageKey,
      openedDraftId,
      productionSnapshot: currentProductionSnapshot,
      scriptVersion: selectedScriptVersion,
      projectScripts: scriptVersions,
    })

    setSearchParams((current) => buildProductionProposalReviewSearchParams(current, {
      productionId: effectiveProductionId,
      fallbackDraftId: productionDraft.id,
    }), { replace: true })

    setWorkspaceView('review')
    return { productionDraft, target }
  }

  async function handleAnalyzeTarget(target: AnalysisTarget) {
    const drafts = await ensureProductionProposalDraftForLaunch(target)
    if (!drafts || !projectId || !effectiveProductionId) return

    const requestId = `production_orchestrate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const productionLabel = productionProposalLaunchLabel(selectedProduction, effectiveProductionId)
    setOrchestrationStage('production')
    orchestrationCleanupRef.current?.()
    orchestrationCleanupRef.current = launchProductionProposalAgent({
      requestId,
      projectId,
      productionId: effectiveProductionId,
      productionLabel,
      draftId: drafts.productionDraft.id,
      target,
      onSettled: async (payload) => {
        if (payload.status !== 'completed') {
          setOrchestrationStage('idle')
          await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey })])
          return
        }
        setSearchParams((current) => buildProductionProposalReviewSearchParams(current, {
          productionId: effectiveProductionId,
          fallbackDraftId: drafts.productionDraft.id,
          artifacts: payload.artifacts,
        }), { replace: true })
        setWorkspaceView('review')
        setOrchestrationStage('idle')
        await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey })])
      },
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
    <ProjectWorkbenchShell
      workbenchId="creative_plan"
      projectName={project?.name}
      kicker={selectedProduction ? `${String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`)} · 创作编排` : '创作编排'}
      title="创作编排工作台"
      description="把剧本、设定和素材约束组织成 production 级创作蓝图，并通过 production proposal 审阅后落地。"
      badges={(
        <>
          {openedSettingDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">设定 draft</Badge> : null}
          {openedAssetProposalDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">素材需求 draft</Badge> : null}
          {openedDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">已打开 draft</Badge> : null}
        </>
      )}
      onRefresh={() => { void refetch() }}
      refreshing={isFetching}
      refreshLabel="刷新"
      actions={productions.length > 0 ? (
        <Select value={String(effectiveProductionId || '')} onValueChange={handleSelectProduction}>
          <SelectTrigger className="h-8 w-44 type-label">
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
      ) : null}
    >

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
                      className="gap-1.5 rounded-full px-3 type-label"
                      onClick={() => setWorkspaceView('structure')}
                    >
                      <Route size={13} />
                      编排写作
                    </Button>
                    <Button
                      size="sm"
                      variant={workspaceView === 'review' ? 'secondary' : 'ghost'}
                      className="gap-1.5 rounded-full px-3 type-label"
                      onClick={() => setWorkspaceView('review')}
                    >
                      <GitBranch size={13} />
                      AI 提案
                      {proposalPreviewDraft && <Badge variant="secondary" className="h-5 rounded-full px-1.5 type-tiny">{proposalReviewNodeCount}</Badge>}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 type-tiny text-muted-foreground">
                    <Badge variant={workspaceView === 'review' && !proposalPreviewDraft ? 'outline' : 'secondary'} className="h-6 rounded-full px-2 type-tiny">
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
                      <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">
                        生成编排提案
                      </Badge>
                    )}
                    <Button size="sm" className="gap-1.5 type-label" onClick={() => handleAnalyzeTarget({ scope: 'production' })} disabled={!projectId || !effectiveProductionId}>
                      <Wand2 size={13} />
                      生成编排提案
                    </Button>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {workspaceView === 'review' ? (
                  <div className="flex h-full w-full flex-col gap-4 p-4">
                    <ProductionUpstreamProposalReviewSummary
                      settingDraft={openedSettingDraftQuery.data}
                      assetProposalDraft={openedAssetProposalDraftQuery.data}
                      projectName={project?.name ?? '当前项目'}
                      productionName={selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`}
                      creativeReferences={allCreativeReferences}
                      assetSlots={allAssetSlots}
                    />
                    {proposalPreviewDraft ? (
                      <ProductionProposalReviewPanel
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
                      <ProductionProposalReviewEmptyState onSwitchToStructure={() => setWorkspaceView('structure')} />
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
                    assetSlots={allAssetSlots}
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
                    onLinkReferenceToSceneMoment={(momentId, referenceId, role) => linkSceneMomentReferenceMutation.mutate({ momentId, referenceId, role })}
                    onSaveExpressionLine={(target, payload) => updateWritingExpressionMutation.mutate({ target, payload })}
                    onAddExpressionLine={(momentId, order, scriptBlockId) => createWritingExpressionMutation.mutate({ momentId, order, scriptBlockId })}
                    isSavingSceneMoment={updateSceneMomentMutation.isPending}
                    isLinkingSceneMomentReference={linkSceneMomentReferenceMutation.isPending}
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
          defaults={createProductionOrchestrationDefaultsForType(createType, effectiveProductionId, createSegmentId ?? undefined, undefined)}
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
    </ProjectWorkbenchShell>
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
  assetSlots,
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
  onLinkReferenceToSceneMoment,
  onSaveExpressionLine,
  onAddExpressionLine,
  isSavingSceneMoment,
  isLinkingSceneMomentReference,
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
  assetSlots: AssetSlotRecord[]
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
  onLinkReferenceToSceneMoment: (momentId: number, referenceId: number, role: string) => void
  onSaveExpressionLine: (target: WritingExpressionEditTarget, payload: WritingExpressionSavePayload) => void
  onAddExpressionLine: (momentId: number, order: number, scriptBlockId?: number | null) => void
  isSavingSceneMoment: boolean
  isLinkingSceneMomentReference: boolean
  isSavingExpressionLine: boolean
}) {
  const productionLabel = selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : '未选择制作'
  const selectedMoment = selectedMomentId ? sceneMoments.find((moment) => moment.ID === selectedMomentId) ?? null : sceneMoments[0] ?? null
  const selectedSegment = selectedMoment?.segment_id ? segments.find((segment) => segment.ID === Number(selectedMoment.segment_id)) ?? null : segments[0] ?? null
  const selectedMomentScriptBlock = selectedMoment?.script_block_id ? scriptBlocks.find((block) => block.ID === Number(selectedMoment.script_block_id)) ?? null : null
  const selectedMomentContentUnits = selectedMoment ? lookup.contentUnitById ? Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === selectedMoment.ID) : [] : []
  const selectedMomentExpressions = selectedMoment ? writingExpressions.filter((item) => Number(item.scene_moment_id) === selectedMoment.ID) : []
  const expressionLines = buildWritingExpressionLines(selectedMoment, selectedMomentScriptBlock, selectedMomentContentUnits, selectedMomentExpressions)
  const selectedSegmentMoments = selectedSegment ? sceneMoments.filter((moment) => Number(moment.segment_id) === selectedSegment.ID) : []
  const selectedSegmentLineCount = selectedSegmentMoments.reduce((sum, moment) => {
    const block = moment.script_block_id ? scriptBlocks.find((item) => item.ID === Number(moment.script_block_id)) ?? null : null
    const units = Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === moment.ID)
    const expressions = writingExpressions.filter((item) => Number(item.scene_moment_id) === moment.ID)
    return sum + buildWritingExpressionLines(moment, block, units, expressions).length
  }, 0)
  const writingProgressLabel = expressionLines.length === 0 ? '待补表达' : `${expressionLines.length} 条表达`
  const segmentNavigatorItems: ProductionSegmentNavigatorItem[] = segments.map((segment, index) => {
    const moments = sceneMoments.filter((moment) => Number(moment.segment_id) === segment.ID)
    return {
      id: segment.ID,
      indexLabel: String(index + 1).padStart(2, '0'),
      title: titleOfRecord(segment),
      summary: String(segment.summary ?? segment.content ?? '这一段还没有说明情绪功能。'),
      statusClassName: statusTone[String(segment.status ?? '')] ?? 'bg-muted text-muted-foreground',
      statusLabel: statusLabel[String(segment.status ?? '')] ?? String(segment.status ?? '草稿'),
      kindLabel: segmentKindLabel[String(segment.kind ?? '')] ?? '编排段',
      active: selectedSegment?.ID === segment.ID,
      rawRecord: segment,
      moments: moments.map((moment) => {
        const block = moment.script_block_id ? scriptBlocks.find((item) => item.ID === Number(moment.script_block_id)) ?? null : null
        const units = Array.from(lookup.contentUnitById.values()).filter((unit) => Number(unit.scene_moment_id) === moment.ID)
        const expressions = writingExpressions.filter((item) => Number(item.scene_moment_id) === moment.ID)
        return {
          id: moment.ID,
          identifier: sceneIdentifier(moment) || `#${moment.ID}`,
          title: titleOfRecord(moment),
          description: moment.action_text || moment.description || '还没有写具体发生什么。',
          lineCount: buildWritingExpressionLines(moment, block, units, expressions).length,
          active: selectedMoment?.ID === moment.ID,
        }
      }),
    }
  })
  return (
    <div className="min-h-full space-y-3 p-4">
      <ProductionWorkspaceOverviewPanel
        projectName={projectName}
        productionLabel={productionLabel}
        segmentCount={segments.length}
        sceneMomentCount={sceneMoments.length}
        writingProgressLabel={writingProgressLabel}
        selectedScriptVersion={selectedScriptVersion}
        scriptVersions={scriptVersions}
        scriptText={scriptText}
        scriptBlockCount={scriptBlocks.length}
        nextStep={overview.nextStep[0] ?? '继续写作'}
        isFetchingScriptVersions={isFetchingScriptVersions}
        isBindingScriptVersion={isBindingScriptVersion}
        disabled={!selectedProduction}
        onBindScriptVersion={onBindScriptVersion}
      />

      <ProductionStructureWorkspaceLayout
        segments={segmentNavigatorItems}
        onCreateSegment={onCreateSegment}
        onCreateSceneMoment={onCreateSceneMoment}
        onEditSegment={onEditSegment}
        onSelectSceneMoment={onSelectSceneMoment}
      >
        <ProductionSelectedSegmentSummary
          selectedSegmentTitle={selectedSegment ? titleOfRecord(selectedSegment) : '未选择编排段'}
          selectedSegmentSummary={selectedSegment ? String(selectedSegment.summary ?? selectedSegment.content ?? '这一段还没有说明编排功能。') : '选择情节后，这里会显示它所属编排段的节奏任务。'}
          momentCount={selectedSegmentMoments.length}
          lineCount={selectedSegmentLineCount}
          selectedSegmentId={selectedSegment?.ID ?? null}
          onCreateSceneMoment={onCreateSceneMoment}
        />

        <section className="rounded-lg border border-border bg-background p-4">
        <ProductionSceneEditorHeader
          title={selectedMoment ? titleOfRecord(selectedMoment) : '选择一个情节开始写'}
          selectedSegmentTitle={selectedSegment ? titleOfRecord(selectedSegment) : '未选择'}
          dramaticTask={selectedMoment?.description || selectedMoment?.action_text || selectedSegment?.summary || '待补'}
          writingProgressLabel={writingProgressLabel}
        />
        <SceneMomentSettingsEditor
          moment={selectedMoment}
          creativeReferences={creativeReferences}
          assetSlots={assetSlots}
          lookup={lookup}
          isSaving={isLinkingSceneMomentReference}
          onLinkReference={onLinkReferenceToSceneMoment}
        />
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

      <ProductionWritingExpressionsPanel
        selectedMoment={selectedMoment}
        selectedMomentScriptBlock={selectedMomentScriptBlock}
        expressionLines={expressionLines}
        creativeReferences={creativeReferences}
        lookup={lookup}
        isSavingExpressionLine={isSavingExpressionLine}
        onAddExpressionLine={onAddExpressionLine}
        onSaveExpressionLine={onSaveExpressionLine}
      />
      </ProductionStructureWorkspaceLayout>
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

function titleOfRecord(record: SemanticEntityRecord | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
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

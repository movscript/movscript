import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  GitBranch,
  Wand2,
} from 'lucide-react'

import type { SemanticEntityPayload } from '@/shared/infrastructure/api/semanticEntities'
import { SemanticEntityCrudDialog } from '@/shared/ui/SemanticEntityCrudDialog'
import { ProductionProposalReviewPanel } from '@/features/production/components/proposals/ProductionProposalReviewPanel'
import { ProductionOrchestrationWorkspace } from '@/features/production/components/ProductionOrchestrationWorkspace'
import { ProductionWorkspaceHeaderContext } from '@/features/production/components/ProductionOrchestrationStructure'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import { isGeneratedKeyframeCandidateRecord } from '@/features/agent/domain/agentGeneratedResourceBinding'
import { listScriptVersions, type ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import {
  buildProductionCurrentOverview,
} from '@/features/production/domain/productionOrchestrationOverview'
import { buildProductionOrchestrationLookup } from '@/features/production/domain/productionOrchestrationEntityModel'
import { scriptSourceTextForVersion } from '@/features/production/domain/productionScriptBlocks'
import {
  buildBindProductionScriptVersionMutationOptions,
  buildBindSceneMomentScriptBlockMutationOptions,
  buildCreateAndBindSceneMomentScriptBlockMutationOptions,
  buildCreateWritingExpressionMutationOptions,
  buildDeleteSegmentMutationOptions,
  buildDeleteSceneMomentMutationOptions,
  buildDeleteWritingExpressionMutationOptions,
  buildLinkSceneMomentReferenceMutationOptions,
  buildUpdateSceneMomentMutationOptions,
  buildUpdateSegmentMutationOptions,
  buildUpdateWritingExpressionMutationOptions,
  buildUnlinkSceneMomentReferenceMutationOptions,
} from '@/features/production/application/productionOrchestrationMutationController'
import {
  loadProductionOrchestrationData,
  type OrchestrationData,
} from '@/features/production/domain/productionOrchestrationData'
import {
  buildCurrentProductionProposalSnapshot,
} from '@/features/production/domain/productionProposalReviewModel'
import {
  buildProductionProposalRevisionRequestId,
  launchProductionProposalRevisionAgent,
} from '@/features/production/application/productionProposalAgentLaunch'
import {
  appendProductionProposalDraftContentUnit,
  appendProductionProposalDraftCreativeReference,
  appendProductionProposalDraftSceneMoment,
  appendProductionProposalDraftSegment,
  appendProductionProposalDraftWritingExpression,
  buildProductionProposalDraftClientId,
  removeProductionProposalDraftContentUnit,
  removeProductionProposalDraftCreativeReference,
  removeProductionProposalDraftSceneMoment,
  removeProductionProposalDraftSegment,
  removeProductionProposalDraftWritingExpression,
  replaceProductionProposalDraftContentUnit,
  replaceProductionProposalDraftSceneMoment,
  replaceProductionProposalDraftSegment,
  replaceProductionProposalDraftWritingExpression,
  updateProductionProposalDraftText,
} from '@/features/production/domain/productionProposalDraftEdit'
import {
  buildProductionProposalDraftWorkspaceData,
  proposalCreativeReferenceFromRecord,
} from '@/features/production/domain/productionProposalDraftWorkspace'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import { useProductionOrchestrationPageController } from '@/features/production/application/productionOrchestrationPageController'
import { useProductionOrchestrationLaunchController } from '@/features/production/application/productionOrchestrationLaunchController'
import { useProductionOrchestrationReviewController } from '@/features/production/application/productionOrchestrationReviewController'
import {
  compareProductionOrchestrationOrder,
  filterProductionContentUnitsForProduction,
  filterProductionSceneMomentsForSegments,
  filterProductionSegmentsForProduction,
} from '@/features/production/domain/productionOrchestrationWorkspaceModel'
import type {
  ProductionWritingExpressionEditTarget,
  ProductionWritingExpressionSavePayload,
} from '@/features/production/domain/productionWritingExpressions'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { toast } from '@/shared/ui/toastStore'
import { productionProposalModeRecipe } from '@/features/production/presentation/productionSemanticUi'
import {
  Dialog,
  ProductionOrchestrationGenerationNotice,
  ProductionOrchestrationHeaderAction,
  ProductionOrchestrationHeaderBadge,
  ProductionOrchestrationHeaderMetaBadge,
  ProductionOrchestrationProposalBanner,
  ProductionOrchestrationProductionSelectTrigger,
  ProductionOrchestrationReviewDialogContent,
  ProductionOrchestrationReviewDialogTitle,
  ProductionOrchestrationReviewEmptyNotice,
  ProductionOrchestrationRevisionDialogContent,
  ProductionOrchestrationSkeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  WorkbenchProjectBody,
  WorkbenchProjectPane,
  WorkbenchProjectShell,
  WorkbenchProjectViewport,
} from '@movscript/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ProductionOrchestrationPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const productionId = Number(searchParams.get('productionId')) || 0

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
  const updateSegmentMutation = useMutation(buildUpdateSegmentMutationOptions(mutationBase))
  const deleteSegmentMutation = useMutation(buildDeleteSegmentMutationOptions(mutationBase))
  const deleteSceneMomentMutation = useMutation(buildDeleteSceneMomentMutationOptions(mutationBase))
  const linkSceneMomentReferenceMutation = useMutation(buildLinkSceneMomentReferenceMutationOptions(mutationBase))
  const unlinkSceneMomentReferenceMutation = useMutation(buildUnlinkSceneMomentReferenceMutationOptions(mutationBase))
  const updateWritingExpressionMutation = useMutation(buildUpdateWritingExpressionMutationOptions(mutationBase))
  const deleteWritingExpressionMutation = useMutation(buildDeleteWritingExpressionMutationOptions(mutationBase))
  const createWritingExpressionMutation = useMutation(buildCreateWritingExpressionMutationOptions(mutationBase))
  const allSegments = useMemo(
    () => filterProductionSegmentsForProduction(data?.segments ?? [], effectiveProductionId).sort(compareProductionOrchestrationOrder),
    [data?.segments, effectiveProductionId]
  )
  const currentSegmentIds = useMemo(() => new Set(allSegments.map((segment) => segment.ID)), [allSegments])
  const allSceneMoments = useMemo(
    () => filterProductionSceneMomentsForSegments(data?.sceneMoments ?? [], currentSegmentIds).sort(compareProductionOrchestrationOrder),
    [currentSegmentIds, data?.sceneMoments]
  )
  const currentSceneMomentIds = useMemo(() => new Set(allSceneMoments.map((moment) => moment.ID)), [allSceneMoments])
  const allWritingExpressions = useMemo(
    () => (data?.writingExpressions ?? [])
      .filter((item) => item.scene_moment_id ? currentSceneMomentIds.has(Number(item.scene_moment_id)) : false)
      .sort(compareProductionOrchestrationOrder),
    [currentSceneMomentIds, data?.writingExpressions],
  )
  const allContentUnits = useMemo(
    () => filterProductionContentUnitsForProduction(data?.contentUnits ?? [], effectiveProductionId, currentSegmentIds, currentSceneMomentIds).sort(compareProductionOrchestrationOrder),
    [currentSceneMomentIds, currentSegmentIds, data?.contentUnits, effectiveProductionId]
  )
  const allScriptBlocks = useMemo(
    () => (data?.scriptBlocks ?? [])
      .filter((block) => !selectedScriptVersion || Number(block.script_version_id) === selectedScriptVersion.ID)
      .sort(compareProductionOrchestrationOrder),
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
      .sort(compareProductionOrchestrationOrder),
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
      writingExpressions: allWritingExpressions,
    }),
    [allAssetSlots, allContentUnits, allCreativeReferences, allKeyframes, allSceneMoments, allSegments, allWritingExpressions, data?.creativeReferenceUsages],
  )
  const {
    openedDraftId,
    openedSettingDraftId,
    openedAssetProposalDraftId,
    openedDraftQuery,
    openedSettingDraftQuery,
    openedAssetProposalDraftQuery,
    proposalPreviewDraft,
    proposalNodeDecisions,
    setProposalNodeDecisions,
    proposalReviewNodeCount,
    workspaceView,
    showReview,
    clearProposalReview,
  } = useProductionOrchestrationReviewController({
    projectId,
    searchParams,
    currentProductionSnapshot,
    structureStatusLabel: `${allSegments.length} 编排段 · ${allSceneMoments.length} 情节`,
  })
  const pageController = useProductionOrchestrationPageController({
    projectId,
    searchParams,
    setSearchParams,
    sceneMoments: allSceneMoments,
    effectiveProductionId,
    queryClient,
    queryKey,
    refetch,
  })
  const launchController = useProductionOrchestrationLaunchController({
    projectId,
    effectiveProductionId,
    selectedProduction,
    openedDraftId,
    canLaunchLinkedProposal,
    productionSnapshot: currentProductionSnapshot,
    selectedScriptVersion,
    scriptVersions,
    setSearchParams,
    showReview,
    refetch,
    queryClient,
    queryKey,
  })
  const productionLabel = selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : '未选择制作'
  const productionDraftActive = Boolean(proposalPreviewDraft || openedDraftQuery.data?.kind === 'production_proposal' || (openedDraftId && openedDraftQuery.isLoading))
  const proposalModeActive = workspaceView === 'review' && productionDraftActive
  const [proposalSelectedMomentId, setProposalSelectedMomentId] = useState<number | null>(null)
  const [proposalReviewOpen, setProposalReviewOpen] = useState(false)
  const [savingProposalDraft, setSavingProposalDraft] = useState(false)
  const [openingProposalMode, setOpeningProposalMode] = useState(false)
  const [launchingProposalRevision, setLaunchingProposalRevision] = useState(false)
  const [proposalRevisionDialogOpen, setProposalRevisionDialogOpen] = useState(false)
  const [proposalRevisionInstruction, setProposalRevisionInstruction] = useState('')
  const proposalRevisionCleanupRef = useRef<(() => void) | null>(null)
  const proposalWorkspaceData = useMemo(
    () => proposalPreviewDraft
      ? buildProductionProposalDraftWorkspaceData(proposalPreviewDraft, {
        productionId: effectiveProductionId,
        creativeReferences: allCreativeReferences,
      })
      : null,
    [allCreativeReferences, effectiveProductionId, proposalPreviewDraft],
  )
  const workspaceSegments = proposalModeActive && proposalWorkspaceData ? proposalWorkspaceData.segments : allSegments
  const workspaceSceneMoments = proposalModeActive && proposalWorkspaceData ? proposalWorkspaceData.sceneMoments : allSceneMoments
  const workspaceWritingExpressions = proposalModeActive && proposalWorkspaceData ? proposalWorkspaceData.writingExpressions : allWritingExpressions
  const workspaceContentUnits = proposalModeActive && proposalWorkspaceData ? proposalWorkspaceData.contentUnits : allContentUnits
  const workspaceAssetSlots = proposalModeActive && proposalWorkspaceData ? proposalWorkspaceData.assetSlots : allAssetSlots
  const workspaceCreativeReferenceUsages = proposalModeActive && proposalWorkspaceData ? proposalWorkspaceData.creativeReferenceUsages : data?.creativeReferenceUsages ?? []
  const workspaceLookup = useMemo(() => buildProductionOrchestrationLookup({
    scriptText,
    scriptVersionTitle: selectedScriptVersion?.title ?? '',
    segments: workspaceSegments,
    sceneMoments: workspaceSceneMoments,
    creativeReferences: allCreativeReferences,
    creativeReferenceUsages: workspaceCreativeReferenceUsages,
    assetSlots: workspaceAssetSlots,
    contentUnits: workspaceContentUnits,
  }), [allCreativeReferences, scriptText, selectedScriptVersion?.title, workspaceAssetSlots, workspaceContentUnits, workspaceCreativeReferenceUsages, workspaceSceneMoments, workspaceSegments])

  useEffect(() => {
    if (!proposalModeActive) return
    if (proposalSelectedMomentId && workspaceSceneMoments.some((moment) => moment.ID === proposalSelectedMomentId)) return
    setProposalSelectedMomentId(workspaceSceneMoments[0]?.ID ?? null)
  }, [proposalModeActive, proposalSelectedMomentId, workspaceSceneMoments])

  useEffect(() => {
    return () => proposalRevisionCleanupRef.current?.()
  }, [])

  function exitProposalMode() {
    clearProposalReview()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('draftId')
      next.delete('settingDraftId')
      next.delete('assetProposalDraftId')
      return next
    }, { replace: true })
  }

  async function handleProposalDraftUpdated() {
    await Promise.all([
      openedDraftQuery.refetch(),
      openedSettingDraftQuery.refetch(),
      openedAssetProposalDraftQuery.refetch(),
      refetch(),
    ])
    queryClient.invalidateQueries({ queryKey })
  }

  async function discardProposalDraft() {
    if (openedDraftId) {
      await localAgentClient.rejectDraft(openedDraftId, '用户放弃 production proposal 提案模式').catch(() => undefined)
    }
    exitProposalMode()
  }

  async function handleProposalApplied() {
    await refetch()
    queryClient.invalidateQueries({ queryKey })
    setProposalReviewOpen(false)
    exitProposalMode()
  }

  function launchProposalRevisionAgent(instruction = proposalRevisionInstruction) {
    const draft = openedDraftQuery.data
    if (!projectId || !effectiveProductionId || !draft || launchingProposalRevision) return
    setLaunchingProposalRevision(true)
    setProposalRevisionDialogOpen(false)
    proposalRevisionCleanupRef.current?.()
    proposalRevisionCleanupRef.current = launchProductionProposalRevisionAgent({
      requestId: buildProductionProposalRevisionRequestId(),
      projectId,
      productionId: effectiveProductionId,
      productionLabel,
      draftId: draft.id,
      instruction,
      onSettled: async () => {
        setLaunchingProposalRevision(false)
        setProposalRevisionInstruction('')
        await handleProposalDraftUpdated()
      },
    })
  }

  async function openProposalMode() {
    if (proposalModeActive || openingProposalMode) return
    setOpeningProposalMode(true)
    try {
      await launchController.openProposalMode()
    } finally {
      setOpeningProposalMode(false)
    }
  }

  async function patchProposalDraft(
    mutate: Parameters<typeof updateProductionProposalDraftText>[1],
    successMessage = '提案草稿已保存',
  ) {
    const draft = openedDraftQuery.data
    if (savingProposalDraft) return
    if (!draft) {
      toast.info('请先生成或打开 production proposal 草稿。')
      return
    }
    const result = updateProductionProposalDraftText(draft, mutate)
    if (result.error) {
      toast.info(result.error)
      return
    }
    setSavingProposalDraft(true)
    try {
      await localAgentClient.updateDraft(draft.id, { content: result.content })
      toast.success(successMessage)
      await handleProposalDraftUpdated()
    } catch (error) {
      toast.info(error instanceof Error ? error.message : '保存提案草稿失败')
    } finally {
      setSavingProposalDraft(false)
    }
  }

  function createProposalSegment() {
    void patchProposalDraft((draft) => {
      appendProductionProposalDraftSegment(draft, {
        client_id: buildProductionProposalDraftClientId('segment'),
        title: '新增编排段',
        kind: 'emotional_function',
        summary: '',
        status: 'candidate',
        scene_moments: [],
      })
    }, '已新增到提案草稿')
  }

  function saveProposalSegment(segmentId: number, payload: SemanticEntityPayload) {
    const segmentKey = proposalWorkspaceData?.segmentKeyByWorkspaceId.get(segmentId)
    if (!segmentKey) return
    void patchProposalDraft((draft) => {
      replaceProductionProposalDraftSegment(draft, segmentKey, {
        title: stringPayloadField(payload.title),
        kind: stringPayloadField(payload.kind),
        summary: stringPayloadField(payload.summary),
        status: stringPayloadField(payload.status),
      })
    }, '编排段已保存到提案草稿')
  }

  function deleteProposalSegment(segmentId: number) {
    const segmentKey = proposalWorkspaceData?.segmentKeyByWorkspaceId.get(segmentId)
    if (!segmentKey) return
    void patchProposalDraft((draft) => {
      removeProductionProposalDraftSegment(draft, segmentKey)
    }, '编排段已从提案草稿移除')
  }

  function createProposalSceneMoment(segmentId: number) {
    const segmentKey = proposalWorkspaceData?.segmentKeyByWorkspaceId.get(segmentId)
    if (!segmentKey) return
    const clientId = buildProductionProposalDraftClientId('moment')
    void patchProposalDraft((draft) => {
      appendProductionProposalDraftSceneMoment(draft, segmentKey, {
        client_id: clientId,
        title: '新增情节',
        action_text: '',
        status: 'candidate',
      })
    }, '已新增到提案草稿')
  }

  function saveProposalSceneMoment(momentId: number, payload: SemanticEntityPayload) {
    const target = proposalWorkspaceData?.sceneMomentKeyByWorkspaceId.get(momentId)
    if (!target) return
    void patchProposalDraft((draft) => {
      replaceProductionProposalDraftSceneMoment(draft, target.segmentKey, target.momentKey, {
        title: stringPayloadField(payload.title),
        description: stringPayloadField(payload.description),
        mood: stringPayloadField(payload.mood),
        time_text: stringPayloadField(payload.time_text),
        location_text: stringPayloadField(payload.location_text),
        action_text: stringPayloadField(payload.action_text),
        script_block_id: payload.script_block_id === null ? null : numberPayloadField(payload.script_block_id),
      })
    })
  }

  function deleteProposalSceneMoment(momentId: number) {
    const target = proposalWorkspaceData?.sceneMomentKeyByWorkspaceId.get(momentId)
    if (!target) return
    void patchProposalDraft((draft) => {
      removeProductionProposalDraftSceneMoment(draft, target.segmentKey, target.momentKey)
    }, '情节已从提案草稿移除')
  }

  function bindProposalSceneMomentScriptBlock(momentId: number, scriptBlockId: number | null) {
    const target = proposalWorkspaceData?.sceneMomentKeyByWorkspaceId.get(momentId)
    if (!target) return
    void patchProposalDraft((draft) => {
      replaceProductionProposalDraftSceneMoment(draft, target.segmentKey, target.momentKey, {
        script_block_id: scriptBlockId,
      })
    }, '提案草稿已绑定剧本块')
  }

  function linkProposalReferenceToSceneMoment(momentId: number, referenceId: number, role: string) {
    const momentTarget = proposalWorkspaceData?.sceneMomentKeyByWorkspaceId.get(momentId)
    const reference = allCreativeReferences.find((item) => item.ID === referenceId)
    if (!momentTarget || !reference) return
    void patchProposalDraft((draft) => {
      appendProductionProposalDraftCreativeReference(draft, momentTarget.segmentKey, momentTarget.momentKey, {
        ...proposalCreativeReferenceFromRecord(reference),
        role,
      })
    }, '设定已绑定到提案草稿')
  }

  function unlinkProposalReferenceFromSceneMoment(usageId: number) {
    const usageTarget = proposalWorkspaceData?.referenceUsageByWorkspaceId.get(usageId)
    if (!usageTarget) return
    void patchProposalDraft((draft) => {
      removeProductionProposalDraftCreativeReference(
        draft,
        usageTarget.segmentKey,
        usageTarget.momentKey,
        usageTarget.referenceKey,
      )
    }, '设定已从提案草稿移除')
  }

  function saveProposalExpressionLine(
    target: ProductionWritingExpressionEditTarget,
    payload: ProductionWritingExpressionSavePayload,
  ) {
    if (target.kind === 'writingExpressions') {
      const expressionTarget = proposalWorkspaceData?.writingExpressionKeyByWorkspaceId.get(target.id)
      if (!expressionTarget) return
      void patchProposalDraft((draft) => {
        replaceProductionProposalDraftWritingExpression(draft, expressionTarget.segmentKey, expressionTarget.momentKey, expressionTarget.expressionKey, {
          kind: payload.kind,
          speaker: payload.speaker,
          text: payload.text,
          note: payload.note,
          intent: payload.intent,
          order: payload.order,
          script_block_id: payload.script_block_id === null ? null : payload.script_block_id,
        })
      })
      return
    }

    if (target.kind === 'fallback' && !target.id.startsWith('content-unit-')) {
      const momentTarget = proposalWorkspaceData?.sceneMomentKeyByWorkspaceId.get(target.sceneMomentId)
      if (!momentTarget) return
      void patchProposalDraft((draft) => {
        appendProductionProposalDraftWritingExpression(draft, momentTarget.segmentKey, momentTarget.momentKey, {
          client_id: buildProductionProposalDraftClientId('expression'),
          kind: payload.kind,
          speaker: payload.speaker,
          text: payload.text,
          note: payload.note,
          intent: payload.intent,
          order: payload.order ?? target.order,
          script_block_id: payload.script_block_id ?? undefined,
        })
      })
      return
    }

    if (target.kind === 'fallback' && target.id.startsWith('content-unit-')) {
      const unitId = Number(target.id.replace('content-unit-', ''))
      const unitTarget = proposalWorkspaceData?.contentUnitKeyByWorkspaceId.get(unitId)
      if (!unitTarget) return
      void patchProposalDraft((draft) => {
        replaceProductionProposalDraftContentUnit(draft, unitTarget.segmentKey, unitTarget.momentKey, unitTarget.unitKey, {
          kind: payload.kind,
          description: payload.text,
          title: payload.intent || payload.text.slice(0, 24),
          script_block_id: payload.script_block_id === null ? null : payload.script_block_id,
        })
      })
    }
  }

  function addProposalExpressionLine(momentId: number, order: number, scriptBlockId?: number | null) {
    const momentTarget = proposalWorkspaceData?.sceneMomentKeyByWorkspaceId.get(momentId)
    if (!momentTarget) return
    void patchProposalDraft((draft) => {
      appendProductionProposalDraftWritingExpression(draft, momentTarget.segmentKey, momentTarget.momentKey, {
        client_id: buildProductionProposalDraftClientId('expression'),
        kind: 'action',
        speaker: '场面',
        text: '待补表达',
        intent: '',
        note: '',
        order,
        script_block_id: scriptBlockId ?? undefined,
      })
    }, '表达已新增到提案草稿')
  }

  function deleteProposalExpressionLine(target: ProductionWritingExpressionEditTarget) {
    if (target.kind === 'writingExpressions') {
      const expressionTarget = proposalWorkspaceData?.writingExpressionKeyByWorkspaceId.get(target.id)
      if (!expressionTarget) return
      void patchProposalDraft((draft) => {
        removeProductionProposalDraftWritingExpression(draft, expressionTarget.segmentKey, expressionTarget.momentKey, expressionTarget.expressionKey)
      }, '表达已从提案草稿移除')
      return
    }
    if (target.kind !== 'fallback' || !target.id.startsWith('content-unit-')) return
    const unitId = Number(target.id.replace('content-unit-', ''))
    const unitTarget = proposalWorkspaceData?.contentUnitKeyByWorkspaceId.get(unitId)
    if (!unitTarget) return
    void patchProposalDraft((draft) => {
      removeProductionProposalDraftContentUnit(draft, unitTarget.segmentKey, unitTarget.momentKey, unitTarget.unitKey)
    }, '表达已从提案草稿移除')
  }

  const workbenchShellProps = useProjectWorkbenchShellProps({
    workbenchId: 'orchestration_production',
    projectName: project?.name,
    kicker: selectedProduction ? `${String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`)} · 创作编排` : '创作编排',
    title: '创作编排工作台',
    description: proposalModeActive
      ? '正式项目当前只读，先在 production proposal draft 中调整提案，再通过审核应用到项目。'
      : '把剧本、设定和素材约束组织成 production 级创作蓝图，并通过 production proposal 审阅后落地。',
    badges: (
      <>
        {proposalModeActive ? <ProductionOrchestrationHeaderBadge statusProps={productionProposalModeRecipe(proposalModeActive)}>提案模式</ProductionOrchestrationHeaderBadge> : null}
        {openedSettingDraftId ? <ProductionOrchestrationHeaderMetaBadge>设定 draft</ProductionOrchestrationHeaderMetaBadge> : null}
        {openedAssetProposalDraftId ? <ProductionOrchestrationHeaderMetaBadge>素材需求 draft</ProductionOrchestrationHeaderMetaBadge> : null}
        {openedDraftId ? <ProductionOrchestrationHeaderMetaBadge>已打开 draft</ProductionOrchestrationHeaderMetaBadge> : null}
      </>
    ),
    headerBody: (
      <ProductionWorkspaceHeaderContext
        projectName={project?.name ?? '当前项目'}
        productionLabel={productionLabel}
        segmentCount={workspaceSegments.length}
        sceneMomentCount={workspaceSceneMoments.length}
        writingExpressionCount={workspaceWritingExpressions.length}
        selectedScriptVersion={selectedScriptVersion}
        scriptVersions={scriptVersions}
        scriptText={scriptText}
        scriptBlockCount={allScriptBlocks.length}
        nextStep={currentProductionOverview.nextStep[0] ?? '继续写作'}
        isFetchingScriptVersions={isFetchingScriptVersions}
        isBindingScriptVersion={bindScriptVersionMutation.isPending}
        disabled={!selectedProduction || proposalModeActive}
        onBindScriptVersion={(scriptVersionId) => bindScriptVersionMutation.mutate(scriptVersionId)}
      />
    ),
    onRefresh: () => { void refetch() },
    refreshing: isFetching,
    refreshLabel: '刷新',
    actions: (
      <>
        {productions.length > 0 ? (
          <Select value={String(effectiveProductionId || '')} onValueChange={pageController.handleSelectProduction} disabled={proposalModeActive}>
            <ProductionOrchestrationProductionSelectTrigger>
              <SelectValue placeholder="选择制作" />
            </ProductionOrchestrationProductionSelectTrigger>
            <SelectContent>
              {productions.map((p) => (
                <SelectItem key={p.ID} value={String(p.ID)}>
                  {String(p.name ?? `制作 #${p.ID}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <ProductionOrchestrationHeaderAction
          active={proposalModeActive}
          variant="outline"
          onClick={() => { void openProposalMode() }}
          loading={openingProposalMode}
          disabled={!projectId || !effectiveProductionId || openingProposalMode}
          count={proposalPreviewDraft ? proposalReviewNodeCount : undefined}
        >
          <GitBranch size={14} />
          提案模式
        </ProductionOrchestrationHeaderAction>
        <ProductionOrchestrationHeaderAction
          onClick={proposalModeActive ? () => setProposalRevisionDialogOpen(true) : () => launchController.handleAnalyzeTarget({ scope: 'production' })}
          loading={proposalModeActive ? launchingProposalRevision : launchController.orchestrationStage !== 'idle'}
          disabled={!projectId || !effectiveProductionId || (proposalModeActive ? !openedDraftQuery.data || launchingProposalRevision : launchController.orchestrationStage !== 'idle')}
          title={proposalModeActive ? 'Agent 会读取并编辑当前 production proposal draft 文件' : undefined}
        >
          <Wand2 size={14} />
          {proposalModeActive ? '让 Agent 调整提案' : '生成编排提案'}
        </ProductionOrchestrationHeaderAction>
      </>
    ),
  })

  return (
    <WorkbenchProjectShell {...workbenchShellProps}>
      <WorkbenchProjectBody padding="none" scroll="hidden" tone="muted">
        {isLoading ? (
          <ProductionOrchestrationSkeleton />
        ) : (
          <WorkbenchProjectViewport direction="column">
            {proposalModeActive ? (
              <ProductionOrchestrationProposalBanner
                saving={savingProposalDraft}
                reviewDisabled={!proposalPreviewDraft}
                discardDisabled={!openedDraftId}
                onReview={() => setProposalReviewOpen(true)}
                onExit={exitProposalMode}
                onDiscard={() => { void discardProposalDraft() }}
              />
            ) : null}
            {launchController.orchestrationStage !== 'idle' ? (
              <ProductionOrchestrationGenerationNotice />
            ) : null}
            <WorkbenchProjectPane>
              <ProductionOrchestrationWorkspace
                scriptSourceText={scriptSourceText}
                creativeReferences={allCreativeReferences}
                assetSlots={workspaceAssetSlots}
                segments={workspaceSegments}
                sceneMoments={workspaceSceneMoments}
                writingExpressions={workspaceWritingExpressions}
                scriptBlocks={allScriptBlocks}
                selectedMomentId={proposalModeActive ? proposalSelectedMomentId : pageController.selectedWritingMomentId}
                isBindingSceneMomentScriptBlock={proposalModeActive ? savingProposalDraft : bindSceneMomentScriptBlockMutation.isPending || createAndBindSceneMomentScriptBlockMutation.isPending}
                allowCreateAndBindSceneMomentScriptBlock={!proposalModeActive}
                lookup={workspaceLookup}
                onCreateSegment={proposalModeActive ? createProposalSegment : pageController.createSegment}
                onCreateSceneMoment={proposalModeActive ? createProposalSceneMoment : pageController.createSceneMoment}
                onSelectSceneMoment={proposalModeActive ? setProposalSelectedMomentId : pageController.selectSceneMoment}
                onSaveSegment={proposalModeActive ? saveProposalSegment : (segmentId, payload) => updateSegmentMutation.mutate({ segmentId, payload })}
                onDeleteSegment={proposalModeActive ? deleteProposalSegment : (segmentId) => deleteSegmentMutation.mutate(segmentId)}
                onBindSceneMomentScriptBlock={proposalModeActive ? bindProposalSceneMomentScriptBlock : (momentId, scriptBlockId) => bindSceneMomentScriptBlockMutation.mutate({ momentId, scriptBlockId })}
                onCreateAndBindSceneMomentScriptBlock={proposalModeActive ? (momentId, _startLine, _endLine) => bindProposalSceneMomentScriptBlock(momentId, null) : (momentId, startLine, endLine) => createAndBindSceneMomentScriptBlockMutation.mutate({ momentId, startLine, endLine })}
                onSaveSceneMoment={proposalModeActive ? saveProposalSceneMoment : (momentId, payload) => updateSceneMomentMutation.mutate({ momentId, payload })}
                onDeleteSceneMoment={proposalModeActive ? deleteProposalSceneMoment : (momentId) => deleteSceneMomentMutation.mutate(momentId)}
                onLinkReferenceToSceneMoment={proposalModeActive ? linkProposalReferenceToSceneMoment : (momentId, referenceId, role) => linkSceneMomentReferenceMutation.mutate({ momentId, referenceId, role })}
                onUnlinkReferenceFromSceneMoment={proposalModeActive ? unlinkProposalReferenceFromSceneMoment : (usageId) => unlinkSceneMomentReferenceMutation.mutate(usageId)}
                onSaveExpressionLine={proposalModeActive ? saveProposalExpressionLine : (target, payload) => updateWritingExpressionMutation.mutate({ target, payload })}
                onDeleteExpressionLine={(target) => {
                  if (proposalModeActive) {
                    deleteProposalExpressionLine(target)
                    return
                  }
                  if (target.kind === 'writingExpressions') deleteWritingExpressionMutation.mutate(target.id)
                }}
                onAddExpressionLine={proposalModeActive ? addProposalExpressionLine : (momentId, order, scriptBlockId) => createWritingExpressionMutation.mutate({ momentId, order, scriptBlockId })}
                canDeleteFallbackContentUnits={proposalModeActive}
                isSavingSegment={proposalModeActive ? savingProposalDraft : updateSegmentMutation.isPending}
                isDeletingSegment={proposalModeActive ? savingProposalDraft : deleteSegmentMutation.isPending}
                isSavingSceneMoment={proposalModeActive ? savingProposalDraft : updateSceneMomentMutation.isPending}
                isDeletingSceneMoment={proposalModeActive ? savingProposalDraft : deleteSceneMomentMutation.isPending}
                isLinkingSceneMomentReference={proposalModeActive ? savingProposalDraft : linkSceneMomentReferenceMutation.isPending}
                isDeletingSceneMomentReference={proposalModeActive ? savingProposalDraft : unlinkSceneMomentReferenceMutation.isPending}
                isSavingExpressionLine={proposalModeActive ? savingProposalDraft : updateWritingExpressionMutation.isPending || createWritingExpressionMutation.isPending || deleteWritingExpressionMutation.isPending}
              />
            </WorkbenchProjectPane>
          </WorkbenchProjectViewport>
        )}
      </WorkbenchProjectBody>

      <Dialog open={proposalReviewOpen} onOpenChange={setProposalReviewOpen}>
        <ProductionOrchestrationReviewDialogContent>
          <ProductionOrchestrationReviewDialogTitle />
          {proposalPreviewDraft ? (
            <ProductionProposalReviewPanel
              projectId={projectId}
              proposalDraft={proposalPreviewDraft}
              currentSnapshot={currentProductionSnapshot}
              nodeDecisions={proposalNodeDecisions}
              onNodeDecisionsChange={setProposalNodeDecisions}
              onAccepted={() => setProposalReviewOpen(false)}
              onDiscard={() => { void discardProposalDraft() }}
              onApplied={() => { void handleProposalApplied() }}
            />
          ) : (
            <ProductionOrchestrationReviewEmptyNotice />
          )}
        </ProductionOrchestrationReviewDialogContent>
      </Dialog>

      <Dialog open={proposalRevisionDialogOpen} onOpenChange={setProposalRevisionDialogOpen}>
        <ProductionOrchestrationRevisionDialogContent
          instruction={proposalRevisionInstruction}
          onInstructionChange={setProposalRevisionInstruction}
          launching={launchingProposalRevision}
          disabled={!openedDraftQuery.data}
          onCancel={() => setProposalRevisionDialogOpen(false)}
          onLaunch={() => launchProposalRevisionAgent()}
        />
      </Dialog>

      {pageController.createDialog && (
        <SemanticEntityCrudDialog
          open
          mode="create"
          projectId={projectId}
          config={pageController.createDialog.config}
          defaults={pageController.createDialog.defaults}
          queryKey={queryKey}
          title={pageController.createDialog.title}
          onOpenChange={pageController.createDialog.onOpenChange}
          onSaved={pageController.createDialog.onSaved}
        />
      )}
    </WorkbenchProjectShell>
  )
}

function stringPayloadField(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function numberPayloadField(value: unknown) {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(numberValue) ? numberValue : undefined
}

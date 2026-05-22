import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  GitBranch,
  Wand2,
} from 'lucide-react'

import type { SemanticEntityPayload } from '@/api/semanticEntities'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import { ProductionProposalReviewPanel } from '@/components/proposals/ProductionProposalReviewPanel'
import { ProductionOrchestrationWorkspace } from '@/components/workbench/ProductionOrchestrationWorkspace'
import { ProductionWorkspaceHeaderContext } from '@/components/workbench/ProductionOrchestrationStructure'
import { ProjectWorkbenchShell } from '@/components/workbench/WorkbenchChrome'
import { isGeneratedKeyframeCandidateRecord } from '@/lib/agentGeneratedResourceBinding'
import { listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import {
  buildProductionCurrentOverview,
} from '@/lib/productionOrchestrationOverview'
import { buildProductionOrchestrationLookup } from '@/lib/productionOrchestrationEntityModel'
import { scriptSourceTextForVersion } from '@/lib/productionScriptBlocks'
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
} from '@/lib/productionOrchestrationMutationController'
import {
  loadProductionOrchestrationData,
  type OrchestrationData,
} from '@/lib/productionOrchestrationData'
import {
  buildCurrentProductionProposalSnapshot,
} from '@/lib/productionProposalReviewModel'
import {
  buildProductionProposalRevisionRequestId,
  launchProductionProposalRevisionAgent,
} from '@/lib/productionProposalAgentLaunch'
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
} from '@/lib/productionProposalDraftEdit'
import {
  buildProductionProposalDraftWorkspaceData,
  proposalCreativeReferenceFromRecord,
} from '@/lib/productionProposalDraftWorkspace'
import { localAgentClient } from '@/lib/localAgentClient'
import { useProductionOrchestrationPageController } from '@/lib/productionOrchestrationPageController'
import { useProductionOrchestrationLaunchController } from '@/lib/productionOrchestrationLaunchController'
import { useProductionOrchestrationReviewController } from '@/lib/productionOrchestrationReviewController'
import {
  compareProductionOrchestrationOrder,
  filterProductionContentUnitsForProduction,
  filterProductionSceneMomentsForSegments,
  filterProductionSegmentsForProduction,
} from '@/lib/productionOrchestrationWorkspaceModel'
import type {
  ProductionWritingExpressionEditTarget,
  ProductionWritingExpressionSavePayload,
} from '@/lib/productionWritingExpressions'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
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

  return (
    <ProjectWorkbenchShell
      workbenchId="creative_taskGraph"
      projectName={project?.name}
      kicker={selectedProduction ? `${String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`)} · 创作编排` : '创作编排'}
      title="创作编排工作台"
      description="把剧本、设定和素材约束组织成 production 级创作蓝图，并通过 production proposal 审阅后落地。"
      badges={(
        <>
          {proposalModeActive ? <Badge variant="warning" className="h-6 rounded-full px-2 type-tiny">提案模式</Badge> : null}
          {openedSettingDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">设定 draft</Badge> : null}
          {openedAssetProposalDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">素材需求 draft</Badge> : null}
          {openedDraftId ? <Badge variant="secondary" className="h-6 rounded-full px-2 type-tiny">已打开 draft</Badge> : null}
        </>
      )}
      headerBody={(
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
      )}
      onRefresh={() => { void refetch() }}
      refreshing={isFetching}
      refreshLabel="刷新"
      actions={(
        <>
          {productions.length > 0 ? (
            <Select value={String(effectiveProductionId || '')} onValueChange={pageController.handleSelectProduction} disabled={proposalModeActive}>
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
          <Button
            size="sm"
            variant={proposalModeActive ? 'secondary' : 'outline'}
            className="h-8 w-32 gap-1.5"
            onClick={() => { void openProposalMode() }}
            loading={openingProposalMode}
            disabled={!projectId || !effectiveProductionId || openingProposalMode}
          >
            <GitBranch size={14} />
            提案模式
            {proposalPreviewDraft ? <span className="ml-0.5 rounded-full bg-muted px-1.5 type-tiny leading-4 text-muted-foreground">{proposalReviewNodeCount}</span> : null}
          </Button>
          <Button
            size="sm"
            className="h-8 w-32 gap-1.5"
            onClick={proposalModeActive ? () => setProposalRevisionDialogOpen(true) : () => launchController.handleAnalyzeTarget({ scope: 'production' })}
            loading={proposalModeActive ? launchingProposalRevision : launchController.orchestrationStage !== 'idle'}
            disabled={!projectId || !effectiveProductionId || (proposalModeActive ? !openedDraftQuery.data || launchingProposalRevision : launchController.orchestrationStage !== 'idle')}
          >
            <Wand2 size={14} />
            {proposalModeActive ? 'Agent 调整提案' : '生成编排提案'}
          </Button>
        </>
      )}
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
          {isLoading ? (
            <ProductionWorkspaceSkeleton />
          ) : (
            <div className="flex h-full min-h-0 flex-1 flex-col">
              {proposalModeActive ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2 type-label text-muted-foreground">
                    <GitBranch size={13} className="shrink-0" />
                    <span className="truncate">正在编辑 AI 编排提案草稿，正式项目当前只读。</span>
                    {savingProposalDraft ? <Badge variant="secondary" className="h-5 type-tiny">保存中</Badge> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 type-label" onClick={() => setProposalReviewOpen(true)} disabled={!proposalPreviewDraft}>
                      应用提案到项目
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 type-label" onClick={exitProposalMode}>
                      退出提案模式
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 type-label text-destructive hover:text-destructive" onClick={() => { void discardProposalDraft() }} disabled={!openedDraftId}>
                      放弃提案
                    </Button>
                  </div>
                </div>
              ) : null}
              {launchController.orchestrationStage !== 'idle' ? (
                <div className="border-b border-border bg-muted/40 px-4 py-2 type-label text-muted-foreground">
                  正在生成编排提案，完成后会打开审阅弹窗。
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
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
              </div>
            </div>
          )}
        </main>
      </div>

      <Dialog open={proposalReviewOpen} onOpenChange={setProposalReviewOpen}>
        <DialogContent className="flex max-h-[88vh] w-[min(1100px,calc(100vw-32px))] max-w-none flex-col overflow-hidden p-0">
          <DialogTitle className="sr-only">应用 production proposal 到项目</DialogTitle>
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
            <div className="flex items-start gap-2 p-4 type-label text-muted-foreground">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              当前没有可应用的 production proposal draft。
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={proposalRevisionDialogOpen} onOpenChange={setProposalRevisionDialogOpen}>
        <DialogContent className="w-[560px] max-w-[calc(100vw-32px)]">
          <DialogTitle>让 Agent 调整提案</DialogTitle>
          <div className="space-y-3 pt-2">
            <label className="block">
              <Label className="mb-1 block type-label text-muted-foreground">调整要求</Label>
              <Textarea
                value={proposalRevisionInstruction}
                onChange={(event) => setProposalRevisionInstruction(event.target.value)}
                className="min-h-28 resize-y type-body leading-6"
                placeholder="例如：把开场压缩成一个情节；强化主角和产品设定的关联；补齐缺少素材需求的镜头。"
              />
            </label>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 type-label leading-5 text-muted-foreground">
              Agent 会读取并编辑当前 production proposal draft 文件；正式项目只会在你点击“应用提案到项目”后写入。
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" className="type-label" disabled={launchingProposalRevision} onClick={() => setProposalRevisionDialogOpen(false)}>
                取消
              </Button>
              <Button size="sm" className="type-label" loading={launchingProposalRevision} disabled={!openedDraftQuery.data || launchingProposalRevision} onClick={() => launchProposalRevisionAgent()}>
                开始调整
              </Button>
            </div>
          </div>
        </DialogContent>
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

function stringPayloadField(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function numberPayloadField(value: unknown) {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(numberValue) ? numberValue : undefined
}

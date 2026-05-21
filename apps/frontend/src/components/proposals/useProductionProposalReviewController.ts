import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertCircle, CheckCircle2, Eye, GitBranch, Loader2 } from 'lucide-react'

import {
  applyProductionProposal,
  previewProductionProposalApply,
} from '@/api/semanticEntities'
import { translateApiError, type APIErrorBody } from '@/lib/apiError'
import { localAgentClient } from '@/lib/localAgentClient'
import type { ProductionProposalBackendPreviewIssue } from '@/components/proposals/ProductionProposalBackendPreviewPanel'
import type { ProductionProposalNodeDecision } from '@/components/proposals/ProductionProposalSemanticDiffPanel'
import type { ProductionProposalReviewStatus } from '@/components/proposals/ProductionProposalReviewHeader'
import {
  buildMergedProductionProposal,
  buildProposalApplyGate,
  buildProposalApplyPreview,
  buildProposalReviewSegments,
  buildProposalSemanticDiff,
  buildProposalSimulationResult,
  collectProposalContextResources,
  collectProposalReviewNodes,
  countProposalActions,
  findProductionProposalSnapshotIssue,
  proposalDecisionSnapshotKey,
  type ProposalDraftContent,
  type ProposalNodeDecisions,
  type ProposalSegmentNode,
  type ProposalSimulationResult,
} from '@/lib/productionProposalReviewModel'

export function useProductionProposalReviewController({
  projectId,
  proposalDraft,
  currentSnapshot,
  nodeDecisions,
  onNodeDecisionsChange,
  previewOnly = false,
  onApplied,
}: {
  projectId?: number
  proposalDraft: ProposalDraftContent
  currentSnapshot: { segments: ProposalSegmentNode[] }
  nodeDecisions: ProposalNodeDecisions
  onNodeDecisionsChange: Dispatch<SetStateAction<ProposalNodeDecisions>>
  previewOnly?: boolean
  onApplied: () => void
}) {
  const [applying, setApplying] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [backendPreviewIssue, setBackendPreviewIssue] = useState<ProductionProposalBackendPreviewIssue | null>(null)
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
  const reviewStatus = useMemo<ProductionProposalReviewStatus>(() => {
    if (appliedCounts) {
      return {
        tone: 'ok',
        icon: CheckCircle2,
        iconClassName: 'text-emerald-500',
        label: '当前状态',
        title: '已写入项目',
        detail: '提案已经完成写入，当前停留在结果确认状态。',
      }
    }
    if (simulationResult?.backendPreview) {
      return {
        tone: 'ok',
        icon: CheckCircle2,
        iconClassName: 'text-emerald-500',
        label: '当前状态',
        title: '写入预检已完成',
        detail: '系统已经校验当前接受/拒绝决策，但还没有提交到项目。',
      }
    }
    if (simulationResult) {
      return {
        tone: 'ok',
        icon: Eye,
        iconClassName: 'text-emerald-500',
        label: '当前状态',
        title: '本地预览已完成',
        detail: '当前结果来自本地决策计算，尚未通过写入预检。',
      }
    }
    if (applying) {
      return {
        tone: 'warn',
        icon: Loader2,
        iconClassName: 'animate-spin text-amber-500',
        label: '当前状态',
        title: '正在写入项目',
        detail: '提案写入流程正在执行，请等待结果返回。',
      }
    }
    if (simulating) {
      return {
        tone: 'warn',
        icon: Loader2,
        iconClassName: 'animate-spin text-amber-500',
        label: '当前状态',
        title: '正在预检影响',
        detail: '系统正在校验当前审阅决策能否写入。',
      }
    }
    if (reviewNodes.length === 0) {
      return {
        tone: 'neutral',
        icon: Eye,
        iconClassName: 'text-muted-foreground',
        label: '当前状态',
        title: '等待制作提案',
        detail: '打开制作提案草稿后，这里会进入提案审阅模式。',
      }
    }
    if (reviewedCount === 0) {
      return {
        tone: 'warn',
        icon: AlertCircle,
        iconClassName: 'text-amber-500',
        label: '当前状态',
        title: '待开始审阅',
        detail: '先接受或拒绝变更节点，再看写入影响和门禁。',
      }
    }
    if (unresolvedCount > 0) {
      return {
        tone: 'warn',
        icon: GitBranch,
        iconClassName: 'text-amber-500',
        label: '当前状态',
        title: '审阅进行中',
        detail: `还有 ${unresolvedCount} 项未处理，处理完后就可以进行写入预检。`,
      }
    }
    if (reviewApplyGate.status === 'blocked') {
      return {
        tone: 'danger',
        icon: AlertCircle,
        iconClassName: 'text-rose-500',
        label: '当前状态',
        title: '写入受阻',
        detail: reviewApplyGate.title,
      }
    }
    return {
      tone: 'ok',
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

  function clearPreviewState() {
    setSimulationResult(null)
    setBackendPreviewIssue(null)
    setBackendPreviewDecisionKey('')
  }

  function setNodeDecision(key: string, decision: ProductionProposalNodeDecision) {
    clearPreviewState()
    onNodeDecisionsChange((prev) => ({ ...prev, [key]: decision }))
  }

  function setNodeDecisions(keys: string[], decision: ProductionProposalNodeDecision) {
    clearPreviewState()
    onNodeDecisionsChange((prev) => {
      const next = { ...prev }
      for (const key of keys) next[key] = decision
      return next
    })
  }

  function acceptAllNodes() {
    clearPreviewState()
    onNodeDecisionsChange(Object.fromEntries(
      reviewNodes
        .map((node) => [node.key, 'accepted']),
    ))
  }

  function resetNodeDecisions() {
    clearPreviewState()
    setApplyError('')
    onNodeDecisionsChange({})
  }

  function buildAcceptedProposal() {
    return buildMergedProductionProposal(currentSnapshot, segments, nodeDecisions)
  }

  function buildSimulationResult() {
    const proposal = buildAcceptedProposal()
    return buildProposalSimulationResult({
      reviewSegments: segments,
      acceptedSegments: proposal.segments,
      decisions: nodeDecisions,
    })
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

  const simulationApplyGate = simulationResult
    ? buildProposalApplyGate(simulationResult.preview, Boolean(simulationResult.backendPreview))
    : null
  const canApplySimulation = Boolean(
    projectId
    && backendPreviewDecisionKey === currentDecisionKey
    && simulationResult?.backendPreview
    && simulationResult.preview.blocked.length === 0,
  )

  return {
    acceptedCount,
    actionCounts,
    appliedCounts,
    applying,
    applyError,
    backendPreviewIssue,
    canApplyCurrentReview: Boolean(projectId && reviewApplyGate.status === 'ready'),
    canApplySimulation,
    currentApplyPreview,
    handleApply,
    handleSimulate,
    hideSimulationResult: () => setSimulationResult(null),
    proposalContext,
    rejectedCount,
    resetNodeDecisions,
    reviewApplyGate,
    reviewNodes,
    reviewProgress,
    reviewStatus,
    semanticDiff,
    setNodeDecision,
    setNodeDecisions,
    simulating,
    simulationApplyGate,
    simulationResult,
    unresolvedCount,
    acceptAllNodes,
  }
}

function parseProposalBackendPreviewIssue(error: unknown): ProductionProposalBackendPreviewIssue {
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

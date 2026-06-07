import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertCircle, CheckCircle2, Eye, GitBranch, Loader2 } from 'lucide-react'

import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { ProductionWorkspaceReviewPreviewIssue, ProductionWorkspaceReviewStatus } from '@/features/production/presentation/productionWorkspaceReviewPresentationTypes'
import type { ProductionWorkspaceNodeDecision } from '@/features/production/domain/productionWorkspaceReviewTypes'
import { saveProductionWorkspaceSnapshot } from '@/features/production/application/productionWorkspaceRepository'
import {
  buildMergedProductionWorkspace,
  buildWorkspaceApplyGate,
  buildWorkspaceApplyPreview,
  buildWorkspaceReviewSegments,
  buildWorkspaceSemanticDiff,
  buildWorkspaceSimulationResult,
  collectWorkspaceContextResources,
  collectWorkspaceReviewNodes,
  countWorkspaceActions,
  findProductionWorkspaceSnapshotIssue,
  workspaceDecisionSnapshotKey,
  type ProductionWorkspaceArtifactContent,
  type WorkspaceNodeDecisions,
  type WorkspaceSegmentNode,
  type WorkspaceSimulationResult,
} from '@/features/production/domain/productionWorkspaceReviewModel'

export function useProductionWorkspaceReviewController({
  projectId,
  workspaceArtifact,
  currentSnapshot,
  nodeDecisions,
  onNodeDecisionsChange,
  previewOnly = false,
  onApplied,
}: {
  projectId?: number
  workspaceArtifact: ProductionWorkspaceArtifactContent
  currentSnapshot: { segments: WorkspaceSegmentNode[] }
  nodeDecisions: WorkspaceNodeDecisions
  onNodeDecisionsChange: Dispatch<SetStateAction<WorkspaceNodeDecisions>>
  previewOnly?: boolean
  onApplied: () => void
}) {
  const [applying, setApplying] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [reviewPreviewIssue, setReviewPreviewIssue] = useState<ProductionWorkspaceReviewPreviewIssue | null>(null)
  const [appliedCounts, setAppliedCounts] = useState<Record<string, number> | null>(null)
  const [simulationResult, setSimulationResult] = useState<WorkspaceSimulationResult | null>(null)
  const [reviewPreviewDecisionKey, setReviewPreviewDecisionKey] = useState('')
  const workspaceSegments = workspaceArtifact.workspace?.segments ?? []
  const segments = useMemo(() => buildWorkspaceReviewSegments(workspaceSegments, currentSnapshot), [currentSnapshot, workspaceSegments])
  const workspaceContext = useMemo(() => collectWorkspaceContextResources(segments), [segments])
  const semanticDiff = useMemo(() => buildWorkspaceSemanticDiff(segments), [segments])
  const currentApplyPreview = useMemo(() => buildWorkspaceApplyPreview(segments, nodeDecisions), [nodeDecisions, segments])
  const workspaceSnapshotKey = useMemo(() => JSON.stringify({ workspace: workspaceArtifact.workspace ?? null, currentSnapshot }), [currentSnapshot, workspaceArtifact.workspace])
  const reviewNodes = useMemo(() => collectWorkspaceReviewNodes(segments), [segments])
  const currentDecisionKey = useMemo(() => workspaceDecisionSnapshotKey(reviewNodes, nodeDecisions), [nodeDecisions, reviewNodes])
  const actionCounts = useMemo(() => countWorkspaceActions(segments), [segments])
  const acceptedCount = reviewNodes.filter((node) => nodeDecisions[node.key] === 'accepted').length
  const rejectedCount = reviewNodes.filter((node) => nodeDecisions[node.key] === 'rejected').length
  const reviewedCount = acceptedCount + rejectedCount
  const reviewProgress = reviewNodes.length > 0 ? Math.round((reviewedCount / reviewNodes.length) * 100) : 0
  const unresolvedCount = Math.max(0, reviewNodes.length - reviewedCount)
  const reviewApplyGate = buildWorkspaceApplyGate(
    currentApplyPreview,
    reviewPreviewDecisionKey === currentDecisionKey && Boolean(simulationResult?.reviewPreview),
  )
  const reviewStatus = useMemo<ProductionWorkspaceReviewStatus>(() => {
    if (appliedCounts) {
      return {
        state: 'applied',
        icon: CheckCircle2,
        label: '当前状态',
        title: '已写入项目',
        detail: '工作区已经完成写入，当前停留在结果确认状态。',
      }
    }
    if (simulationResult?.reviewPreview) {
      return {
        state: 'review_preview_ready',
        icon: CheckCircle2,
        label: '当前状态',
        title: '写入预检已完成',
        detail: '系统已经校验当前接受/拒绝决策，但还没有提交到项目。',
      }
    }
    if (simulationResult) {
      return {
        state: 'local_preview_ready',
        icon: Eye,
        label: '当前状态',
        title: '本地预览已完成',
        detail: '当前结果来自本地决策计算，尚未通过写入预检。',
      }
    }
    if (applying) {
      return {
        state: 'applying',
        icon: Loader2,
        iconClassName: 'animate-spin',
        label: '当前状态',
        title: '正在写入项目',
        detail: '工作区写入流程正在执行，请等待结果返回。',
      }
    }
    if (simulating) {
      return {
        state: 'simulating',
        icon: Loader2,
        iconClassName: 'animate-spin',
        label: '当前状态',
        title: '正在预检影响',
        detail: '系统正在校验当前审阅决策能否写入。',
      }
    }
    if (reviewNodes.length === 0) {
      return {
        state: 'empty',
        icon: Eye,
        label: '当前状态',
        title: '等待制作工作区',
        detail: '打开制作工作区草案后，这里会进入草案审阅模式。',
      }
    }
    if (reviewedCount === 0) {
      return {
        state: 'not_started',
        icon: AlertCircle,
        label: '当前状态',
        title: '待开始审阅',
        detail: '先接受或拒绝变更节点，再看写入影响和门禁。',
      }
    }
    if (unresolvedCount > 0) {
      return {
        state: 'in_progress',
        icon: GitBranch,
        label: '当前状态',
        title: '审阅进行中',
        detail: `还有 ${unresolvedCount} 项未处理，处理完后就可以进行写入预检。`,
      }
    }
    if (reviewApplyGate.status === 'blocked') {
      return {
        state: 'blocked',
        icon: AlertCircle,
        label: '当前状态',
        title: '写入受阻',
        detail: reviewApplyGate.title,
      }
    }
    return {
      state: 'ready_for_preview',
      icon: CheckCircle2,
      label: '当前状态',
      title: '可以进入写入预检',
      detail: reviewApplyGate.detail,
    }
  }, [appliedCounts, applying, reviewApplyGate, reviewNodes.length, reviewedCount, simulating, simulationResult, unresolvedCount])

  useEffect(() => {
    setSimulationResult(null)
    setReviewPreviewDecisionKey('')
    setReviewPreviewIssue(null)
  }, [workspaceSnapshotKey])

  function clearPreviewState() {
    setSimulationResult(null)
    setReviewPreviewIssue(null)
    setReviewPreviewDecisionKey('')
  }

  function setNodeDecision(key: string, decision: ProductionWorkspaceNodeDecision) {
    clearPreviewState()
    onNodeDecisionsChange((prev) => ({ ...prev, [key]: decision }))
  }

  function setNodeDecisions(keys: string[], decision: ProductionWorkspaceNodeDecision) {
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

  function buildAcceptedWorkspace() {
    return buildMergedProductionWorkspace(currentSnapshot, segments, nodeDecisions)
  }

  function buildSimulationResult() {
    const workspace = buildAcceptedWorkspace()
    return buildWorkspaceSimulationResult({
      reviewSegments: segments,
      acceptedSegments: workspace.segments,
      decisions: nodeDecisions,
    })
  }

  async function handleSimulate() {
    setApplyError('')
    setReviewPreviewIssue(null)
    const localResult = buildSimulationResult()
    const workspace = buildAcceptedWorkspace()
    if (currentApplyPreview.writeTaskGraph.length === 0) {
      setSimulationResult(localResult)
      return
    }
    if (!projectId || workspace.segments.length === 0) {
      setSimulationResult(localResult)
      return
    }
    const missingId = findProductionWorkspaceSnapshotIssue(workspace)
    if (missingId) {
      setApplyError(`${missingId.label} 缺少已有实体 ID。制作工作区只能引用已有设定资料，请先补齐上游设定后再预览。`)
      setSimulationResult(localResult)
      return
    }
    setSimulating(true)
    try {
      setSimulationResult({
        ...localResult,
        counts: localResult.counts,
        reviewPreview: {
          dryRun: true,
          counts: localResult.counts,
          returned: {
            segments: workspace.segments.length,
            sceneMoments: workspace.segments.reduce((total, segment) => total + (segment.scene_moments?.length ?? 0), 0),
            settings: localResult.counts.settings_created,
            assetSlots: localResult.counts.asset_slots_created,
            contentUnits: localResult.counts.content_units_created,
            keyframes: localResult.counts.keyframes_created,
            writingExpressions: localResult.counts.writing_expressions_created,
          },
          semanticChanges: localResult.preview.writeTaskGraph.map((item) => ({
            kind: item.kind,
            action: item.action,
            title: item.title,
            id: item.key,
          })),
          warnings: [],
        },
      })
      setReviewPreviewDecisionKey(currentDecisionKey)
    } catch (err) {
      setReviewPreviewIssue({
        message: err instanceof Error ? err.message : '工作区预检失败',
      })
      setSimulationResult(localResult)
      setReviewPreviewDecisionKey('')
    } finally {
      setSimulating(false)
    }
  }

  async function handleApply() {
    if (!projectId) return
    setReviewPreviewIssue(null)
    if (previewOnly) {
      handleSimulate()
      return
    }
    const applyPreview = buildWorkspaceApplyPreview(segments, nodeDecisions)
    if (applyPreview.blocked.length > 0) {
      setApplyError('存在已接受但父级未接受的变更，请先处理“依赖未接受”队列。')
      return
    }
    const workspace = buildAcceptedWorkspace()
    if (applyPreview.writeTaskGraph.length === 0 || workspace.segments.length === 0) {
      setApplyError('请至少接受一个段落后再写入项目')
      return
    }
    const missingId = findProductionWorkspaceSnapshotIssue(workspace)
    if (missingId) {
      setApplyError(`${missingId.label} 缺少已有实体 ID。制作工作区只能引用已有设定资料，请先补齐上游设定后再写入。`)
      return
    }
    if (reviewPreviewDecisionKey !== currentDecisionKey || !simulationResult?.reviewPreview) {
      setApplyError('请先运行一次工作区预检，确认当前接受/拒绝决策可以写入。')
      return
    }
    setApplying(true)
    setApplyError('')
    try {
      const result = buildWorkspaceSimulationResult({
        reviewSegments: segments,
        acceptedSegments: workspace.segments,
        decisions: nodeDecisions,
      })
      await saveProductionWorkspaceSnapshot({
        projectId,
        productionId: workspaceArtifact.productionId,
        snapshot: workspace,
      })
      if (workspaceArtifact.workspaceId) {
        await providerSessionClient.updateWorkspaceArtifact(workspaceArtifact.workspaceId, {
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
    ? buildWorkspaceApplyGate(simulationResult.preview, Boolean(simulationResult.reviewPreview))
    : null
  const canApplySimulation = Boolean(
    projectId
    && reviewPreviewDecisionKey === currentDecisionKey
    && simulationResult?.reviewPreview
    && simulationResult.preview.blocked.length === 0,
  )

  return {
    acceptedCount,
    actionCounts,
    appliedCounts,
    applying,
    applyError,
    reviewPreviewIssue,
    canApplyCurrentReview: Boolean(projectId && reviewApplyGate.status === 'ready'),
    canApplySimulation,
    currentApplyPreview,
    handleApply,
    handleSimulate,
    hideSimulationResult: () => setSimulationResult(null),
    workspaceContext,
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

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertCircle, CheckCircle2, Eye, GitBranch, Loader2 } from 'lucide-react'

import {
  applyProductionWorkspace,
  previewProductionWorkspaceApply,
} from '@/shared/infrastructure/api/semanticEntities'
import { translateApiError, type APIErrorBody } from '@/shared/infrastructure/apiError'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import type { ProductionWorkspaceBackendPreviewIssue, ProductionWorkspaceReviewStatus } from '@/features/production/presentation/productionWorkspaceReviewPresentationTypes'
import type { ProductionWorkspaceNodeDecision } from '@/features/production/domain/productionWorkspaceReviewTypes'
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
  type WorkspaceWorkspaceContent,
  type WorkspaceNodeDecisions,
  type WorkspaceSegmentNode,
  type WorkspaceSimulationResult,
} from '@/features/production/domain/productionWorkspaceReviewModel'

export function useProductionWorkspaceReviewController({
  projectId,
  workspaceWorkspace,
  currentSnapshot,
  nodeDecisions,
  onNodeDecisionsChange,
  previewOnly = false,
  onApplied,
}: {
  projectId?: number
  workspaceWorkspace: WorkspaceWorkspaceContent
  currentSnapshot: { segments: WorkspaceSegmentNode[] }
  nodeDecisions: WorkspaceNodeDecisions
  onNodeDecisionsChange: Dispatch<SetStateAction<WorkspaceNodeDecisions>>
  previewOnly?: boolean
  onApplied: () => void
}) {
  const [applying, setApplying] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [backendPreviewIssue, setBackendPreviewIssue] = useState<ProductionWorkspaceBackendPreviewIssue | null>(null)
  const [appliedCounts, setAppliedCounts] = useState<Record<string, number> | null>(null)
  const [simulationResult, setSimulationResult] = useState<WorkspaceSimulationResult | null>(null)
  const [backendPreviewDecisionKey, setBackendPreviewDecisionKey] = useState('')
  const workspaceSegments = workspaceWorkspace.workspace?.segments ?? []
  const segments = useMemo(() => buildWorkspaceReviewSegments(workspaceSegments, currentSnapshot), [currentSnapshot, workspaceSegments])
  const workspaceContext = useMemo(() => collectWorkspaceContextResources(segments), [segments])
  const semanticDiff = useMemo(() => buildWorkspaceSemanticDiff(segments), [segments])
  const currentApplyPreview = useMemo(() => buildWorkspaceApplyPreview(segments, nodeDecisions), [nodeDecisions, segments])
  const workspaceSnapshotKey = useMemo(() => JSON.stringify({ workspace: workspaceWorkspace.workspace ?? null, currentSnapshot }), [currentSnapshot, workspaceWorkspace.workspace])
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
    backendPreviewDecisionKey === currentDecisionKey && Boolean(simulationResult?.backendPreview),
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
    if (simulationResult?.backendPreview) {
      return {
        state: 'backend_preview_ready',
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
        detail: '打开制作工作区工作区后，这里会进入工作区审阅模式。',
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
    setBackendPreviewDecisionKey('')
    setBackendPreviewIssue(null)
  }, [workspaceSnapshotKey])

  function clearPreviewState() {
    setSimulationResult(null)
    setBackendPreviewIssue(null)
    setBackendPreviewDecisionKey('')
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
    setBackendPreviewIssue(null)
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
      const result = await previewProductionWorkspaceApply(projectId, {
        mode: 'snapshot',
        production_id: workspaceWorkspace.productionId,
        workspace_scope: workspaceWorkspace.workspaceScope ?? 'production',
        workspace,
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
            writingExpressions: result.would_apply.writing_expressions?.length ?? 0,
          },
          semanticChanges: result.semantic_changes ?? [],
          warnings: result.warnings ?? [],
        },
      })
      setBackendPreviewDecisionKey(currentDecisionKey)
    } catch (err) {
      setBackendPreviewIssue(parseWorkspaceBackendPreviewIssue(err))
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
    if (backendPreviewDecisionKey !== currentDecisionKey || !simulationResult?.backendPreview) {
      setApplyError('请先运行一次后端预览，确认当前接受/拒绝决策可以写入。')
      return
    }
    setApplying(true)
    setApplyError('')
    try {
      const result = await applyProductionWorkspace(projectId, {
        mode: 'snapshot',
        production_id: workspaceWorkspace.productionId,
        workspace_scope: workspaceWorkspace.workspaceScope ?? 'production',
        workspace,
      })
      if (workspaceWorkspace.workspaceId) {
        await localAgentClient.updateWorkspace(workspaceWorkspace.workspaceId, {
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
    ? buildWorkspaceApplyGate(simulationResult.preview, Boolean(simulationResult.backendPreview))
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

function parseWorkspaceBackendPreviewIssue(error: unknown): ProductionWorkspaceBackendPreviewIssue {
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

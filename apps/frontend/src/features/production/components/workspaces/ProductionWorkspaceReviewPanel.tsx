import type { Dispatch, SetStateAction } from 'react'
import { AlertCircle, CheckCheck, CheckCircle2, Eye, GitBranch, Target, X } from 'lucide-react'
import {
  ProductionWorkspaceReviewActionButton,
  ProductionWorkspaceReviewActionGroup,
  ProductionWorkspaceReviewContentStack,
  ProductionWorkspaceReviewErrorCallout,
  ProductionWorkspaceReviewScrollArea,
  ProductionWorkspaceReviewShell,
} from '@movscript/ui'

import { ProductionWorkspaceApplyGatePanel } from '@/features/production/components/workspaces/ProductionWorkspaceApplyGatePanel'
import { ProductionWorkspaceApplyPreviewPanel } from '@/features/production/components/workspaces/ProductionWorkspaceApplyPreviewPanel'
import { ProductionWorkspaceBackendPreviewIssuePanel } from '@/features/production/components/workspaces/ProductionWorkspaceBackendPreviewPanel'
import { ProductionWorkspaceReviewFooterActions, ProductionWorkspaceWriteImpactPanel } from '@/features/production/components/workspaces/ProductionWorkspaceReviewControls'
import { ProductionWorkspaceReviewHeader } from '@/features/production/components/workspaces/ProductionWorkspaceReviewHeader'
import {
  ProductionWorkspaceAppliedResultPanel,
  ProductionWorkspaceSimulationResultPanel,
} from '@/features/production/components/workspaces/ProductionWorkspaceReviewResultPanel'
import {
  ProductionWorkspaceContextPanel,
  ProductionWorkspaceSemanticDiffPanel,
} from '@/features/production/components/workspaces/ProductionWorkspaceSemanticDiffPanel'
import { useProductionWorkspaceReviewController } from '@/features/production/presentation/useProductionWorkspaceReviewController'
import type {
  WorkspaceWorkspaceContent,
  WorkspaceNodeDecisions,
  WorkspaceSegmentNode,
} from '@/features/production/domain/productionWorkspaceReviewModel'

export function ProductionWorkspaceReviewPanel({
  projectId,
  workspaceWorkspace,
  currentSnapshot,
  nodeDecisions,
  onNodeDecisionsChange,
  previewOnly = false,
  onAccepted,
  onDiscard,
  onApplied,
}: {
  projectId?: number
  workspaceWorkspace: WorkspaceWorkspaceContent
  currentSnapshot: { segments: WorkspaceSegmentNode[] }
  nodeDecisions: WorkspaceNodeDecisions
  onNodeDecisionsChange: Dispatch<SetStateAction<WorkspaceNodeDecisions>>
  previewOnly?: boolean
  onAccepted: () => void
  onDiscard: () => void
  onApplied: () => void
}) {
  const review = useProductionWorkspaceReviewController({
    projectId,
    workspaceWorkspace,
    currentSnapshot,
    nodeDecisions,
    onNodeDecisionsChange,
    previewOnly,
    onApplied,
  })
  const {
    acceptedCount,
    acceptAllNodes,
    actionCounts,
    appliedCounts,
    applying,
    applyError,
    backendPreviewIssue,
    canApplyCurrentReview,
    canApplySimulation,
    currentApplyPreview,
    handleApply,
    handleSimulate,
    hideSimulationResult,
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
  } = review

  if (appliedCounts) {
    return <ProductionWorkspaceAppliedResultPanel appliedCounts={appliedCounts} onAccepted={onAccepted} />
  }

  if (simulationResult) {
    return (
      <ProductionWorkspaceSimulationResultPanel
        simulationResult={simulationResult}
        applyGate={simulationApplyGate!}
        backendPreviewIssue={backendPreviewIssue}
        semanticDiff={semanticDiff}
        nodeDecisions={nodeDecisions}
        previewOnly={previewOnly}
        applying={applying}
        canApply={canApplySimulation}
        onSetDecision={setNodeDecision}
        onSetDecisions={setNodeDecisions}
        onHide={hideSimulationResult}
        onApply={handleApply}
      />
    )
  }

  return (
    <ProductionWorkspaceReviewShell
      kind="production_workspace"
      title="AI 编排工作区"
      description="逐条审阅 AI 工作区，决定哪些编排和表达可以进入当前稿。"
      icon={GitBranch}
      countLabel={workspaceWorkspace.proposedAt ? '已加载工作区' : undefined}
      action={(
        <ProductionWorkspaceReviewActionGroup>
          <ProductionWorkspaceReviewActionButton size="sm" variant="outline" onClick={acceptAllNodes}>
            <CheckCheck size={12} />
            全部接受
          </ProductionWorkspaceReviewActionButton>
          <ProductionWorkspaceReviewActionButton size="sm" variant="ghost" onClick={resetNodeDecisions}>
            <X size={12} />
            清空
          </ProductionWorkspaceReviewActionButton>
        </ProductionWorkspaceReviewActionGroup>
      )}
    >
      <ProductionWorkspaceReviewHeader
        summary={workspaceWorkspace.summary}
        status={reviewStatus}
        metrics={[
          { icon: GitBranch, label: '工作区节点', value: `${reviewNodes.length}` },
          { icon: CheckCircle2, label: '已接受', value: `${acceptedCount}` },
          { icon: AlertCircle, label: '已拒绝', value: `${rejectedCount}` },
          { icon: Eye, label: '未审', value: `${unresolvedCount}` },
          { icon: Target, label: '进度', value: `${reviewProgress}%` },
        ]}
      />

      <ProductionWorkspaceReviewScrollArea>
        <ProductionWorkspaceReviewContentStack>
          {applyError ? <ProductionWorkspaceReviewErrorCallout icon={AlertCircle} message={applyError} /> : null}
          {backendPreviewIssue && <ProductionWorkspaceBackendPreviewIssuePanel issue={backendPreviewIssue} />}
          <ProductionWorkspaceSemanticDiffPanel
            groups={semanticDiff}
            decisions={nodeDecisions}
            onSetDecision={setNodeDecision}
            onSetDecisions={setNodeDecisions}
          />
          <ProductionWorkspaceApplyGatePanel gate={reviewApplyGate} />
          <ProductionWorkspaceWriteImpactPanel actionCounts={actionCounts} />
          <ProductionWorkspaceContextPanel
            context={workspaceContext}
            decisions={nodeDecisions}
            onSetDecision={setNodeDecision}
          />
          <ProductionWorkspaceApplyPreviewPanel preview={currentApplyPreview} />
        </ProductionWorkspaceReviewContentStack>
      </ProductionWorkspaceReviewScrollArea>

      <ProductionWorkspaceReviewFooterActions
        previewOnly={previewOnly}
        applying={applying}
        simulating={simulating}
        canApply={canApplyCurrentReview}
        onResetDecisions={resetNodeDecisions}
        onDiscard={onDiscard}
        onSimulate={handleSimulate}
        onApply={handleApply}
      />
    </ProductionWorkspaceReviewShell>
  )
}

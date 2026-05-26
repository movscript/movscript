import type { Dispatch, SetStateAction } from 'react'
import { AlertCircle, CheckCheck, CheckCircle2, Eye, GitBranch, Target, X } from 'lucide-react'
import {
  ProductionProposalReviewActionButton,
  ProductionProposalReviewActionGroup,
  ProductionProposalReviewContentStack,
  ProductionProposalReviewErrorCallout,
  ProductionProposalReviewScrollArea,
  ProductionProposalReviewShell,
} from '@movscript/ui'

import { ProductionProposalApplyGatePanel } from '@/features/production/components/proposals/ProductionProposalApplyGatePanel'
import { ProductionProposalApplyPreviewPanel } from '@/features/production/components/proposals/ProductionProposalApplyPreviewPanel'
import { ProductionProposalBackendPreviewIssuePanel } from '@/features/production/components/proposals/ProductionProposalBackendPreviewPanel'
import { ProductionProposalReviewFooterActions, ProductionProposalWriteImpactPanel } from '@/features/production/components/proposals/ProductionProposalReviewControls'
import { ProductionProposalReviewHeader } from '@/features/production/components/proposals/ProductionProposalReviewHeader'
import {
  ProductionProposalAppliedResultPanel,
  ProductionProposalSimulationResultPanel,
} from '@/features/production/components/proposals/ProductionProposalReviewResultPanel'
import {
  ProductionProposalContextPanel,
  ProductionProposalSemanticDiffPanel,
} from '@/features/production/components/proposals/ProductionProposalSemanticDiffPanel'
import { useProductionProposalReviewController } from '@/features/production/presentation/useProductionProposalReviewController'
import type {
  ProposalDraftContent,
  ProposalNodeDecisions,
  ProposalSegmentNode,
} from '@/features/production/domain/productionProposalReviewModel'

export function ProductionProposalReviewPanel({
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
  const review = useProductionProposalReviewController({
    projectId,
    proposalDraft,
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
  } = review

  if (appliedCounts) {
    return <ProductionProposalAppliedResultPanel appliedCounts={appliedCounts} onAccepted={onAccepted} />
  }

  if (simulationResult) {
    return (
      <ProductionProposalSimulationResultPanel
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
    <ProductionProposalReviewShell
      kind="production_proposal"
      title="AI 编排提案"
      description="逐条审阅 AI 提案，决定哪些编排和表达可以进入当前稿。"
      icon={GitBranch}
      countLabel={proposalDraft.proposedAt ? '已加载提案' : undefined}
      action={(
        <ProductionProposalReviewActionGroup>
          <ProductionProposalReviewActionButton size="sm" variant="outline" onClick={acceptAllNodes}>
            <CheckCheck size={12} />
            全部接受
          </ProductionProposalReviewActionButton>
          <ProductionProposalReviewActionButton size="sm" variant="ghost" onClick={resetNodeDecisions}>
            <X size={12} />
            清空
          </ProductionProposalReviewActionButton>
        </ProductionProposalReviewActionGroup>
      )}
    >
      <ProductionProposalReviewHeader
        summary={proposalDraft.summary}
        status={reviewStatus}
        metrics={[
          { icon: GitBranch, label: '提案节点', value: `${reviewNodes.length}` },
          { icon: CheckCircle2, label: '已接受', value: `${acceptedCount}` },
          { icon: AlertCircle, label: '已拒绝', value: `${rejectedCount}` },
          { icon: Eye, label: '未审', value: `${unresolvedCount}` },
          { icon: Target, label: '进度', value: `${reviewProgress}%` },
        ]}
      />

      <ProductionProposalReviewScrollArea>
        <ProductionProposalReviewContentStack>
          {applyError ? <ProductionProposalReviewErrorCallout icon={AlertCircle} message={applyError} /> : null}
          {backendPreviewIssue && <ProductionProposalBackendPreviewIssuePanel issue={backendPreviewIssue} />}
          <ProductionProposalSemanticDiffPanel
            groups={semanticDiff}
            decisions={nodeDecisions}
            onSetDecision={setNodeDecision}
            onSetDecisions={setNodeDecisions}
          />
          <ProductionProposalApplyGatePanel gate={reviewApplyGate} />
          <ProductionProposalWriteImpactPanel actionCounts={actionCounts} />
          <ProductionProposalContextPanel
            context={proposalContext}
            decisions={nodeDecisions}
            onSetDecision={setNodeDecision}
          />
          <ProductionProposalApplyPreviewPanel preview={currentApplyPreview} />
        </ProductionProposalReviewContentStack>
      </ProductionProposalReviewScrollArea>

      <ProductionProposalReviewFooterActions
        previewOnly={previewOnly}
        applying={applying}
        simulating={simulating}
        canApply={canApplyCurrentReview}
        onResetDecisions={resetNodeDecisions}
        onDiscard={onDiscard}
        onSimulate={handleSimulate}
        onApply={handleApply}
      />
    </ProductionProposalReviewShell>
  )
}

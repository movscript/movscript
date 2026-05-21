import type { Dispatch, SetStateAction } from 'react'
import { AlertCircle, CheckCheck, CheckCircle2, Eye, GitBranch, Target, X } from 'lucide-react'
import { Button } from '@movscript/ui'

import { ProductionProposalApplyGatePanel } from '@/components/proposals/ProductionProposalApplyGatePanel'
import { ProductionProposalApplyPreviewPanel } from '@/components/proposals/ProductionProposalApplyPreviewPanel'
import { ProductionProposalBackendPreviewIssuePanel } from '@/components/proposals/ProductionProposalBackendPreviewPanel'
import { ProductionProposalReviewFooterActions, ProductionProposalWriteImpactPanel } from '@/components/proposals/ProductionProposalReviewControls'
import { ProductionProposalReviewHeader } from '@/components/proposals/ProductionProposalReviewHeader'
import {
  ProductionProposalAppliedResultPanel,
  ProductionProposalSimulationResultPanel,
} from '@/components/proposals/ProductionProposalReviewResultPanel'
import {
  ProductionProposalContextPanel,
  ProductionProposalSemanticDiffPanel,
} from '@/components/proposals/ProductionProposalSemanticDiffPanel'
import { ProposalReviewShell } from '@/components/proposals/ProposalReviewShell'
import { useProductionProposalReviewController } from '@/components/proposals/useProductionProposalReviewController'
import type {
  ProposalDraftContent,
  ProposalNodeDecisions,
  ProposalSegmentNode,
} from '@/lib/productionProposalReviewModel'

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
    <ProposalReviewShell
      kind="production_proposal"
      title="AI 编排提案"
      description="逐条审阅 AI 提案，决定哪些编排和表达可以进入当前稿。"
      countLabel={proposalDraft.proposedAt ? '已加载提案' : undefined}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      action={(
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 type-label" onClick={acceptAllNodes}>
            <CheckCheck size={12} />
            全部接受
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 type-label" onClick={resetNodeDecisions}>
            <X size={12} />
            清空
          </Button>
        </div>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex min-h-0 w-full flex-col gap-3">
          {applyError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-800/50 dark:bg-rose-950/30">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />
              <p className="type-label text-rose-700 dark:text-rose-300">{applyError}</p>
            </div>
          )}
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
        </div>
      </div>

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
    </ProposalReviewShell>
  )
}

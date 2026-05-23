import { Check, CheckCircle2, Eye, GitBranch, Loader2 } from 'lucide-react'
import { Badge, Button, ReviewCallout, ReviewStat, semanticToneClass } from '@movscript/ui'

import {
  ProductionProposalApplyGatePanel,
  type ProductionProposalApplyGate,
} from '@/components/proposals/ProductionProposalApplyGatePanel'
import { ProductionProposalApplyPreviewPanel } from '@/components/proposals/ProductionProposalApplyPreviewPanel'
import {
  ProductionProposalBackendPreviewIssuePanel,
  ProductionProposalBackendPreviewSemanticSummary,
  type ProductionProposalBackendPreviewIssue,
} from '@/components/proposals/ProductionProposalBackendPreviewPanel'
import {
  ProductionProposalSemanticDiffPanel,
  type ProductionProposalNodeDecision,
  type ProductionProposalNodeDecisions,
  type ProductionProposalSemanticDiffGroup,
} from '@/components/proposals/ProductionProposalSemanticDiffPanel'
import type { ProposalSimulationResult } from '@/lib/productionProposalReviewModel'
import { cn } from '@/lib/utils'

export function ProductionProposalAppliedResultPanel({
  appliedCounts,
  onAccepted,
}: {
  appliedCounts: Record<string, number>
  onAccepted: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <ReviewCallout tone="success" icon={CheckCircle2} title="提案已写入项目">
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center type-tiny">
          {appliedCounts.segments_created > 0 && (
            <ReviewStat tone="success">编排段 +{appliedCounts.segments_created}</ReviewStat>
          )}
          {appliedCounts.scene_moments_created > 0 && (
            <ReviewStat tone="success">情节 +{appliedCounts.scene_moments_created}</ReviewStat>
          )}
          {appliedCounts.writing_expressions_created > 0 && (
            <ReviewStat tone="success">表达 +{appliedCounts.writing_expressions_created}</ReviewStat>
          )}
          {appliedCounts.creative_references_created > 0 && (
            <ReviewStat tone="success">设定资料 +{appliedCounts.creative_references_created}</ReviewStat>
          )}
          {appliedCounts.asset_slots_created > 0 && (
            <ReviewStat tone="success">素材需求 +{appliedCounts.asset_slots_created}</ReviewStat>
          )}
        </div>
      </ReviewCallout>
      <Button size="sm" variant="outline" className="type-label" onClick={onAccepted}>
        完成
      </Button>
    </div>
  )
}

export function ProductionProposalSimulationResultPanel({
  simulationResult,
  applyGate,
  backendPreviewIssue,
  semanticDiff,
  nodeDecisions,
  previewOnly,
  applying,
  canApply,
  onSetDecision,
  onSetDecisions,
  onHide,
  onApply,
}: {
  simulationResult: ProposalSimulationResult
  applyGate: ProductionProposalApplyGate
  backendPreviewIssue: ProductionProposalBackendPreviewIssue | null
  semanticDiff: ProductionProposalSemanticDiffGroup[]
  nodeDecisions: ProductionProposalNodeDecisions
  previewOnly: boolean
  applying: boolean
  canApply: boolean
  onSetDecision: (key: string, decision: ProductionProposalNodeDecision) => void
  onSetDecisions: (keys: string[], decision: ProductionProposalNodeDecision) => void
  onHide: () => void
  onApply: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <ReviewCallout tone="success" icon={Eye} title={simulationResult.backendPreview ? '写入预检已生成' : '本地预览已生成'}>
        <p className="mt-1 type-caption leading-4 opacity-80">
          {simulationResult.backendPreview ? '系统已校验本次写入影响，不会提交到项目。' : '本次预览仅基于当前接受/拒绝决策计算，不会提交到项目。'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 type-tiny">
          <ReviewStat tone="success">已接受 {simulationResult.acceptedNodes}</ReviewStat>
          <ReviewStat tone="danger">已拒绝 {simulationResult.rejectedNodes}</ReviewStat>
          <ReviewStat tone="neutral">未审 {simulationResult.unresolvedNodes}</ReviewStat>
          <ReviewStat tone="neutral">新增 {simulationResult.actions.create}</ReviewStat>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center type-tiny">
          <ReviewStat tone="success">编排段 +{simulationResult.counts.segments_created}</ReviewStat>
          <ReviewStat tone="success">情节 +{simulationResult.counts.scene_moments_created}</ReviewStat>
          <ReviewStat tone="success">表达 +{simulationResult.counts.writing_expressions_created}</ReviewStat>
          <ReviewStat tone="success">内容 +{simulationResult.counts.content_units_created}</ReviewStat>
          <ReviewStat tone="success">设定资料 +{simulationResult.counts.creative_references_created}</ReviewStat>
          <ReviewStat tone="success">素材需求 +{simulationResult.counts.asset_slots_created}</ReviewStat>
          <ReviewStat tone="success">引用 +{simulationResult.counts.creative_reference_usages}</ReviewStat>
        </div>
      </ReviewCallout>

      {simulationResult.backendPreview && (
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className={semanticToneClass('success', 'icon')} />
            <p className="type-label font-semibold text-foreground">写入预检结果</p>
            <Badge variant="secondary" className="ml-auto h-5 rounded-full px-2 type-tiny">未写库</Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-center type-tiny sm:grid-cols-3">
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回编排段 {simulationResult.backendPreview.returned.segments}</span>
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回情节 {simulationResult.backendPreview.returned.sceneMoments}</span>
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回表达 {simulationResult.backendPreview.returned.writingExpressions}</span>
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回内容 {simulationResult.backendPreview.returned.contentUnits}</span>
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回画面锚点 {simulationResult.backendPreview.returned.keyframes}</span>
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回素材 {simulationResult.backendPreview.returned.assetSlots}</span>
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">新设定 {simulationResult.backendPreview.returned.creativeReferences}</span>
          </div>
          <ProductionProposalBackendPreviewSemanticSummary
            changes={simulationResult.backendPreview.semanticChanges}
            warnings={simulationResult.backendPreview.warnings}
          />
        </div>
      )}

      <ProductionProposalApplyGatePanel gate={applyGate} />
      {backendPreviewIssue && <ProductionProposalBackendPreviewIssuePanel issue={backendPreviewIssue} />}
      <ProductionProposalApplyPreviewPanel preview={simulationResult.preview} />
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-primary" />
          <p className="type-label font-semibold text-foreground">继续审阅提案</p>
        </div>
        <p className="mt-1 type-caption leading-4 text-muted-foreground">
          预检结果保留在上方；如果继续调整接受或拒绝，系统会自动清除旧预检结果并回到最新决策。
        </p>
        <div className="mt-3">
          <ProductionProposalSemanticDiffPanel
            groups={semanticDiff}
            decisions={nodeDecisions}
            onSetDecision={onSetDecision}
            onSetDecisions={onSetDecisions}
          />
        </div>
      </div>
      <div className={cn('grid gap-2', previewOnly ? 'grid-cols-1' : 'grid-cols-2')}>
        <Button size="sm" variant="outline" className="type-label" disabled={applying} onClick={onHide}>
          隐藏预检结果
        </Button>
        {!previewOnly && (
          <Button
            size="sm"
            className="gap-1.5 type-label"
            disabled={applying || !canApply}
            onClick={onApply}
          >
            {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            写入项目
          </Button>
        )}
      </div>
    </div>
  )
}

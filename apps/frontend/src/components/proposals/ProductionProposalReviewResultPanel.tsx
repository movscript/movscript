import { Check, CheckCircle2, Eye, GitBranch, Loader2 } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'

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
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
          <p className="type-label font-medium text-emerald-700 dark:text-emerald-300">提案已写入项目</p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center type-tiny text-emerald-700 dark:text-emerald-300">
          {appliedCounts.segments_created > 0 && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">编排段 +{appliedCounts.segments_created}</span>
          )}
          {appliedCounts.scene_moments_created > 0 && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">情节 +{appliedCounts.scene_moments_created}</span>
          )}
          {appliedCounts.creative_references_created > 0 && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">设定资料 +{appliedCounts.creative_references_created}</span>
          )}
          {appliedCounts.asset_slots_created > 0 && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-1">素材需求 +{appliedCounts.asset_slots_created}</span>
          )}
        </div>
      </div>
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
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2">
          <Eye size={14} className="shrink-0 text-emerald-500" />
          <p className="type-label font-medium text-emerald-700 dark:text-emerald-300">{simulationResult.backendPreview ? '写入预检已生成' : '本地预览已生成'}</p>
        </div>
        <p className="mt-1 type-caption leading-4 text-emerald-700/80 dark:text-emerald-300/80">
          {simulationResult.backendPreview ? '系统已校验本次写入影响，不会提交到项目。' : '本次预览仅基于当前接受/拒绝决策计算，不会提交到项目。'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 type-tiny text-emerald-700 dark:text-emerald-300">
          <span className="rounded bg-emerald-500/10 px-1.5 py-1">已接受 {simulationResult.acceptedNodes}</span>
          <span className="rounded bg-rose-500/10 px-1.5 py-1">已拒绝 {simulationResult.rejectedNodes}</span>
          <span className="rounded bg-muted px-1.5 py-1">未审 {simulationResult.unresolvedNodes}</span>
          <span className="rounded bg-muted px-1.5 py-1">新增 {simulationResult.actions.create}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center type-tiny text-emerald-700 dark:text-emerald-300">
          <span className="rounded bg-emerald-500/10 px-1.5 py-1">编排段 +{simulationResult.counts.segments_created}</span>
          <span className="rounded bg-emerald-500/10 px-1.5 py-1">情节 +{simulationResult.counts.scene_moments_created}</span>
          <span className="rounded bg-emerald-500/10 px-1.5 py-1">内容 +{simulationResult.counts.content_units_created}</span>
          <span className="rounded bg-emerald-500/10 px-1.5 py-1">画面锚点 +{simulationResult.counts.keyframes_created}</span>
          <span className="rounded bg-emerald-500/10 px-1.5 py-1">设定资料 +{simulationResult.counts.creative_references_created}</span>
          <span className="rounded bg-emerald-500/10 px-1.5 py-1">素材需求 +{simulationResult.counts.asset_slots_created}</span>
          <span className="rounded bg-emerald-500/10 px-1.5 py-1">引用 +{simulationResult.counts.creative_reference_usages}</span>
        </div>
      </div>

      {simulationResult.backendPreview && (
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <p className="type-label font-semibold text-foreground">写入预检结果</p>
            <Badge variant="secondary" className="ml-auto h-5 rounded-full px-2 type-tiny">未写库</Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-center type-tiny sm:grid-cols-3">
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回编排段 {simulationResult.backendPreview.returned.segments}</span>
            <span className="rounded bg-muted px-1.5 py-1 text-foreground">返回情节 {simulationResult.backendPreview.returned.sceneMoments}</span>
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

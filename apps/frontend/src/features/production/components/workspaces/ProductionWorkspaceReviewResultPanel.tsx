import { Check, CheckCircle2, Eye, GitBranch } from 'lucide-react'
import {
  ProductionWorkspaceContinueReviewPanel,
  ProductionWorkspaceReviewPreviewReadyPanel,
  ProductionWorkspaceResultActionButton,
  ProductionWorkspaceResultActions,
  ProductionWorkspaceResultCallout,
  ProductionWorkspaceResultStack,
  ProductionWorkspaceResultStatGrid,
} from '@movscript/ui'

import { ProductionWorkspaceApplyGatePanel } from '@/features/production/components/workspaces/ProductionWorkspaceApplyGatePanel'
import { ProductionWorkspaceApplyPreviewPanel } from '@/features/production/components/workspaces/ProductionWorkspaceApplyPreviewPanel'
import {
  ProductionWorkspaceReviewPreviewIssuePanel,
  ProductionWorkspaceReviewPreviewSemanticSummary,
} from '@/features/production/components/workspaces/ProductionWorkspaceReviewPreviewPanel'
import { ProductionWorkspaceSemanticDiffPanel } from '@/features/production/components/workspaces/ProductionWorkspaceSemanticDiffPanel'
import type { WorkspaceSimulationResult } from '@/features/production/domain/productionWorkspaceReviewModel'
import type { ProductionWorkspaceReviewPreviewIssue } from '@/features/production/presentation/productionWorkspaceReviewPresentationTypes'
import type {
  ProductionWorkspaceApplyGate,
  ProductionWorkspaceNodeDecision,
  ProductionWorkspaceNodeDecisions,
  ProductionWorkspaceSemanticDiffGroup,
} from '@/features/production/domain/productionWorkspaceReviewTypes'

export function ProductionWorkspaceAppliedResultPanel({
  appliedCounts,
  onAccepted,
}: {
  appliedCounts: Record<string, number>
  onAccepted: () => void
}) {
  return (
    <ProductionWorkspaceResultStack>
      <ProductionWorkspaceResultCallout
        icon={CheckCircle2}
        title="工作区已写入项目"
      >
        <ProductionWorkspaceResultStatGrid
          stats={[
            { outcome: 'created', label: '编排段', value: appliedCounts.segments_created > 0 ? `+${appliedCounts.segments_created}` : 0 },
            { outcome: 'created', label: '情节', value: appliedCounts.scene_moments_created > 0 ? `+${appliedCounts.scene_moments_created}` : 0 },
            { outcome: 'created', label: '表达', value: appliedCounts.writing_expressions_created > 0 ? `+${appliedCounts.writing_expressions_created}` : 0 },
            { outcome: 'created', label: '设定资料', value: appliedCounts.settings_created > 0 ? `+${appliedCounts.settings_created}` : 0 },
            { outcome: 'created', label: '素材需求', value: appliedCounts.asset_slots_created > 0 ? `+${appliedCounts.asset_slots_created}` : 0 },
          ]}
        />
      </ProductionWorkspaceResultCallout>
      <ProductionWorkspaceResultActionButton size="sm" variant="outline" onClick={onAccepted}>
        完成
      </ProductionWorkspaceResultActionButton>
    </ProductionWorkspaceResultStack>
  )
}

export function ProductionWorkspaceSimulationResultPanel({
  simulationResult,
  applyGate,
  reviewPreviewIssue,
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
  simulationResult: WorkspaceSimulationResult
  applyGate: ProductionWorkspaceApplyGate
  reviewPreviewIssue: ProductionWorkspaceReviewPreviewIssue | null
  semanticDiff: ProductionWorkspaceSemanticDiffGroup[]
  nodeDecisions: ProductionWorkspaceNodeDecisions
  previewOnly: boolean
  applying: boolean
  canApply: boolean
  onSetDecision: (key: string, decision: ProductionWorkspaceNodeDecision) => void
  onSetDecisions: (keys: string[], decision: ProductionWorkspaceNodeDecision) => void
  onHide: () => void
  onApply: () => void
}) {
  return (
    <ProductionWorkspaceResultStack>
      <ProductionWorkspaceResultCallout
        icon={Eye}
        title={simulationResult.reviewPreview ? '写入预检已生成' : '本地预览已生成'}
        description={simulationResult.reviewPreview ? '系统已校验本次 workspace 写入影响，不会提交到项目。' : '本次预览仅基于当前接受/拒绝决策计算，不会提交到项目。'}
        stats={[
          { outcome: 'accepted', label: '已接受', value: simulationResult.acceptedNodes, showZero: true },
          { outcome: 'rejected', label: '已拒绝', value: simulationResult.rejectedNodes, showZero: true },
          { outcome: 'pending', label: '未审', value: simulationResult.unresolvedNodes, showZero: true },
          { outcome: 'created', label: '新增', value: simulationResult.actions.create, showZero: true },
        ]}
      >
        <ProductionWorkspaceResultStatGrid
          stats={[
            { outcome: 'created', label: '编排段', value: `+${simulationResult.counts.segments_created}` },
            { outcome: 'created', label: '情节', value: `+${simulationResult.counts.scene_moments_created}` },
            { outcome: 'created', label: '表达', value: `+${simulationResult.counts.writing_expressions_created}` },
            { outcome: 'created', label: '内容', value: `+${simulationResult.counts.content_units_created}` },
            { outcome: 'created', label: '设定资料', value: `+${simulationResult.counts.settings_created}` },
            { outcome: 'created', label: '素材需求', value: `+${simulationResult.counts.asset_slots_created}` },
            { outcome: 'created', label: '引用', value: `+${simulationResult.counts.setting_usages}` },
          ]}
        />
      </ProductionWorkspaceResultCallout>

      {simulationResult.reviewPreview && (
        <ProductionWorkspaceReviewPreviewReadyPanel
          icon={CheckCircle2}
          title="写入预检结果"
          stats={[
            { label: '返回编排段', value: simulationResult.reviewPreview.returned.segments, showZero: true },
            { label: '返回情节', value: simulationResult.reviewPreview.returned.sceneMoments, showZero: true },
            { label: '返回表达', value: simulationResult.reviewPreview.returned.writingExpressions, showZero: true },
            { label: '返回内容', value: simulationResult.reviewPreview.returned.contentUnits, showZero: true },
            { label: '返回画面锚点', value: simulationResult.reviewPreview.returned.keyframes, showZero: true },
            { label: '返回素材', value: simulationResult.reviewPreview.returned.assetSlots, showZero: true },
            { label: '新设定', value: simulationResult.reviewPreview.returned.settings, showZero: true },
          ]}
        >
          <ProductionWorkspaceReviewPreviewSemanticSummary
            changes={simulationResult.reviewPreview.semanticChanges}
            warnings={simulationResult.reviewPreview.warnings}
          />
        </ProductionWorkspaceReviewPreviewReadyPanel>
      )}

      <ProductionWorkspaceApplyGatePanel gate={applyGate} />
      {reviewPreviewIssue && <ProductionWorkspaceReviewPreviewIssuePanel issue={reviewPreviewIssue} />}
      <ProductionWorkspaceApplyPreviewPanel preview={simulationResult.preview} />
      <ProductionWorkspaceContinueReviewPanel
        icon={GitBranch}
        title="继续审阅工作区"
        description="预检结果保留在上方；如果继续调整接受或拒绝，系统会自动清除旧预检结果并回到最新决策。"
      >
        <ProductionWorkspaceSemanticDiffPanel
          groups={semanticDiff}
          decisions={nodeDecisions}
          onSetDecision={onSetDecision}
          onSetDecisions={onSetDecisions}
        />
      </ProductionWorkspaceContinueReviewPanel>
      <ProductionWorkspaceResultActions previewOnly={previewOnly}>
        <ProductionWorkspaceResultActionButton size="sm" variant="outline" disabled={applying} onClick={onHide}>
          隐藏预检结果
        </ProductionWorkspaceResultActionButton>
        {!previewOnly && (
          <ProductionWorkspaceResultActionButton
            size="sm"
            loading={applying}
            disabled={applying || !canApply}
            onClick={onApply}
          >
            <Check size={12} />
            写入项目
          </ProductionWorkspaceResultActionButton>
        )}
      </ProductionWorkspaceResultActions>
    </ProductionWorkspaceResultStack>
  )
}

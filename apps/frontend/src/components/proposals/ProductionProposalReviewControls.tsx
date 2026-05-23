import { Check, Eye, Loader2, Target } from 'lucide-react'
import { Button, ReviewStat } from '@movscript/ui'

import { cn } from '@/lib/utils'

export function ProductionProposalWriteImpactPanel({
  actionCounts,
}: {
  actionCounts: { create: number; update: number; delete: number }
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <Target size={14} className="text-primary" />
        <p className="type-label font-semibold text-foreground">写入影响</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-center type-tiny">
        <ReviewStat tone="success">新建 {actionCounts.create}</ReviewStat>
        <ReviewStat tone="warning">更新 {actionCounts.update}</ReviewStat>
        <ReviewStat tone="danger">删除 {actionCounts.delete}</ReviewStat>
      </div>
      <p className="mt-2 type-caption leading-4 text-muted-foreground">
        写入时会按完整提案同步：已有节点会更新，新节点会创建，未保留的旧节点会进入删除候选。
      </p>
    </div>
  )
}

export function ProductionProposalReviewFooterActions({
  previewOnly,
  applying,
  simulating,
  canApply,
  onResetDecisions,
  onDiscard,
  onSimulate,
  onApply,
  discardLabel = '放弃提案',
}: {
  previewOnly: boolean
  applying: boolean
  simulating: boolean
  canApply: boolean
  discardLabel?: string
  onResetDecisions: () => void
  onDiscard: () => void
  onSimulate: () => void
  onApply: () => void
}) {
  return (
    <div className={cn('sticky bottom-0 z-10 shrink-0 border-t border-border bg-card/95 p-3 backdrop-blur', previewOnly ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2')}>
      <Button
        size="sm"
        variant="outline"
        className="type-label"
        disabled={applying || simulating}
        onClick={previewOnly ? onResetDecisions : onDiscard}
      >
        {previewOnly ? '清空决策' : discardLabel}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 type-label"
        disabled={applying || simulating}
        onClick={onSimulate}
      >
        {simulating ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
        预检影响
      </Button>
      {!previewOnly && (
        <Button
          size="sm"
          className="gap-1.5 type-label"
          disabled={applying || simulating || !canApply}
          onClick={onApply}
        >
          {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          应用提案到项目
        </Button>
      )}
    </div>
  )
}

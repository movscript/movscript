import { Check, Eye, Target } from 'lucide-react'
import {
  ReviewWorkspaceFooterActions,
  ReviewWorkspaceWriteImpactPanel,
} from '@movscript/ui'

export function ProductionWorkspaceWriteImpactPanel({
  actionCounts,
}: {
  actionCounts: { create: number; update: number; delete: number }
}) {
  return <ReviewWorkspaceWriteImpactPanel icon={Target} actionCounts={actionCounts} />
}

export function ProductionWorkspaceReviewFooterActions({
  previewOnly,
  applying,
  simulating,
  canApply,
  onResetDecisions,
  onDiscard,
  onSimulate,
  onApply,
  discardLabel = '放弃工作区',
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
    <ReviewWorkspaceFooterActions
      previewOnly={previewOnly}
      applying={applying}
      simulating={simulating}
      canApply={canApply}
      onResetDecisions={onResetDecisions}
      onDiscard={onDiscard}
      onSimulate={onSimulate}
      onApply={onApply}
      discardLabel={discardLabel}
      simulateIcon={<Eye size={12} />}
      applyIcon={<Check size={12} />}
    />
  )
}

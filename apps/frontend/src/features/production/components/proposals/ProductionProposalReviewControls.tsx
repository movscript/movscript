import { Check, Eye, Target } from 'lucide-react'
import {
  ReviewProposalFooterActions,
  ReviewProposalWriteImpactPanel,
} from '@movscript/ui'

export function ProductionProposalWriteImpactPanel({
  actionCounts,
}: {
  actionCounts: { create: number; update: number; delete: number }
}) {
  return <ReviewProposalWriteImpactPanel icon={Target} actionCounts={actionCounts} />
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
    <ReviewProposalFooterActions
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

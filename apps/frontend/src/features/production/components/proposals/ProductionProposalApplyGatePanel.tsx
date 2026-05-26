import { AlertCircle, CheckCircle2, Eye } from 'lucide-react'
import { ReviewProposalApplyGatePanel } from '@movscript/ui'

import type { ProductionProposalApplyGate } from '@/features/production/domain/productionProposalReviewTypes'

export function ProductionProposalApplyGatePanel({
  gate,
  compact = false,
}: {
  gate: ProductionProposalApplyGate
  compact?: boolean
}) {
  const Icon = gate.status === 'ready' ? CheckCircle2 : gate.status === 'blocked' ? AlertCircle : Eye

  return (
    <ReviewProposalApplyGatePanel
      status={gate.status}
      icon={Icon}
      title={gate.title}
      detail={gate.detail}
      compact={compact}
    />
  )
}

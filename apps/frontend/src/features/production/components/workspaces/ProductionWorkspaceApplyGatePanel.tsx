import { AlertCircle, CheckCircle2, Eye } from 'lucide-react'
import { ReviewWorkspaceApplyGatePanel } from '@movscript/ui'

import type { ProductionWorkspaceApplyGate } from '@/features/production/domain/productionWorkspaceReviewTypes'

export function ProductionWorkspaceApplyGatePanel({
  gate,
  compact = false,
}: {
  gate: ProductionWorkspaceApplyGate
  compact?: boolean
}) {
  const Icon = gate.status === 'ready' ? CheckCircle2 : gate.status === 'blocked' ? AlertCircle : Eye

  return (
    <ReviewWorkspaceApplyGatePanel
      status={gate.status}
      icon={Icon}
      title={gate.title}
      detail={gate.detail}
      compact={compact}
    />
  )
}

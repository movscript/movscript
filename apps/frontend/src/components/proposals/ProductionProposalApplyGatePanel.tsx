import { AlertCircle, CheckCircle2, Eye } from 'lucide-react'
import { ReviewCallout, type ReviewTone } from '@movscript/ui'

export interface ProductionProposalApplyGate {
  status: 'ready' | 'blocked' | 'needs_preview' | 'empty'
  title: string
  detail: string
}

export function ProductionProposalApplyGatePanel({
  gate,
  compact = false,
}: {
  gate: ProductionProposalApplyGate
  compact?: boolean
}) {
  const tone: ReviewTone = gate.status === 'ready'
    ? 'success'
    : gate.status === 'blocked'
      ? 'danger'
      : gate.status === 'empty'
        ? 'neutral'
        : 'warning'
  const Icon = gate.status === 'ready' ? CheckCircle2 : gate.status === 'blocked' ? AlertCircle : Eye
  return (
    <ReviewCallout tone={tone} icon={Icon} title={gate.title} compact={compact}>
      {!compact && <p className="mt-1 type-caption leading-4 opacity-80">{gate.detail}</p>}
    </ReviewCallout>
  )
}

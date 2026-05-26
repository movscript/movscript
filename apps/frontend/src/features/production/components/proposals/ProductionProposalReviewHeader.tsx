import type { LucideIcon } from 'lucide-react'
import { ProductionProposalReviewSummary } from '@movscript/ui'

import type { ProductionProposalReviewStatus } from '@/features/production/presentation/productionProposalReviewPresentationTypes'

export interface ProductionProposalReviewMetric {
  icon: LucideIcon
  label: string
  value: string
}

export function ProductionProposalReviewHeader({
  summary,
  status,
  metrics,
}: {
  summary?: string
  status: ProductionProposalReviewStatus
  metrics: ProductionProposalReviewMetric[]
}) {
  return (
    <ProductionProposalReviewSummary
      summary={summary}
      status={status}
      metrics={metrics}
    />
  )
}

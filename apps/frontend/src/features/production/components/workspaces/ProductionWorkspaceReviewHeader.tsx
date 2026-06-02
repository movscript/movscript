import type { LucideIcon } from 'lucide-react'
import { ProductionWorkspaceReviewSummary } from '@movscript/ui'

import type { ProductionWorkspaceReviewStatus } from '@/features/production/presentation/productionWorkspaceReviewPresentationTypes'

export interface ProductionWorkspaceReviewMetric {
  icon: LucideIcon
  label: string
  value: string
}

export function ProductionWorkspaceReviewHeader({
  summary,
  status,
  metrics,
}: {
  summary?: string
  status: ProductionWorkspaceReviewStatus
  metrics: ProductionWorkspaceReviewMetric[]
}) {
  return (
    <ProductionWorkspaceReviewSummary
      summary={summary}
      status={status}
      metrics={metrics}
    />
  )
}

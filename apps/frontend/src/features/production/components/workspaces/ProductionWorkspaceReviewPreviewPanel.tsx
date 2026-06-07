import { AlertCircle } from 'lucide-react'
import {
  ProductionWorkspaceReviewPreviewIssueCallout,
  ProductionWorkspaceReviewPreviewSemanticSummary as PackageProductionWorkspaceReviewPreviewSemanticSummary,
} from '@movscript/ui'

import type {
  ProductionWorkspaceReviewChange,
  ProductionWorkspaceReviewWarning,
} from '@/features/production/domain/productionWorkspaceReviewModel'
import type { ProductionWorkspaceReviewPreviewIssue } from '@/features/production/presentation/productionWorkspaceReviewPresentationTypes'

export function ProductionWorkspaceReviewPreviewIssuePanel({ issue }: { issue: ProductionWorkspaceReviewPreviewIssue }) {
  return <ProductionWorkspaceReviewPreviewIssueCallout icon={AlertCircle} issue={issue} />
}

export function ProductionWorkspaceReviewPreviewSemanticSummary({
  changes,
  warnings,
}: {
  changes: ProductionWorkspaceReviewChange[]
  warnings: ProductionWorkspaceReviewWarning[]
}) {
  return (
    <PackageProductionWorkspaceReviewPreviewSemanticSummary
      changes={changes.map((change, index) => ({
        key: `${change.kind}-${change.client_id ?? change.id ?? index}`,
        kind: change.kind,
        action: change.action,
        title: change.title,
      }))}
      warnings={warnings}
    />
  )
}

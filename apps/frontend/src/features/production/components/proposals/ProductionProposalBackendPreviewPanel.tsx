import { AlertCircle } from 'lucide-react'
import {
  ProductionProposalBackendPreviewIssueCallout,
  ProductionProposalBackendPreviewSemanticSummary as PackageProductionProposalBackendPreviewSemanticSummary,
} from '@movscript/ui'

import type {
  ProductionProposalPreviewSemanticChange,
  ProductionProposalPreviewWarning,
} from '@/shared/infrastructure/api/semanticEntities'
import type { ProductionProposalBackendPreviewIssue } from '@/features/production/presentation/productionProposalReviewPresentationTypes'

export function ProductionProposalBackendPreviewIssuePanel({ issue }: { issue: ProductionProposalBackendPreviewIssue }) {
  return <ProductionProposalBackendPreviewIssueCallout icon={AlertCircle} issue={issue} />
}

export function ProductionProposalBackendPreviewSemanticSummary({
  changes,
  warnings,
}: {
  changes: ProductionProposalPreviewSemanticChange[]
  warnings: ProductionProposalPreviewWarning[]
}) {
  return (
    <PackageProductionProposalBackendPreviewSemanticSummary
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

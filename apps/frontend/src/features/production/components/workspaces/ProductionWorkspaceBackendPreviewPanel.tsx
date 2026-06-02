import { AlertCircle } from 'lucide-react'
import {
  ProductionWorkspaceBackendPreviewIssueCallout,
  ProductionWorkspaceBackendPreviewSemanticSummary as PackageProductionWorkspaceBackendPreviewSemanticSummary,
} from '@movscript/ui'

import type {
  ProductionWorkspacePreviewSemanticChange,
  ProductionWorkspacePreviewWarning,
} from '@/shared/infrastructure/api/semanticEntities'
import type { ProductionWorkspaceBackendPreviewIssue } from '@/features/production/presentation/productionWorkspaceReviewPresentationTypes'

export function ProductionWorkspaceBackendPreviewIssuePanel({ issue }: { issue: ProductionWorkspaceBackendPreviewIssue }) {
  return <ProductionWorkspaceBackendPreviewIssueCallout icon={AlertCircle} issue={issue} />
}

export function ProductionWorkspaceBackendPreviewSemanticSummary({
  changes,
  warnings,
}: {
  changes: ProductionWorkspacePreviewSemanticChange[]
  warnings: ProductionWorkspacePreviewWarning[]
}) {
  return (
    <PackageProductionWorkspaceBackendPreviewSemanticSummary
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

import { ProductionProposalApplyPreviewPanel as PackageProductionProposalApplyPreviewPanel } from '@movscript/ui'

import type { ProductionProposalApplyPreview } from '@/features/production/domain/productionProposalReviewTypes'

export function ProductionProposalApplyPreviewPanel({ preview }: { preview: ProductionProposalApplyPreview }) {
  return <PackageProductionProposalApplyPreviewPanel preview={preview} />
}

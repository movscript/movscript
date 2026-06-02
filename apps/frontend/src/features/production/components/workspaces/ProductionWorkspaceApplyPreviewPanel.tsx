import { ProductionWorkspaceApplyPreviewPanel as PackageProductionWorkspaceApplyPreviewPanel } from '@movscript/ui'

import type { ProductionWorkspaceApplyPreview } from '@/features/production/domain/productionWorkspaceReviewTypes'

export function ProductionWorkspaceApplyPreviewPanel({ preview }: { preview: ProductionWorkspaceApplyPreview }) {
  return <PackageProductionWorkspaceApplyPreviewPanel preview={preview} />
}

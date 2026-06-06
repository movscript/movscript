import { buildEntityPatchRequest } from './directPatch'
import {
  buildProductionWorkspaceRequest,
  buildProjectLayerWorkspaceRequest,
  isProductionWorkspaceTarget,
  isProjectLayerWorkspaceTarget,
} from './workspacePayloads'
import type { WorkspaceReviewApplyRequest } from './types'

export function buildApplyRequest(review: Record<string, unknown>): WorkspaceReviewApplyRequest {
  if (isProjectLayerWorkspaceTarget(review)) {
    return buildProjectLayerWorkspaceRequest(review)
  }
  if (isProductionWorkspaceTarget(review)) {
    return buildProductionWorkspaceRequest(review)
  }
  return buildEntityPatchRequest(review)
}

export {
  isProductionWorkspaceTarget,
  isProjectLayerWorkspaceTarget,
}

import { buildEntityPatchRequest } from './directPatch'
import {
  buildProductionProposalRequest,
  buildProjectLayerProposalRequest,
  isProductionProposalTarget,
  isProjectLayerProposalTarget,
} from './proposalPayloads'
import type { DraftReviewApplyRequest } from './types'
import { getObjectParamValue } from './utils'

export function getReviewParam(args: Record<string, unknown>): Record<string, unknown> {
  return getObjectParamValue(args, 'review')
}

export function buildApplyRequest(review: Record<string, unknown>): DraftReviewApplyRequest {
  if (isProjectLayerProposalTarget(review)) {
    return buildProjectLayerProposalRequest(review)
  }
  if (isProductionProposalTarget(review)) {
    return buildProductionProposalRequest(review)
  }
  return buildEntityPatchRequest(review)
}

export {
  isProductionProposalTarget,
  isProjectLayerProposalTarget,
}

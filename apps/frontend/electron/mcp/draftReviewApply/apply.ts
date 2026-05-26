import { backendPatch, backendPost, getMCPAPIBaseURL } from '../backendClient'
import {
  buildApplyRequest,
  getReviewParam,
  isProductionProposalTarget,
  isProjectLayerProposalTarget,
} from './request'

export async function applyDraftReview(args: Record<string, unknown>): Promise<unknown> {
  const review = getReviewParam(args)
  const request = buildApplyRequest(review)
  const response = request.method === 'PATCH'
    ? await backendPatch(request.path, request.payload, args.userId)
    : await backendPost(request.path, request.payload, args.userId)
  return {
    performed: true,
    method: request.method,
    url: `${getMCPAPIBaseURL()}${request.path}`,
    payload: request.payload,
    response,
  }
}

export async function previewApplyDraftReview(args: Record<string, unknown>): Promise<unknown> {
  const review = getReviewParam(args)
  const request = buildApplyRequest(review)
  if (!isProjectLayerProposalTarget(review) && !isProductionProposalTarget(review)) {
    return {
      performed: false,
      skippedReason: 'backend apply preview is only implemented for proposal drafts',
    }
  }
  const path = request.path.replace(/\/apply$/, '/apply-preview')
  const response = await backendPost(path, request.payload, args.userId)
  return {
    performed: true,
    method: request.method,
    url: `${getMCPAPIBaseURL()}${path}`,
    payload: request.payload,
    response,
  }
}

import { backendPatch, backendPost, getMCPAPIBaseURL } from '../backendClient'
import {
  buildApplyRequest,
  getReviewParam,
  isProductionWorkspaceTarget,
  isProjectLayerWorkspaceTarget,
} from './request'

export async function applyWorkspaceReview(args: Record<string, unknown>): Promise<unknown> {
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

export async function previewApplyWorkspaceReview(args: Record<string, unknown>): Promise<unknown> {
  const review = getReviewParam(args)
  const request = buildApplyRequest(review)
  if (!isProjectLayerWorkspaceTarget(review) && !isProductionWorkspaceTarget(review)) {
    return {
      performed: false,
      skippedReason: 'backend apply preview is only implemented for workspace workspaces',
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

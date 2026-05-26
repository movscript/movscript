import { isRecord } from '../valueUtils'
import type { DraftReviewApplyRequest } from './types'
import { getObjectValue } from './utils'
import {
  isProductionProposalTarget,
  resolveProposalProjectId,
} from './proposalTargets'

export { isProductionProposalTarget } from './proposalTargets'

export function buildProductionProposalRequest(review: Record<string, unknown>): DraftReviewApplyRequest {
  const projectId = resolveProposalProjectId(review)
  const target = getObjectValue(review.target, 'target')
  return {
    method: 'POST',
    path: `/projects/${encodeURIComponent(String(projectId))}/entities/production-proposals/apply`,
    payload: normalizeProductionProposalPayload(review.proposedValue, target.entityId),
  }
}

function normalizeProductionProposalPayload(value: unknown, fallbackProductionId: unknown): Record<string, unknown> {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('production proposal draft content must be a JSON object')
    }
  }
  if (!isRecord(parsed)) {
    throw new Error('production proposal draft content must be a JSON object')
  }
  const productionId = parsed.production_id ?? parsed.productionId ?? fallbackProductionId
  if ((typeof productionId !== 'string' && typeof productionId !== 'number') || String(productionId).trim() === '') {
    throw new Error('production proposal draft content requires productionId')
  }
  if (!isRecord(parsed.proposal)) {
    throw new Error('production proposal draft content requires proposal')
  }
  if (parsed.mode !== 'snapshot') {
    throw new Error('production proposal draft content requires mode "snapshot"')
  }
  if (containsActionField(parsed.proposal)) {
    throw new Error('production proposal snapshot must not include action fields')
  }
  return {
    ...parsed,
    production_id: productionId,
    proposal_scope: parsed.proposal_scope ?? parsed.proposalScope ?? 'production',
  }
}

function containsActionField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsActionField)
  if (!isRecord(value)) return false
  if (Object.prototype.hasOwnProperty.call(value, 'action')) return true
  return Object.values(value).some(containsActionField)
}

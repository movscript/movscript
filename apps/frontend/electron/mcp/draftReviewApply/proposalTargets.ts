import { isRecord } from '../valueUtils'
import { getObjectValue } from './utils'

export function isProjectLayerProposalTarget(review: Record<string, unknown>): boolean {
  const target = isRecord(review.target) ? review.target : {}
  return target.entityType === 'project' && target.field === 'proposal'
}

export function isProductionProposalTarget(review: Record<string, unknown>): boolean {
  const target = isRecord(review.target) ? review.target : {}
  return review.draftKind === 'production_proposal' || target.entityType === 'production'
}

export function resolveProposalProjectId(
  review: Record<string, unknown>,
  input: { allowProjectEntityFallback?: boolean } = {},
): string | number {
  const target = getObjectValue(review.target, 'target')
  const candidate = target.projectId ?? (input.allowProjectEntityFallback ? target.entityId : undefined)
  if ((typeof candidate !== 'string' && typeof candidate !== 'number') || String(candidate).trim() === '') {
    throw new Error('apply_draft requires projectId for proposal apply')
  }
  return candidate
}

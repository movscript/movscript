import { isRecord } from '../valueUtils'
import { getObjectValue } from './utils'

export function isProjectLayerWorkspaceTarget(review: Record<string, unknown>): boolean {
  const target = isRecord(review.target) ? review.target : {}
  return target.entityType === 'project' && target.field === 'workspace'
}

export function isProductionWorkspaceTarget(review: Record<string, unknown>): boolean {
  const target = isRecord(review.target) ? review.target : {}
  return review.workspaceKind === 'production_workspace' || target.entityType === 'production'
}

export function resolveWorkspaceProjectId(
  review: Record<string, unknown>,
  input: { allowProjectEntityFallback?: boolean } = {},
): string | number {
  const target = getObjectValue(review.target, 'target')
  const candidate = target.projectId ?? (input.allowProjectEntityFallback ? target.entityId : undefined)
  if ((typeof candidate !== 'string' && typeof candidate !== 'number') || String(candidate).trim() === '') {
    throw new Error('apply_workspace requires projectId for workspace apply')
  }
  return candidate
}

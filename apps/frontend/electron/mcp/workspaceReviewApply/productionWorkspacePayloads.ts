import { isRecord } from '../valueUtils'
import type { WorkspaceReviewApplyRequest } from './types'
import { getObjectValue } from './utils'
import {
  isProductionWorkspaceTarget,
  resolveWorkspaceProjectId,
} from './workspaceTargets'

export { isProductionWorkspaceTarget } from './workspaceTargets'

export function buildProductionWorkspaceRequest(review: Record<string, unknown>): WorkspaceReviewApplyRequest {
  const projectId = resolveWorkspaceProjectId(review)
  const target = getObjectValue(review.target, 'target')
  return {
    method: 'POST',
    path: `/projects/${encodeURIComponent(String(projectId))}/entities/production-workspaces/apply`,
    payload: normalizeProductionWorkspacePayload(review.proposedValue, target.entityId),
  }
}

function normalizeProductionWorkspacePayload(value: unknown, fallbackProductionId: unknown): Record<string, unknown> {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('production workspace model content must be a JSON object')
    }
  }
  if (!isRecord(parsed)) {
    throw new Error('production workspace model content must be a JSON object')
  }
  const productionId = parsed.production_id ?? parsed.productionId ?? fallbackProductionId
  if ((typeof productionId !== 'string' && typeof productionId !== 'number') || String(productionId).trim() === '') {
    throw new Error('production workspace model content requires productionId')
  }
  if (!isRecord(parsed.workspace)) {
    throw new Error('production workspace model content requires workspace')
  }
  if (parsed.mode !== 'snapshot') {
    throw new Error('production workspace model content requires mode "snapshot"')
  }
  if (containsActionField(parsed.workspace)) {
    throw new Error('production workspace snapshot must not include action fields')
  }
  return {
    ...parsed,
    production_id: productionId,
    workspace_scope: parsed.workspace_scope ?? parsed.workspaceScope ?? 'production',
  }
}

function containsActionField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsActionField)
  if (!isRecord(value)) return false
  if (Object.prototype.hasOwnProperty.call(value, 'action')) return true
  return Object.values(value).some(containsActionField)
}

import { getMCPContextSnapshot } from '../context/store'
import { isRecord } from '../valueUtils'
import type { WorkspaceSeedMode } from '../../../src/shared/domain/workspaceDomainModel'
import type { AgentWorkspaceKind } from '../../../src/shared/contracts/agentWorkspace'

export function normalizeWorkspaceModelKind(value: string): AgentWorkspaceKind {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  switch (normalized) {
  case 'setting_workspace':
  case 'setting_edit':
  case 'setting':
    return 'setting_workspace'
  case 'project_standards_workspace':
  case 'project_standards_edit':
    return 'project_standards_workspace'
  case 'production_workspace':
  case 'production_edit':
    return 'production_workspace'
  case 'asset_workspace':
  case 'asset_edit':
    return 'asset_workspace'
  case 'content_unit_workspace':
  case 'content_unit_edit':
    return 'content_unit_workspace'
  default:
    throw new Error(`Unsupported workspace model kind: ${value}`)
  }
}

export function normalizeWorkspaceModelTarget(targetEntityType: string, value: unknown): Record<string, unknown> {
  const snapshot = getMCPContextSnapshot()
  const source = isRecord(value) ? value : {}
  const entityType = typeof source.entityType === 'string' && source.entityType.trim()
    ? source.entityType.trim()
    : targetEntityType
  const entityId = source.entityId
    ?? (targetEntityType === 'production' ? source.productionId ?? source.production_id : undefined)
    ?? (targetEntityType === 'project' ? snapshot.project?.id : undefined)
    ?? (targetEntityType === 'production' && snapshot.selection?.entityType === 'production' ? snapshot.selection.entityId : undefined)
  const out: Record<string, unknown> = {
    ...source,
    entityType,
    ...(entityId !== undefined ? { entityId } : {}),
  }
  if (targetEntityType === 'project' && snapshot.project?.id && out.projectId === undefined) {
    out.projectId = snapshot.project.id
  }
  if (targetEntityType !== 'project' && snapshot.project?.id && out.projectId === undefined) {
    out.projectId = snapshot.project.id
  }
  return out
}

export function normalizeWorkspaceSeedMode(value: unknown, fallback: WorkspaceSeedMode): WorkspaceSeedMode {
  return value === 'empty' || value === 'snapshot' || value === 'editable_snapshot'
    ? value
    : fallback
}

export function normalizeWorkspaceModelInclude(value: unknown, allowedInclude: string[]): string[] {
  if (!Array.isArray(value)) return allowedInclude
  const requested = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  const allowed = new Set(allowedInclude)
  return requested.filter((item) => allowed.has(item))
}

export function buildWorkspaceModelReviewRoute(template: string, target: Record<string, unknown>): string {
  const entityId = target.entityId !== undefined ? String(target.entityId) : ''
  return template
    .replace(/:targetEntityId/g, encodeURIComponent(entityId))
    .replace(/:workspaceId/g, ':workspaceId')
}

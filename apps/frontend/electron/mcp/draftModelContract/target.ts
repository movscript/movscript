import { getMCPContextSnapshot } from '../context/store'
import { isRecord } from '../valueUtils'
import type { DraftSeedMode } from '../../../src/shared/domain/draftDomainModel'
import type { AgentDraftKind } from '../../../src/shared/contracts/agentDraft'

export function normalizeDraftModelKind(value: string): AgentDraftKind {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  switch (normalized) {
  case 'setting_proposal':
  case 'setting':
    return 'setting_proposal'
  case 'project_standards_proposal':
    return 'project_standards_proposal'
  case 'production_proposal':
    return 'production_proposal'
  case 'asset_proposal':
    return 'asset_proposal'
  case 'content_unit_proposal':
    return 'content_unit_proposal'
  default:
    throw new Error(`Unsupported draft model kind: ${value}`)
  }
}

export function normalizeDraftModelTarget(targetEntityType: string, value: unknown): Record<string, unknown> {
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

export function normalizeDraftSeedMode(value: unknown, fallback: DraftSeedMode): DraftSeedMode {
  return value === 'empty' || value === 'snapshot' || value === 'editable_snapshot'
    ? value
    : fallback
}

export function normalizeDraftModelInclude(value: unknown, allowedInclude: string[]): string[] {
  if (!Array.isArray(value)) return allowedInclude
  const requested = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  const allowed = new Set(allowedInclude)
  return requested.filter((item) => allowed.has(item))
}

export function buildDraftModelReviewRoute(template: string, target: Record<string, unknown>): string {
  const entityId = target.entityId !== undefined ? String(target.entityId) : ''
  return template
    .replace(/:targetEntityId/g, encodeURIComponent(entityId))
    .replace(/:draftId/g, ':draftId')
}

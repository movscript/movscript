import { isRecord } from '../../../tools/shared/record.js'

export function summarizeWorkspaceInterpretForAgent(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return { result: value }

  const review = isRecord(value.review) ? value.review : {}
  const summary = isRecord(review.summary) ? review.summary : undefined
  const changedEntities = Array.isArray(review.changedEntities) ? review.changedEntities : []
  const semanticChanges = Array.isArray(review.semanticChanges) ? review.semanticChanges : []
  const issues = Array.isArray(review.issues) ? review.issues : []

  return {
    schema: 'movscript.workspace-interpret-refresh-agent-summary.v1',
    operation: value.operation,
    status: value.status,
    ...(summary ? { summary } : {}),
    changedEntities: changedEntities.map(summarizeChangedEntity).filter(Boolean),
    semanticChanges: semanticChanges.map(summarizeSemanticChange).filter(Boolean),
    issues: issues.map(summarizeIssue).filter(Boolean),
    fullResult: 'available in result.data',
  }
}

function summarizeChangedEntity(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const fieldChanges = Array.isArray(value.fieldChanges) ? value.fieldChanges : []
  const fields = fieldChanges
    .map((item) => isRecord(item) && typeof item.field === 'string' ? item.field : undefined)
    .filter((item): item is string => !!item)
  return {
    entityKind: value.entityKind,
    ...(value.id !== undefined ? { id: value.id } : {}),
    ...(typeof value.clientId === 'string' ? { clientId: value.clientId } : {}),
    state: value.state,
    ...(fields.length > 0 ? { fields } : {}),
  }
}

function summarizeSemanticChange(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return {
    ...(isRecord(value.entity) ? { entity: pick(value.entity, ['kind', 'id']) } : {}),
    kind: value.kind,
    businessKind: value.businessKind,
    propagation: value.propagation,
    ...(Array.isArray(value.fields) ? { fields: value.fields } : {}),
  }
}

function summarizeIssue(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return pick(value, ['severity', 'message'])
}

function pick(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (value[key] !== undefined) result[key] = value[key]
  }
  return result
}

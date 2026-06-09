import { getOptionalNumeric, numericValue } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'

export function resolveToolProjectId(args: Record<string, unknown>): number {
  const projectId = getOptionalNumeric(args, 'projectId') ?? getOptionalNumeric(args, 'project_id')
  if (!projectId) throw new Error('projectId is required for MovScript project-scoped MCP tools')
  return projectId
}

export function entityId(item: unknown): number | undefined {
  return numericValue(isRecord(item) ? item.ID ?? item.id : undefined)
}

import { getMCPContextSnapshot } from '../context/store'
import { getOptionalNumeric, numericValue } from './params'
import { isRecord } from './record'

export function resolveToolProjectId(args: Record<string, unknown>): number {
  const projectId = getOptionalNumeric(args, 'projectId') ?? getOptionalNumeric(args, 'project_id') ?? getMCPContextSnapshot().project?.id
  if (!projectId) throw new Error('projectId is required when no current project is selected')
  return projectId
}

export function entityId(item: unknown): number | undefined {
  return numericValue(isRecord(item) ? item.ID ?? item.id : undefined)
}

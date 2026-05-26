import { getRequiredPositiveIntegerAliasParams } from './candidateParams'
import { getOptionalNumeric, getOptionalString } from './utils'

export const RESOURCE_ID_ALIASES = [
  'resource_id',
  'resourceId',
  'output_resource_id',
  'outputResourceId',
  'resource_ids',
  'resourceIds',
  'output_resource_ids',
  'outputResourceIds',
]

export interface CandidateAttachSource {
  sourceType: string
  sourceId?: number
  sourceJobId?: number
}

export function getRequiredCandidateResourceIds(args: Record<string, unknown>): number[] {
  return getRequiredPositiveIntegerAliasParams(args, RESOURCE_ID_ALIASES, 'resource_id')
}

export function resolveCandidateAttachSource(args: Record<string, unknown>, options: { includeSourceJobId?: boolean } = {}): CandidateAttachSource {
  const sourceType = getOptionalString(args, 'source_type') ?? getOptionalString(args, 'sourceType') ?? 'agent'
  const sourceId = getOptionalNumeric(args, 'source_id') ?? getOptionalNumeric(args, 'sourceId') ?? getOptionalNumeric(args, 'jobId')
  const sourceJobId = options.includeSourceJobId
    ? getOptionalNumeric(args, 'jobId') ?? (sourceType === 'job' ? sourceId : undefined)
    : undefined
  return {
    sourceType,
    ...(sourceId ? { sourceId } : {}),
    ...(sourceJobId ? { sourceJobId } : {}),
  }
}

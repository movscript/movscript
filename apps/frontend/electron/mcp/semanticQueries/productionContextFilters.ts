import { isRecord } from '../valueUtils'
import { resolveToolProjectId } from './backend'
import {
  compactObject,
  getOptionalNumeric,
  getOptionalString,
  numericValue,
  parseMetadataRecord,
} from './params'

export interface ProductionContextFilters {
  projectId: number
  productionId?: number
  segmentId?: number
  sceneMomentId?: number
  contentUnitId?: number
  status?: string
  query?: string
  limit: number
  include: Set<string>
}

export function resolveProductionContextFilters(args: Record<string, unknown>, limit: number): ProductionContextFilters {
  return {
    projectId: resolveToolProjectId(args),
    productionId: getOptionalNumeric(args, 'production_id') ?? getOptionalNumeric(args, 'productionId'),
    segmentId: getOptionalNumeric(args, 'segment_id') ?? getOptionalNumeric(args, 'segmentId'),
    sceneMomentId: getOptionalNumeric(args, 'scene_moment_id') ?? getOptionalNumeric(args, 'sceneMomentId'),
    contentUnitId: getOptionalNumeric(args, 'content_unit_id') ?? getOptionalNumeric(args, 'contentUnitId'),
    status: getOptionalString(args, 'status'),
    query: getOptionalString(args, 'query'),
    limit,
    include: normalizeProductionContextInclude(args.include),
  }
}

export function productionContextFilterPayload(filters: ProductionContextFilters): Record<string, unknown> {
  return compactObject({
    production_id: filters.productionId,
    segment_id: filters.segmentId,
    scene_moment_id: filters.sceneMomentId,
    content_unit_id: filters.contentUnitId,
    status: filters.status,
    query: filters.query,
    include: Array.from(filters.include),
    limit: filters.limit,
  })
}

export function normalizeProductionContextInclude(value: unknown): Set<string> {
  const allowed = new Set(['productions', 'segments', 'scene_moments', 'content_units', 'keyframes'])
  if (!Array.isArray(value)) return defaultProductionContextInclude()
  const out = new Set(value.filter((item): item is string => typeof item === 'string' && allowed.has(item)))
  return out.size > 0 ? out : defaultProductionContextInclude()
}

export function generatedKeyframeCandidateRecord(keyframe: Record<string, unknown>): boolean {
  const metadata = parseMetadataRecord(keyframe.metadata_json)
  return metadata?.source === 'ai_generated_keyframe_candidate'
    || numericValue(metadata?.target_keyframe_id) !== undefined
}

export function productionContextRecordForeignId(item: unknown, snakeKey: string, camelKey: string): number | undefined {
  return numericValue(isRecord(item) ? item[snakeKey] ?? item[camelKey] : undefined)
}

function defaultProductionContextInclude(): Set<string> {
  return new Set(['segments', 'scene_moments', 'content_units'])
}

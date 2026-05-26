import { backendPost } from '../backendClient'
import { isRecord } from '../valueUtils'
import { backendList, withQuery } from './backend'
import {
  generatedKeyframeCandidateRecord,
  productionContextFilterPayload,
  productionContextRecordForeignId,
  resolveProductionContextFilters,
} from './productionContextFilters'
import {
  entityId,
  getOptionalString,
  limitItems,
  normalizeListLimit,
  recordMatchesQuery,
} from './params'
import { summarizeProductionContextEntity } from './summaries'

export async function queryProductionContext(args: Record<string, unknown>): Promise<unknown> {
  const limit = normalizeListLimit(args.limit, 50, 200)
  const filters = resolveProductionContextFilters(args, limit)

  const result: Record<string, unknown> = {
    projectId: filters.projectId,
    kind: 'production_context',
    filters: productionContextFilterPayload(filters),
  }

  let segments: unknown[] = []
  let sceneMoments: unknown[] = []
  if (filters.include.has('productions')) {
    const productions = await backendList(withQuery(`/projects/${filters.projectId}/entities/productions`, { status: filters.status }))
    result.productions = limitItems(productions.filter((item) => {
      if (filters.productionId !== undefined && entityId(item) !== filters.productionId) return false
      if (filters.query && !recordMatchesQuery(item, filters.query, ['name', 'description', 'source_type', 'owner_label', 'metadata_json'])) return false
      return true
    }), filters.limit).map(summarizeProductionContextEntity)
  }
  if (filters.include.has('segments') || filters.include.has('scene_moments')) {
    segments = await backendList(withQuery(`/projects/${filters.projectId}/entities/segments`, {
      production_id: filters.productionId,
      status: filters.status,
    }))
  }
  if (filters.include.has('segments')) {
    result.segments = limitItems(segments.filter((item) => {
      if (filters.segmentId !== undefined && entityId(item) !== filters.segmentId) return false
      if (filters.query && !recordMatchesQuery(item, filters.query, ['title', 'kind', 'summary', 'content', 'metadata_json'])) return false
      return true
    }), filters.limit).map(summarizeProductionContextEntity)
  }
  if (filters.include.has('scene_moments') || filters.include.has('content_units')) {
    const segmentIds = new Set(segments
      .map(entityId)
      .filter((id): id is number => id !== undefined))
    sceneMoments = await backendList(withQuery(`/projects/${filters.projectId}/entities/scene-moments`, { segment_id: filters.segmentId }))
    if (filters.productionId !== undefined && segmentIds.size > 0) {
      sceneMoments = sceneMoments.filter((item) => segmentIds.has(productionContextRecordForeignId(item, 'segment_id', 'segmentId') ?? -1))
    }
  }
  if (filters.include.has('scene_moments')) {
    result.scene_moments = limitItems(sceneMoments.filter((item) => {
      if (filters.sceneMomentId !== undefined && entityId(item) !== filters.sceneMomentId) return false
      if (filters.query && !recordMatchesQuery(item, filters.query, ['title', 'description', 'time_text', 'location_text', 'condition_text', 'action_text', 'mood', 'metadata_json'])) return false
      return true
    }), filters.limit).map(summarizeProductionContextEntity)
  }
  if (filters.include.has('content_units')) {
    const contentUnits = await backendList(withQuery(`/projects/${filters.projectId}/entities/content-units`, {
      production_id: filters.productionId,
      segment_id: filters.segmentId,
      scene_moment_id: filters.sceneMomentId,
    }))
    result.content_units = limitItems(contentUnits.filter((item) => {
      if (filters.contentUnitId !== undefined && entityId(item) !== filters.contentUnitId) return false
      if (filters.query && !recordMatchesQuery(item, filters.query, ['title', 'kind', 'description', 'prompt', 'camera_notes', 'metadata_json'])) return false
      return true
    }), filters.limit).map(summarizeProductionContextEntity)
  }
  if (filters.include.has('keyframes')) {
    const keyframes = await backendList(withQuery(`/projects/${filters.projectId}/entities/keyframes`, {
      production_id: filters.productionId,
      scene_moment_id: filters.sceneMomentId,
      content_unit_id: filters.contentUnitId,
      status: filters.status,
    }))
    const segmentContentUnitIds = filters.segmentId !== undefined && filters.contentUnitId === undefined && filters.sceneMomentId === undefined
      ? new Set((await backendList(withQuery(`/projects/${filters.projectId}/entities/content-units`, { segment_id: filters.segmentId })))
        .map(entityId)
        .filter((id): id is number => id !== undefined))
      : undefined
    result.keyframes = limitItems(keyframes.filter((item) => {
      if (!isRecord(item)) return false
      if (generatedKeyframeCandidateRecord(item)) return false
      if (filters.contentUnitId !== undefined && productionContextRecordForeignId(item, 'content_unit_id', 'contentUnitId') !== filters.contentUnitId) return false
      if (filters.sceneMomentId !== undefined && productionContextRecordForeignId(item, 'scene_moment_id', 'sceneMomentId') !== filters.sceneMomentId) return false
      if (filters.productionId !== undefined && productionContextRecordForeignId(item, 'production_id', 'productionId') !== filters.productionId) return false
      if (segmentContentUnitIds && !segmentContentUnitIds.has(productionContextRecordForeignId(item, 'content_unit_id', 'contentUnitId') ?? -1)) return false
      if (filters.query && !recordMatchesQuery(item, filters.query, ['title', 'description', 'prompt', 'metadata_json'])) return false
      return true
    }), filters.limit).map(summarizeProductionContextEntity)
  }
  if ((args.include_generation_context === true || args.includeGenerationContext === true) && filters.contentUnitId !== undefined) {
    result.generation_context = await backendPost(
      `/projects/${filters.projectId}/entities/content-units/${filters.contentUnitId}/generation-context`,
      { target_type: 'content_unit', target_id: filters.contentUnitId, intent: getOptionalString(args, 'intent') ?? 'video' },
    )
  }

  return result
}

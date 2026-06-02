import {
  summarizeEntity,
  summarizeScriptVersion,
} from './seedSummaries'
import { backendList, numericValue, textOrUndefined, truncateLongText } from './utils'

export async function resolveWorkspaceSeedProductionId(
  projectId: number,
  target: { sceneMomentId?: number; contentUnitId?: number },
): Promise<number | undefined> {
  let sceneMomentId = target.sceneMomentId
  if (!sceneMomentId && target.contentUnitId) {
    const units = await backendList(`/projects/${projectId}/entities/content-units`)
    const unit = units.find((item) => numericValue(item?.ID ?? item?.id) === target.contentUnitId)
    const directProductionId = numericValue(unit?.production_id ?? unit?.productionId)
    if (directProductionId) return directProductionId
    sceneMomentId = numericValue(unit?.scene_moment_id ?? unit?.sceneMomentId)
  }
  if (!sceneMomentId) return undefined

  const moments = await backendList(`/projects/${projectId}/entities/scene-moments`)
  const moment = moments.find((item) => numericValue(item?.ID ?? item?.id) === sceneMomentId)
  const directProductionId = numericValue(moment?.production_id ?? moment?.productionId)
  if (directProductionId) return directProductionId

  const segmentId = numericValue(moment?.segment_id ?? moment?.segmentId)
  if (!segmentId) return undefined
  const segments = await backendList(`/projects/${projectId}/entities/segments`)
  const segment = segments.find((item) => numericValue(item?.ID ?? item?.id) === segmentId)
  return numericValue(segment?.production_id ?? segment?.productionId)
}

export async function hydrateProductionScriptBrief(projectId: number, productionId: number): Promise<unknown> {
  const productions = await backendList(`/projects/${projectId}/entities/productions`)
  const production = productions.find((item) => numericValue(item?.ID ?? item?.id) === productionId)
  if (!production || typeof production !== 'object') {
    return {
      productionId,
      warning: 'Production not found while hydrating production_script_brief.',
    }
  }

  const scriptVersionId = numericValue(production.script_version_id ?? production.scriptVersionId)
  const productionSummary = summarizeEntity(production)
  if (!scriptVersionId) {
    return {
      production: productionSummary,
      brief: textOrUndefined(production.description) ?? textOrUndefined(production.summary) ?? '',
      sourceType: production.source_type,
      warning: 'Production has no linked script_version_id; using production brief fields only.',
    }
  }

  const scriptVersions = await backendList(`/projects/${projectId}/entities/script-versions`)
  const scriptVersion = scriptVersions.find((item) => numericValue(item?.ID ?? item?.id) === scriptVersionId)
  const body = textOrUndefined(scriptVersion?.content) ?? textOrUndefined(scriptVersion?.raw_source) ?? ''
  return {
    production: productionSummary,
    scriptVersion: summarizeScriptVersion(scriptVersion),
    brief: textOrUndefined(production.description) ?? textOrUndefined(scriptVersion?.summary) ?? '',
    scriptVersionId,
    scriptVersionTitle: textOrUndefined(scriptVersion?.title),
    scriptVersionUpdatedAt: textOrUndefined(scriptVersion?.UpdatedAt ?? scriptVersion?.updatedAt),
    body_length: body.length,
    body_excerpt: body ? truncateLongText(body.slice(0, 4000)) : '',
    body_excerpt_truncated: body.length > 4000,
  }
}

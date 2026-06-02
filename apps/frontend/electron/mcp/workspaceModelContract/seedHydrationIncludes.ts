import { backendGet } from '../backendClient'
import type { AgentWorkspaceKind } from '../../../src/shared/contracts/agentWorkspace'
import type { WorkspaceSeedTargetIds } from './types'
import {
  activeWorkspaceSeedAssetSlots,
  activeWorkspaceSeedCreativeReferences,
  summarizeAssetSlotOwnership,
  summarizeProjectScripts,
  summarizeSeedValue,
} from './seedSummaries'
import {
  hydrateProductionScriptBrief,
  resolveWorkspaceSeedProductionId,
} from './seedProduction'
import { backendList, numericValue } from './utils'

export async function hydrateWorkspaceSeedInclude(kind: AgentWorkspaceKind, projectId: number, targetIds: WorkspaceSeedTargetIds, include: string): Promise<unknown> {
  const entityId = targetIds.entityId
  const sceneMomentId = targetIds.sceneMomentId ?? (kind === 'content_unit_workspace' ? entityId : undefined)
  const contentUnitId = targetIds.contentUnitId
  const productionId = targetIds.productionId
    ?? (kind === 'production_workspace' ? entityId : undefined)
    ?? await resolveWorkspaceSeedProductionId(projectId, { sceneMomentId, contentUnitId })
  switch (include) {
    case 'project':
      return summarizeSeedValue(await backendGet(`/projects/${projectId}`))
    case 'creative_references':
      return summarizeSeedValue(activeWorkspaceSeedCreativeReferences(await backendList(`/projects/${projectId}/entities/creative-references`)))
    case 'asset_slot_ownership':
      return summarizeAssetSlotOwnership(activeWorkspaceSeedAssetSlots(await backendList(assetSlotSeedPath(projectId))))
    case 'production': {
      if (!productionId) return undefined
      const productions = await backendList(`/projects/${projectId}/entities/productions`)
      return summarizeSeedValue(productions.find((production) => numericValue(production?.ID ?? production?.id) === productionId) ?? null)
    }
    case 'production_script_brief': {
      if (!productionId) return undefined
      return hydrateProductionScriptBrief(projectId, productionId)
    }
    case 'segments': {
      const segments = await backendList(`/projects/${projectId}/entities/segments`)
      return summarizeSeedValue(productionId
        ? segments.filter((segment) => numericValue(segment?.production_id ?? segment?.productionId) === productionId)
        : segments)
    }
    case 'scene_moments': {
      const segments = await backendList(`/projects/${projectId}/entities/segments`)
      const segmentIds = new Set(segments
        .filter((segment) => !productionId || numericValue(segment?.production_id ?? segment?.productionId) === productionId)
        .map((segment) => numericValue(segment?.ID ?? segment?.id))
        .filter((id): id is number => id !== undefined))
      const moments = await backendList(`/projects/${projectId}/entities/scene-moments`)
      return summarizeSeedValue(sceneMomentId
        ? moments.filter((moment) => numericValue(moment?.ID ?? moment?.id) === sceneMomentId)
        : productionId
          ? moments.filter((moment) => segmentIds.has(numericValue(moment?.segment_id ?? moment?.segmentId) ?? -1))
          : moments)
    }
    case 'content_units': {
      const units = await backendList(`/projects/${projectId}/entities/content-units`)
      return summarizeSeedValue(contentUnitId
        ? units.filter((unit) => numericValue(unit?.ID ?? unit?.id) === contentUnitId)
        : sceneMomentId
          ? units.filter((unit) => numericValue(unit?.scene_moment_id ?? unit?.sceneMomentId) === sceneMomentId)
          : productionId
            ? units.filter((unit) => numericValue(unit?.production_id ?? unit?.productionId) === productionId)
            : units)
    }
    case 'content_unit': {
      if (!contentUnitId) return undefined
      const units = await backendList(`/projects/${projectId}/entities/content-units`)
      return summarizeSeedValue(units.find((unit) => numericValue(unit?.ID ?? unit?.id) === contentUnitId) ?? null)
    }
    case 'reference_resources':
      return summarizeSeedValue(contentUnitId
        ? await backendList(`/projects/${projectId}/resources?ref_type=content_unit&ref_id=${encodeURIComponent(String(contentUnitId))}`)
        : await backendList(`/projects/${projectId}/resources`))
    case 'asset_slots': {
      const slots = activeWorkspaceSeedAssetSlots(await backendList(assetSlotSeedPath(projectId)))
      return summarizeSeedValue(contentUnitId
        ? slots.filter((slot) => slot.owner_type === 'content_unit' && numericValue(slot.owner_id) === contentUnitId)
        : sceneMomentId
          ? slots.filter((slot) => slot.owner_type === 'scene_moment' && numericValue(slot.owner_id) === sceneMomentId)
          : productionId
            ? slots.filter((slot) => numericValue(slot.production_id ?? slot.productionId) === productionId)
            : slots)
    }
    case 'asset_slot_usages':
      return summarizeAssetSlotOwnership(activeWorkspaceSeedAssetSlots(await backendList(assetSlotSeedPath(projectId))))
    case 'creative_reference_usages':
      return summarizeSeedValue(await backendList(`/projects/${projectId}/entities/creative-reference-usages`))
    case 'asset_slot': {
      if (!entityId) return undefined
      const slots = activeWorkspaceSeedAssetSlots(await backendList(assetSlotSeedPath(projectId)))
      return summarizeSeedValue(slots.find((slot) => numericValue(slot?.ID ?? slot?.id) === entityId) ?? null)
    }
    case 'asset_need':
    case 'unresolved_requirements':
    case 'source_script':
    case 'project_scripts':
      return summarizeProjectScripts(await backendList(`/projects/${projectId}/scripts`))
    case 'productions':
      return summarizeSeedValue(await hydrateWorkspaceKnownFallback(projectId, include))
    default:
      return undefined
  }
}

function assetSlotSeedPath(projectId: number): string {
  return `/projects/${projectId}/entities/asset-slots?include_internal=true`
}

async function hydrateWorkspaceKnownFallback(projectId: number, include: string): Promise<unknown> {
  switch (include) {
    case 'project_scripts':
    case 'source_script':
      return backendList(`/projects/${projectId}/scripts`)
    case 'productions':
      return backendList(`/projects/${projectId}/entities/productions`)
    default:
      return null
  }
}

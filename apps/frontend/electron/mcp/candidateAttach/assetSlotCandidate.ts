import { backendPost } from '../backendClient'
import { getRequiredPositiveIntegerAliasParam } from './candidateParams'
import { isRecord } from '../valueUtils'
import { getRequiredCandidateResourceIds, resolveCandidateAttachSource } from './params'
import {
  backendList,
  getOptionalNumeric,
  getOptionalString,
  numericValue,
  resolveToolProjectId,
  resourceAttachMessage,
} from './utils'

export async function attachAssetSlotCandidate(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const assetSlotIdAliases = ['asset_slot_id', 'assetSlotId']
  const assetSlotId = getRequiredPositiveIntegerAliasParam(args, assetSlotIdAliases, 'asset_slot_id')
  const resourceIds = getRequiredCandidateResourceIds(args)

  const source = resolveCandidateAttachSource(args)
  const score = getOptionalNumeric(args, 'score')
  const note = getOptionalString(args, 'note')
  const existingResourceIds = await existingAssetSlotCandidateResourceIds(projectId, assetSlotId)
  const resourceIdsToAttach = resourceIds.filter((resourceId) => !existingResourceIds.has(resourceId))
  const skippedResourceIds = resourceIds.filter((resourceId) => existingResourceIds.has(resourceId))
  const candidates = []
  for (const resourceId of resourceIdsToAttach) {
    candidates.push(await backendPost(`/projects/${projectId}/entities/asset-slot-candidates`, {
      asset_slot_id: assetSlotId,
      resource_id: resourceId,
      source_type: source.sourceType,
      ...(source.sourceId ? { source_id: source.sourceId } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(note ? { note } : {}),
    }))
  }
  const candidate = candidates[0]
  const candidateAssetSlotIds = candidates
    .map((item) => numericValue(isRecord(item) ? item.candidate_asset_slot_id ?? item.candidateAssetSlotId : undefined))
    .filter((id): id is number => id !== undefined)
  const candidateAssetSlotId = candidateAssetSlotIds[0]
  const resourceId = resourceIdsToAttach[0] ?? resourceIds[0]

  return {
    status: 'attached',
    candidate: candidate ?? {},
    candidates,
    asset_slot_id: assetSlotId,
    ...(candidateAssetSlotId ? { candidate_asset_slot_id: candidateAssetSlotId } : {}),
    ...(candidateAssetSlotIds.length > 0 ? { candidate_asset_slot_ids: candidateAssetSlotIds } : {}),
    resource_id: resourceId,
    resource_ids: resourceIds,
    ...(skippedResourceIds.length > 0 ? { skipped_resource_ids: skippedResourceIds } : {}),
    message: resourceAttachMessage({
      resourceIds,
      attachedResourceIds: resourceIdsToAttach,
      skippedResourceIds,
      targetLabel: `素材位 #${assetSlotId}`,
    }),
  }
}

async function existingAssetSlotCandidateResourceIds(projectId: number, assetSlotId: number): Promise<Set<number>> {
  try {
    const candidates = await backendList(`/projects/${projectId}/entities/asset-slot-candidates`)
    return new Set(candidates.flatMap((candidate) => {
      if (!isRecord(candidate) || numericValue(candidate.asset_slot_id ?? candidate.assetSlotId) !== assetSlotId) return []
      const resourceId = assetSlotCandidateResourceId(candidate)
      return resourceId ? [resourceId] : []
    }))
  } catch {
    return new Set()
  }
}

function assetSlotCandidateResourceId(candidate: Record<string, unknown>): number | undefined {
  const slot = isRecord(candidate.candidate_asset_slot) ? candidate.candidate_asset_slot : isRecord(candidate.candidateAssetSlot) ? candidate.candidateAssetSlot : undefined
  const resource = slot && isRecord(slot.resource) ? slot.resource : undefined
  return numericValue(candidate.resource_id ?? candidate.resourceId)
    ?? numericValue(slot?.resource_id ?? slot?.resourceId)
    ?? numericValue(resource?.ID ?? resource?.id)
}

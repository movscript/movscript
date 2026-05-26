import { isRecord } from '../valueUtils'
import { backendList, resolveToolProjectId, withQuery } from './backend'
import {
  compactObject,
  entityId,
  getOptionalNumeric,
  getOptionalString,
  limitItems,
  normalizedStringField,
  normalizeListLimit,
  numberSetArg,
  numericValue,
  recordMatchesQuery,
} from './params'
import {
  summarizeAssetSlot,
  summarizeAssetSlotCandidate,
} from './summaries'

export async function queryAssetSlots(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const assetSlotId = getOptionalNumeric(args, 'asset_slot_id') ?? getOptionalNumeric(args, 'assetSlotId')
  const creativeReferenceId = getOptionalNumeric(args, 'creative_reference_id') ?? getOptionalNumeric(args, 'creativeReferenceId')
  const creativeReferenceStateId = getOptionalNumeric(args, 'creative_reference_state_id') ?? getOptionalNumeric(args, 'creativeReferenceStateId')
  const ownerType = getOptionalString(args, 'owner_type') ?? getOptionalString(args, 'ownerType')
  const ownerId = getOptionalNumeric(args, 'owner_id') ?? getOptionalNumeric(args, 'ownerId')
  const productionId = getOptionalNumeric(args, 'production_id') ?? getOptionalNumeric(args, 'productionId')
  const status = getOptionalString(args, 'status')
  const query = getOptionalString(args, 'query')
  const includeInternal = args.include_internal === true || args.includeInternal === true
  const includeCandidates = args.include_candidates === true || args.includeCandidates === true
  const limit = normalizeListLimit(args.limit, 50, 200)
  const referenceIds = numberSetArg(args._creativeReferenceIds, creativeReferenceId)
  const stateIds = numberSetArg(args._creativeReferenceStateIds, creativeReferenceStateId)

  const path = withQuery(`/projects/${projectId}/entities/asset-slots`, {
    production_id: productionId,
    status,
    owner_type: ownerType,
    include_internal: includeInternal ? 'true' : undefined,
  })
  const rawSlots = await backendList(path)
  const matchedSlots = rawSlots.filter((slot) => {
    if (assetSlotId !== undefined && entityId(slot) !== assetSlotId) return false
    const slotOwnerType = normalizedStringField(slot, 'owner_type') ?? normalizedStringField(slot, 'ownerType')
    const slotOwnerId = numericValue(isRecord(slot) ? slot.owner_id ?? slot.ownerId : undefined)
    if (ownerId !== undefined && slotOwnerId !== ownerId) return false
    if (referenceIds.size > 0) {
      const directReferenceId = numericValue(isRecord(slot) ? slot.creative_reference_id ?? slot.creativeReferenceId : undefined)
      const ownerReferenceId = slotOwnerType === 'creative_reference' ? slotOwnerId : undefined
      const directStateId = numericValue(isRecord(slot) ? slot.creative_reference_state_id ?? slot.creativeReferenceStateId : undefined)
      const ownerStateId = slotOwnerType === 'creative_reference_state' ? slotOwnerId : undefined
      const matchesReference = referenceIds.has(directReferenceId ?? -1) || referenceIds.has(ownerReferenceId ?? -1)
      const matchesState = stateIds.size > 0 && (stateIds.has(directStateId ?? -1) || stateIds.has(ownerStateId ?? -1))
      if (!matchesReference && !matchesState) return false
    }
    if (stateIds.size > 0) {
      const directStateId = numericValue(isRecord(slot) ? slot.creative_reference_state_id ?? slot.creativeReferenceStateId : undefined)
      const ownerStateId = slotOwnerType === 'creative_reference_state' ? slotOwnerId : undefined
      const directReferenceId = numericValue(isRecord(slot) ? slot.creative_reference_id ?? slot.creativeReferenceId : undefined)
      const ownerReferenceId = slotOwnerType === 'creative_reference' ? slotOwnerId : undefined
      const matchesState = stateIds.has(directStateId ?? -1) || stateIds.has(ownerStateId ?? -1)
      const matchesReference = referenceIds.size > 0 && (referenceIds.has(directReferenceId ?? -1) || referenceIds.has(ownerReferenceId ?? -1))
      if (!matchesState && !matchesReference) return false
    }
    if (query && !recordMatchesQuery(slot, query, ['name', 'description', 'prompt_hint', 'slot_key', 'metadata_json'])) return false
    return true
  })
  const slots = limitItems(matchedSlots, limit)

  const candidates = includeCandidates
    ? await queryAssetSlotCandidates(projectId, slots)
    : []

  return {
    projectId,
    kind: 'asset_slots',
    filters: compactObject({
      asset_slot_id: assetSlotId,
      creative_reference_id: creativeReferenceId,
      creative_reference_state_id: creativeReferenceStateId,
      owner_type: ownerType,
      owner_id: ownerId,
      production_id: productionId,
      status,
      query,
      include_internal: includeInternal,
      include_candidates: includeCandidates,
      limit,
    }),
    count: matchedSlots.length,
    total_count: rawSlots.length,
    returned: slots.length,
    ...(rawSlots.length > 0 && matchedSlots.length === 0 ? { note: 'Filters matched no asset slots. count is the filtered match count; total_count is the unfiltered backend count.' } : {}),
    asset_slots: slots.map(summarizeAssetSlot),
    ...(includeCandidates ? { candidates: candidates.map(summarizeAssetSlotCandidate) } : {}),
  }
}

async function queryAssetSlotCandidates(projectId: number, slots: unknown[]): Promise<unknown[]> {
  const out: unknown[] = []
  for (const slot of slots) {
    const id = entityId(slot)
    if (id === undefined) continue
    out.push(...await backendList(`/projects/${projectId}/entities/asset-slot-candidates?asset_slot_id=${encodeURIComponent(String(id))}`))
  }
  return out
}

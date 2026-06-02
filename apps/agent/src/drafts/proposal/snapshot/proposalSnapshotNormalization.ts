import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import type { JSONValue } from '../../../state/shared/types.js'

export function normalizeSettingProposalSnapshotReferences(value: JSONValue[]): JSONValue[] {
  return value.map((item) => {
    if (!isJSONRecord(item)) return item
    const normalized: Record<string, JSONValue> = {}
    setNormalizedField(normalized, 'client_id', normalizedString(item.client_id) ?? normalizedString(item.proposal_client_id) ?? normalizedString(item.ClientID) ?? normalizedString(item.ProposalClientID))
    setNormalizedField(normalized, 'id', normalizedNumber(item.id) ?? normalizedNumber(item.ID))
    setNormalizedField(normalized, 'merge_candidates', Array.isArray(item.merge_candidates) ? item.merge_candidates : undefined)
    setNormalizedField(normalized, 'source_script_id', normalizedNumber(item.source_script_id) ?? normalizedNumber(item.SourceScriptID))
    setNormalizedField(normalized, 'source_analysis_id', normalizedNumber(item.source_analysis_id) ?? normalizedNumber(item.SourceAnalysisID))
    setNormalizedField(normalized, 'kind', normalizedString(item.kind) ?? normalizedString(item.Kind))
    setNormalizedField(normalized, 'name', normalizedString(item.name) ?? normalizedString(item.Name))
    setNormalizedField(normalized, 'alias', normalizedString(item.alias) ?? normalizedString(item.Alias))
    setNormalizedField(normalized, 'description', normalizedString(item.description) ?? normalizedString(item.Description))
    setNormalizedField(normalized, 'content', normalizedString(item.content) ?? normalizedString(item.Content))
    setNormalizedField(normalized, 'importance', normalizedString(item.importance) ?? normalizedString(item.Importance))
    setNormalizedField(normalized, 'status', normalizedString(item.status) ?? normalizedString(item.Status))
    setNormalizedField(normalized, 'profile_json', normalizedString(item.profile_json) ?? normalizedString(item.ProfileJSON))
    setNormalizedField(normalized, 'tags_json', normalizedString(item.tags_json) ?? normalizedString(item.TagsJSON))
    return normalized
  })
}

export function normalizeAssetProposalSnapshotSlots(value: JSONValue[]): JSONValue[] {
  return value.map(normalizeAssetProposalSnapshotSlot)
}

export function normalizeAssetProposalSnapshotSlot(item: JSONValue): JSONValue {
  if (!isJSONRecord(item)) return item
  const normalized: Record<string, JSONValue> = {}
  setNormalizedField(normalized, 'client_id', normalizedString(item.client_id) ?? normalizedString(item.ClientID) ?? normalizedString(item.proposal_client_id) ?? normalizedString(item.ProposalClientID))
  setNormalizedField(normalized, 'id', normalizedNumber(item.id) ?? normalizedNumber(item.ID))
  setNormalizedOwner(normalized, item.owner)
  setNormalizedField(normalized, 'production_id', normalizedNumber(item.production_id) ?? normalizedNumber(item.ProductionID))
  setNormalizedField(normalized, 'creative_reference_id', normalizedNumber(item.creative_reference_id) ?? normalizedNumber(item.CreativeReferenceID))
  setNormalizedField(normalized, 'creative_reference_state_id', normalizedNumber(item.creative_reference_state_id) ?? normalizedNumber(item.CreativeReferenceStateID))
  setNormalizedField(normalized, 'owner_type', normalizedString(item.owner_type) ?? normalizedString(item.OwnerType))
  setNormalizedField(normalized, 'owner_id', normalizedNumber(item.owner_id) ?? normalizedNumber(item.OwnerID))
  setNormalizedField(normalized, 'kind', normalizedString(item.kind) ?? normalizedString(item.Kind))
  setNormalizedField(normalized, 'name', normalizedString(item.name) ?? normalizedString(item.Name))
  setNormalizedField(normalized, 'description', normalizedString(item.description) ?? normalizedString(item.Description))
  setNormalizedField(normalized, 'slot_key', normalizedString(item.slot_key) ?? normalizedString(item.SlotKey))
  setNormalizedField(normalized, 'prompt_hint', normalizedString(item.prompt_hint) ?? normalizedString(item.PromptHint))
  setNormalizedField(normalized, 'priority', normalizedString(item.priority) ?? normalizedString(item.Priority))
  setNormalizedField(normalized, 'status', normalizedString(item.status) ?? normalizedString(item.Status))
  setNormalizedField(normalized, 'resource_id', normalizedNumber(item.resource_id) ?? normalizedNumber(item.ResourceID))
  setNormalizedField(normalized, 'locked_asset_slot_id', normalizedNumber(item.locked_asset_slot_id) ?? normalizedNumber(item.LockedAssetSlotID))
  setNormalizedField(normalized, 'metadata_json', normalizedString(item.metadata_json) ?? normalizedString(item.MetadataJSON))
  return normalized
}

export function normalizedNumber(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function setNormalizedOwner(out: Record<string, JSONValue>, value: JSONValue | undefined): void {
  if (!isJSONRecord(value)) return
  const owner: Record<string, JSONValue> = {}
  setNormalizedField(owner, 'type', normalizedString(value.type) ?? normalizedString(value.Type))
  setNormalizedField(owner, 'id', normalizedNumber(value.id) ?? normalizedNumber(value.ID))
  setNormalizedField(owner, 'client_id', normalizedString(value.client_id) ?? normalizedString(value.ClientID) ?? normalizedString(value.proposal_client_id) ?? normalizedString(value.ProposalClientID))
  if (owner.type !== undefined) out.owner = owner
}

function setNormalizedField(out: Record<string, JSONValue>, key: string, value: JSONValue | undefined): void {
  if (value !== undefined) out[key] = value
}

function normalizedString(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

import { isRecord } from '../valueUtils'
import { summarizeResourceRecord } from './resourceSummaries'
import { summarizePickedFields } from './summaryUtils'

export function summarizeAssetSlot(item: any): unknown {
  const summary = summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'production_id',
    'owner_type',
    'owner_id',
    'creative_reference_id',
    'creative_reference_state_id',
    'kind',
    'name',
    'slot_key',
    'description',
    'prompt_hint',
    'priority',
    'resource_id',
    'locked_asset_slot_id',
    'status',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
  if (isRecord(summary) && isRecord(item?.Resource)) summary.resource = summarizeResourceRecord(item.Resource)
  if (isRecord(summary) && isRecord(item?.resource)) summary.resource = summarizeResourceRecord(item.resource)
  if (isRecord(summary) && isRecord(item?.LockedAssetSlot)) summary.locked_asset_slot = summarizeAssetSlot(item.LockedAssetSlot)
  if (isRecord(summary) && isRecord(item?.locked_asset_slot)) summary.locked_asset_slot = summarizeAssetSlot(item.locked_asset_slot)
  return summary
}

export function summarizeAssetSlotCandidate(item: any): unknown {
  const summary = summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'asset_slot_id',
    'candidate_asset_slot_id',
    'resource_id',
    'source_type',
    'source_id',
    'score',
    'status',
    'note',
    'CreatedAt',
    'UpdatedAt',
  ])
  if (isRecord(summary) && isRecord(item?.CandidateAssetSlot)) summary.candidate_asset_slot = summarizeAssetSlot(item.CandidateAssetSlot)
  if (isRecord(summary) && isRecord(item?.candidate_asset_slot)) summary.candidate_asset_slot = summarizeAssetSlot(item.candidate_asset_slot)
  return summary
}

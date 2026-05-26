import { summarizePickedFields } from './summaryUtils'

export function summarizeCreativeReference(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'kind',
    'name',
    'alias',
    'description',
    'content',
    'importance',
    'status',
    'profile_json',
    'tags_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

export function summarizeCreativeReferenceState(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'creative_reference_id',
    'scope_type',
    'scope_id',
    'name',
    'description',
    'visual_notes',
    'emotion',
    'costume',
    'props',
    'status',
    'tags_json',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

export function summarizeCreativeReferenceUsage(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'owner_type',
    'owner_id',
    'creative_reference_id',
    'creative_reference_state_id',
    'role',
    'order',
    'evidence',
    'source',
    'status',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

export function summarizeCreativeRelationship(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'source_creative_reference_id',
    'target_creative_reference_id',
    'scope_type',
    'scope_id',
    'category',
    'type',
    'label',
    'description',
    'source',
    'status',
    'evidence',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

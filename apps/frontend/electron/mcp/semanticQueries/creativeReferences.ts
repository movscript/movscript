import { isRecord } from '../valueUtils'
import { queryAssetSlots } from './assetSlots'
import { backendList, resolveToolProjectId, withQuery } from './backend'
import {
  compactObject,
  entityId,
  getOptionalNumeric,
  getOptionalString,
  limitItems,
  normalizedStringField,
  normalizeListLimit,
  recordMatchesQuery,
} from './params'
import {
  summarizeCreativeReference,
  summarizeCreativeReferenceState,
  summarizeCreativeReferenceUsage,
  summarizeCreativeRelationship,
} from './summaries'

export async function queryCreativeReferences(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const referenceId = getOptionalNumeric(args, 'creative_reference_id') ?? getOptionalNumeric(args, 'creativeReferenceId')
  const kind = getOptionalString(args, 'kind')
  const status = getOptionalString(args, 'status')
  const query = getOptionalString(args, 'query')
  const limit = normalizeListLimit(args.limit, 50, 200)
  const path = withQuery(`/projects/${projectId}/entities/creative-references`, { kind })
  const rawReferences = await backendList(path)
  const matchedReferences = rawReferences.filter((item) => {
    if (referenceId !== undefined && entityId(item) !== referenceId) return false
    if (status && normalizedStringField(item, 'status') !== status) return false
    if (query && !recordMatchesQuery(item, query, ['name', 'alias', 'description', 'content', 'profile_json', 'tags_json'])) return false
    return true
  })
  const references = limitItems(matchedReferences, limit)
  const referenceIds = new Set(references.map(entityId).filter((id): id is number => id !== undefined))

  const includeStates = args.include_states === true || args.includeStates === true || args.include_asset_slots === true || args.includeAssetSlots === true
  const includeUsages = args.include_usages === true || args.includeUsages === true
  const includeRelationships = args.include_relationships === true || args.includeRelationships === true
  const includeAssetSlots = args.include_asset_slots === true || args.includeAssetSlots === true

  const states = includeStates
    ? await queryReferenceStates(projectId, referenceIds)
    : []
  const stateIds = new Set(states.map(entityId).filter((id): id is number => id !== undefined))
  const usages = includeUsages
    ? await queryReferenceUsages(projectId, referenceIds)
    : []
  const relationships = includeRelationships
    ? await queryReferenceRelationships(projectId, referenceIds)
    : []
  const assetSlots = includeAssetSlots
    ? await queryAssetSlots({
        projectId,
        include_internal: true,
        limit: 200,
        _creativeReferenceIds: Array.from(referenceIds),
        _creativeReferenceStateIds: Array.from(stateIds),
      })
    : undefined

  return {
    projectId,
    kind: 'creative_references',
    filters: compactObject({ creative_reference_id: referenceId, kind, status, query, limit }),
    count: matchedReferences.length,
    total_count: rawReferences.length,
    returned: references.length,
    ...(rawReferences.length > 0 && matchedReferences.length === 0 ? { note: 'Filters matched no creative references. count is the filtered match count; total_count is the unfiltered backend count.' } : {}),
    references: references.map(summarizeCreativeReference),
    ...(includeStates ? { states: states.map(summarizeCreativeReferenceState) } : {}),
    ...(includeUsages ? { usages: usages.map(summarizeCreativeReferenceUsage) } : {}),
    ...(includeRelationships ? { relationships: relationships.map(summarizeCreativeRelationship) } : {}),
    ...(includeAssetSlots && isRecord(assetSlots) ? { asset_slots: assetSlots.asset_slots } : {}),
  }
}

async function queryReferenceStates(projectId: number, referenceIds: Set<number>): Promise<unknown[]> {
  const out: unknown[] = []
  for (const id of referenceIds) {
    out.push(...await backendList(`/projects/${projectId}/entities/creative-reference-states?creative_reference_id=${encodeURIComponent(String(id))}`))
  }
  return out
}

async function queryReferenceUsages(projectId: number, referenceIds: Set<number>): Promise<unknown[]> {
  const out: unknown[] = []
  for (const id of referenceIds) {
    out.push(...await backendList(`/projects/${projectId}/entities/creative-reference-usages?creative_reference_id=${encodeURIComponent(String(id))}`))
  }
  return out
}

async function queryReferenceRelationships(projectId: number, referenceIds: Set<number>): Promise<unknown[]> {
  const seen = new Set<number>()
  const out: unknown[] = []
  for (const id of referenceIds) {
    const relationships = await backendList(`/projects/${projectId}/entities/creative-relationships?creative_reference_id=${encodeURIComponent(String(id))}`)
    for (const relationship of relationships) {
      const relationshipId = entityId(relationship)
      if (relationshipId !== undefined) {
        if (seen.has(relationshipId)) continue
        seen.add(relationshipId)
      }
      out.push(relationship)
    }
  }
  return out
}

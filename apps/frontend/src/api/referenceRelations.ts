import { api } from '@/lib/api'
import type { V2EntityRecord } from '@/api/v2Entities'

export type RelationTab = 'usage' | 'relationship'

export interface CreativeReferenceUsage extends V2EntityRecord {
  owner_type: string
  owner_id: number
  creative_reference_id: number
  creative_reference_state_id?: number | null
  role?: string
  order?: number
  evidence?: string
  source?: string
  status?: string
  metadata_json?: string
  creative_reference?: CreativeReference
  creative_reference_state?: CreativeReferenceState
}

export interface CreativeRelationship extends V2EntityRecord {
  source_creative_reference_id: number
  target_creative_reference_id: number
  scope_type?: string
  scope_id?: number | null
  category?: string
  type?: string
  label?: string
  description?: string
  source?: string
  status?: string
  evidence?: string
  metadata_json?: string
  source_creative_reference?: CreativeReference
  target_creative_reference?: CreativeReference
}

export interface CreativeReference extends V2EntityRecord {
  name: string
  kind: string
  alias?: string
  description?: string
  status?: string
}

export interface CreativeReferenceState extends V2EntityRecord {
  creative_reference_id: number
  scope_type: string
  scope_id?: number | null
  name: string
  status?: string
}

export interface UsagePayload {
  owner_type: string
  owner_id: number
  creative_reference_id: number
  creative_reference_state_id?: number | null
  role?: string
  order?: number
  evidence?: string
  source?: string
  status?: string
  metadata_json?: string
}

export interface RelationshipPayload {
  source_creative_reference_id: number
  target_creative_reference_id: number
  scope_type?: string
  scope_id?: number | null
  category?: string
  type?: string
  label?: string
  description?: string
  source?: string
  status?: string
  evidence?: string
  metadata_json?: string
}

export async function listCreativeReferences(projectId: number) {
  const { data } = await api.get<CreativeReference[]>(`/projects/${projectId}/v2/creative-references`)
  return data
}

export async function listCreativeReferenceStates(projectId: number) {
  const { data } = await api.get<CreativeReferenceState[]>(`/projects/${projectId}/v2/creative-reference-states`)
  return data
}

export async function listCreativeReferenceUsages(projectId: number) {
  const { data } = await api.get<CreativeReferenceUsage[]>(`/projects/${projectId}/v2/creative-reference-usages`)
  return data
}

export async function createCreativeReferenceUsage(projectId: number, payload: UsagePayload) {
  const { data } = await api.post<CreativeReferenceUsage>(`/projects/${projectId}/v2/creative-reference-usages`, payload)
  return data
}

export async function updateCreativeReferenceUsage(projectId: number, id: number, payload: UsagePayload) {
  const { data } = await api.patch<CreativeReferenceUsage>(`/projects/${projectId}/v2/creative-reference-usages/${id}`, payload)
  return data
}

export async function deleteCreativeReferenceUsage(projectId: number, id: number) {
  await api.delete(`/projects/${projectId}/v2/creative-reference-usages/${id}`)
}

export async function listCreativeRelationships(projectId: number) {
  const { data } = await api.get<CreativeRelationship[]>(`/projects/${projectId}/v2/creative-relationships`)
  return data
}

export async function createCreativeRelationship(projectId: number, payload: RelationshipPayload) {
  const { data } = await api.post<CreativeRelationship>(`/projects/${projectId}/v2/creative-relationships`, payload)
  return data
}

export async function updateCreativeRelationship(projectId: number, id: number, payload: RelationshipPayload) {
  const { data } = await api.patch<CreativeRelationship>(`/projects/${projectId}/v2/creative-relationships/${id}`, payload)
  return data
}

export async function deleteCreativeRelationship(projectId: number, id: number) {
  await api.delete(`/projects/${projectId}/v2/creative-relationships/${id}`)
}

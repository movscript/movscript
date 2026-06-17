import { fetchAgentBackendModels as fetchAgentBackendModelsWithClient, type AgentBackendModelCatalogClient } from '@movscript/core/agent'

import { api } from '@/shared/infrastructure/api'
import type { ParamDef, PublicModel } from '@/types'

export type AgentModelRouteSourceType = 'local_provider' | 'new_api' | 'new_api_group' | string

export type AgentModelRouteBinding = {
  id: number
  catalog_entry_id: number
  source_type: AgentModelRouteSourceType
  route_group?: string
  credential_id?: number
  is_enabled: boolean
  priority?: number
  capacity_weight?: number
  max_concurrency?: number
}

export type AgentModelCatalogEntry = {
  id: number
  public_model_id: string
  provider_model_id: string
  display_name: string
  short_name?: string
  is_enabled: boolean
  capabilities?: string
  pricing_mode?: string
  accepts_image?: boolean
  max_input_images?: number
  max_input_videos?: number
  image_edit_field?: string
  supported_params?: string
  credits_input_per_1m?: number
  credits_output_per_1m?: number
  credits_per_image?: number
  credits_per_second?: number
  credits_per_call?: number
  route_bindings?: AgentModelRouteBinding[]
}

export type AgentModelCatalogEntryInput = {
  public_model_id: string
  provider_model_id: string
  display_name: string
  short_name?: string
  is_enabled?: boolean
  capabilities: string
  pricing_mode?: string
  accepts_image?: boolean
  max_input_images?: number
  max_input_videos?: number
  image_edit_field?: string
  supported_params?: string
  credits_input_per_1m?: number
  credits_output_per_1m?: number
  credits_per_image?: number
  credits_per_second?: number
  credits_per_call?: number
}

export type AgentModelRouteBindingInput = {
  source_type: AgentModelRouteSourceType
  route_group?: string
  credential_id?: number
  is_enabled?: boolean
  priority?: number
  capacity_weight?: number
  max_concurrency?: number
}

export function fetchAgentBackendModels(
  client: AgentBackendModelCatalogClient<PublicModel> = api,
): Promise<PublicModel[]> {
  return fetchAgentBackendModelsWithClient(client)
}

export async function fetchAgentModelCatalogEntries(): Promise<AgentModelCatalogEntry[]> {
  const response = await api.get<AgentModelCatalogEntry[]>('/admin/model-catalog')
  return response.data
}

export async function createAgentModelCatalogEntry(input: AgentModelCatalogEntryInput): Promise<AgentModelCatalogEntry> {
  const response = await api.post<AgentModelCatalogEntry>('/admin/model-catalog', input)
  return response.data
}

export async function updateAgentModelCatalogEntry(id: number, input: AgentModelCatalogEntryInput): Promise<AgentModelCatalogEntry> {
  const response = await api.put<AgentModelCatalogEntry>(`/admin/model-catalog/${id}`, input)
  return response.data
}

export async function createAgentModelRouteBinding(catalogEntryId: number, input: AgentModelRouteBindingInput): Promise<AgentModelRouteBinding> {
  const response = await api.post<AgentModelRouteBinding>(`/admin/model-catalog/${catalogEntryId}/route-bindings`, input)
  return response.data
}

export async function updateAgentModelRouteBinding(catalogEntryId: number, bindingId: number, input: AgentModelRouteBindingInput): Promise<AgentModelRouteBinding> {
  const response = await api.put<AgentModelRouteBinding>(`/admin/model-catalog/${catalogEntryId}/route-bindings/${bindingId}`, input)
  return response.data
}

export async function deleteAgentModelRouteBinding(catalogEntryId: number, bindingId: number): Promise<void> {
  await api.delete(`/admin/model-catalog/${catalogEntryId}/route-bindings/${bindingId}`)
}

export function stringifyAgentModelSupportedParams(params: ParamDef[]): string {
  return JSON.stringify(params.filter((param) => param.key.trim()), null, 2)
}

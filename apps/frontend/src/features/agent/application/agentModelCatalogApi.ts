import {
  fetchAgentBackendModels as fetchAgentBackendModelsWithClient,
  type AgentBackendModelCatalogClient,
  type AgentBackendModelCatalogOptions,
} from '@movscript/core/agent'

import { api } from '@/shared/infrastructure/api'
import type { PublicModel } from '@/types'

export type AgentModelRouteSourceType = 'local_provider' | 'new_api' | string

export type AgentModelRouteBinding = {
  id: number
  catalog_entry_id: number
  source_type: AgentModelRouteSourceType
  route_group?: string
  provider_id?: string
  provider_model_id?: string
  api_kinds?: string
  is_enabled: boolean
  priority?: number
  capacity_weight?: number
  max_concurrency?: number
}

export type AgentModelCatalogEntry = {
  id: number
  public_model_id: string
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

type AgentModelRouteBindingResponse = Omit<AgentModelRouteBinding, 'id'> & {
  id?: number
  ID?: number
}

type AgentModelCatalogEntryResponse = Omit<AgentModelCatalogEntry, 'id' | 'route_bindings'> & {
  id?: number
  ID?: number
  route_bindings?: AgentModelRouteBindingResponse[]
}

export function fetchAgentBackendModels(): Promise<PublicModel[]>
export function fetchAgentBackendModels(client: AgentBackendModelCatalogClient<PublicModel>): Promise<PublicModel[]>
export function fetchAgentBackendModels(options: AgentBackendModelCatalogOptions, client?: AgentBackendModelCatalogClient<PublicModel>): Promise<PublicModel[]>
export function fetchAgentBackendModels(
  first?: AgentBackendModelCatalogClient<PublicModel> | AgentBackendModelCatalogOptions,
  second: AgentBackendModelCatalogClient<PublicModel> = api,
): Promise<PublicModel[]> {
  if (isAgentBackendModelCatalogClient(first)) {
    return fetchAgentBackendModelsWithClient(first)
  }
  return fetchAgentBackendModelsWithClient(second, first ?? {})
}

export async function fetchAgentModelCatalogEntries(): Promise<AgentModelCatalogEntry[]> {
  const response = await api.get<AgentModelCatalogEntryResponse[]>('/admin/model-catalog')
  return normalizeAgentModelCatalogEntries(response.data)
}

export function normalizeAgentModelCatalogEntries(entries: AgentModelCatalogEntryResponse[]): AgentModelCatalogEntry[] {
  return entries.map(normalizeAgentModelCatalogEntry)
}

export function normalizeAgentModelCatalogEntry(entry: AgentModelCatalogEntryResponse): AgentModelCatalogEntry {
  const { ID: _legacyID, route_bindings: routeBindings, ...rest } = entry
  return {
    ...rest,
    id: normalizedId(entry),
    route_bindings: routeBindings?.map(normalizeAgentModelRouteBinding),
  }
}

export function normalizeAgentModelRouteBinding(binding: AgentModelRouteBindingResponse): AgentModelRouteBinding {
  const { ID: _legacyID, ...rest } = binding
  return {
    ...rest,
    ...(rest.provider_id?.trim() ? { provider_id: rest.provider_id.trim() } : {}),
    id: normalizedId(binding),
  }
}

function normalizedId(record: { id?: number; ID?: number }): number {
  const id = record.id ?? record.ID
  if (typeof id === 'number' && Number.isFinite(id)) return id
  throw new Error('model catalog response is missing a numeric ID')
}

function isAgentBackendModelCatalogClient(value: unknown): value is AgentBackendModelCatalogClient<PublicModel> {
  return Boolean(value && typeof value === 'object' && typeof (value as AgentBackendModelCatalogClient<PublicModel>).get === 'function')
}

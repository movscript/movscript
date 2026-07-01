import {
  fetchAgentBackendModels as fetchAgentBackendModelsWithClient,
  type AgentBackendModelCatalogClient,
  type AgentBackendModelCatalogOptions,
} from '@movscript/core/agent'

import { api } from '@/shared/infrastructure/api'
import type { PublicModel } from '@/types'

export type AgentModelRouteSourceType = 'local_provider' | 'relay_gateway' | string

export type AgentModelRouteBinding = {
  id: number
  catalog_entry_id: number
  source_type: AgentModelRouteSourceType
  route_group?: string
  provider_id?: string
  adapter_type?: string
  provider_model_id?: string
  api_kinds?: string
  endpoint_base_url?: string
  endpoint_path_prefix?: string
  endpoint_mode?: string
  operation_profile?: string
  route_capabilities_json?: string
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
  accepts_image?: boolean
  max_input_images?: number
  max_input_videos?: number
  input_image_field?: string
  supported_params?: string
  param_limits_json?: string
  model_capabilities_json?: string
  route_bindings?: AgentModelRouteBinding[]
}

export type AgentModelRouteDiagnoseReferenceAsset = {
  role?: string
  media_type?: string
}

export type AgentModelRouteDiagnoseIntent = {
  capability?: string
  operation?: string
  reference_assets?: AgentModelRouteDiagnoseReferenceAsset[]
}

export type AgentModelRouteDiagnoseRequest = {
  public_model_id?: string
  model_id?: string
  catalog_entry_id?: number
  route_binding_id?: number
  route_group?: string
  capability: string
  operation?: string
  intent?: AgentModelRouteDiagnoseIntent
  reference_assets?: AgentModelRouteDiagnoseReferenceAsset[]
  api_kind?: string
  api_kinds?: string[]
}

export type AgentModelRouteDiagnosticEndpoint = {
  base_url?: string
  path_prefix?: string
  mode?: string
  operation_profile?: string
  effective_base_url?: string
}

export type AgentModelRouteDiagnosticCandidate = {
  catalog_entry_id: number
  public_model_id: string
  route_binding_id?: number
  status: 'selected' | 'accepted' | 'rejected' | string
  reasons?: string[]
  source_type?: AgentModelRouteSourceType
  route_group?: string
  provider_id?: string
  adapter_type?: string
  provider_model_id?: string
  api_kinds?: string[]
  priority: number
  capacity_weight: number
  max_concurrency?: number
  effective_endpoint?: AgentModelRouteDiagnosticEndpoint
}

export type AgentModelRouteDiagnosis = {
  model_id?: string
  catalog_entry_id?: number
  capability: string
  operation?: string
  route_group?: string
  selected_route_id?: number
  selected_route?: AgentModelRouteDiagnosticCandidate
  candidates: AgentModelRouteDiagnosticCandidate[]
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

export async function diagnoseAgentModelRoute(request: AgentModelRouteDiagnoseRequest): Promise<AgentModelRouteDiagnosis> {
  const response = await api.post<AgentModelRouteDiagnosis>('/admin/model-routes/diagnose', request)
  return response.data
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

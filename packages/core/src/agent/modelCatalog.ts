export const AGENT_BACKEND_MODEL_CAPABILITY_QUERY = 'text,reasoning'

export interface AgentBackendPublicModel {
  id: number
  catalog_entry_id?: number
  credential_id?: number
  model_id?: string
  display_name?: string
  short_name?: string
  provider_name?: string
  logical_model_id?: string
  provider_variant_count?: number
  capabilities: string[]
  accepts_image_input: boolean
  is_default?: boolean
  model_def_id?: string
  model_id_override?: string
  priority?: number
  capacity_weight?: number
  max_concurrency?: number
  supported_params?: unknown
  input_requirements?: unknown
  params_schema?: Record<string, unknown>
}

export interface AgentBackendModelCatalogClient<TModel extends AgentBackendPublicModel = AgentBackendPublicModel> {
  get(path: string, options?: { params?: Record<string, unknown> }): Promise<{ data: TModel[] }>
}

export async function fetchAgentBackendModels<TModel extends AgentBackendPublicModel>(
  client: AgentBackendModelCatalogClient<TModel>,
): Promise<TModel[]> {
  const response = await client.get('/models', {
    params: { capability: AGENT_BACKEND_MODEL_CAPABILITY_QUERY },
  })
  return mergeAgentBackendModels(response.data)
}

export function mergeAgentBackendModels<TModel extends AgentBackendPublicModel>(models: TModel[]): TModel[] {
  const byModelId = new Map<string, TModel>()
  for (const model of models) {
    const id = publicAgentBackendModelId(model)
    const existing = byModelId.get(id)
    if (!existing) {
      byModelId.set(id, { ...model, capabilities: [...model.capabilities] })
      continue
    }
    byModelId.set(id, {
      ...existing,
      capabilities: mergeCapabilities(existing.capabilities, model.capabilities),
      accepts_image_input: existing.accepts_image_input || model.accepts_image_input,
      provider_variant_count: (existing.provider_variant_count ?? 1) + Math.max(0, (model.provider_variant_count ?? 1) - 1),
    })
  }
  return [...byModelId.values()]
}

export function publicAgentBackendModelId(model: Pick<AgentBackendPublicModel, 'id' | 'model_id' | 'logical_model_id' | 'model_def_id'>): string {
  return model.model_id?.trim() || model.logical_model_id?.trim() || model.model_def_id?.trim() || `model_config:${model.id}`
}

function mergeCapabilities(left: string[], right: string[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const value of [...left, ...right]) {
    if (seen.has(value)) continue
    seen.add(value)
    merged.push(value)
  }
  return merged
}

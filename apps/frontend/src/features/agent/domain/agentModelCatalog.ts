import { publicModelId } from '@/shared/domain/modelDisplay'
import { api } from '@/shared/infrastructure/api'
import type { PublicModel } from '@/types'

export const AGENT_BACKEND_MODEL_CAPABILITY_QUERY = 'text,reasoning'

interface ModelCatalogClient {
  get(path: string, options?: { params?: Record<string, unknown> }): Promise<{ data: PublicModel[] }>
}

export async function fetchAgentBackendModels(client: ModelCatalogClient = api): Promise<PublicModel[]> {
  const response = await client.get('/models', {
    params: { capability: AGENT_BACKEND_MODEL_CAPABILITY_QUERY },
  })
  return mergeAgentBackendModels(response.data)
}

export function mergeAgentBackendModels(models: PublicModel[]): PublicModel[] {
  const byModelId = new Map<string, PublicModel>()
  for (const model of models) {
    const id = publicModelId(model)
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

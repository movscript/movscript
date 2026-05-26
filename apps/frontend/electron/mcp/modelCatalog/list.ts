import { backendList } from '../backendList'
import {
  normalizeModelCapabilityAlias,
  summarizeModelContractForAgent,
} from '../modelContracts'
import { getOptionalString } from '../paramValues'

export async function listModels(args: Record<string, unknown>): Promise<unknown> {
  const rawFeature = getOptionalString(args, 'feature') ?? getOptionalString(args, 'feature_key') ?? getOptionalString(args, 'featureKey')
  const rawCapability = getOptionalString(args, 'capability')
  const featureCapability = normalizeModelCapabilityAlias(rawFeature)
  const feature = featureCapability ? undefined : rawFeature
  const capability = featureCapability ?? normalizeModelCapabilityAlias(rawCapability) ?? rawCapability
  const providerVariants = args.provider_variants === true || args.include_provider_variants === true

  const queries = feature
    ? [{ label: `feature:${feature}`, path: `/models?feature=${encodeURIComponent(feature)}${providerVariants ? '&provider_variants=true' : ''}` }]
    : capability
      ? [{ label: `capability:${capability}`, path: `/models?capability=${encodeURIComponent(capability)}${providerVariants ? '&provider_variants=true' : ''}` }]
      : ['text', 'image', 'image_edit', 'video', 'video_i2v', 'video_v2v'].map((item) => ({
        label: `capability:${item}`,
        path: `/models?capability=${encodeURIComponent(item)}${providerVariants ? '&provider_variants=true' : ''}`,
      }))

  const byId = new Map<number, any>()
  for (const query of queries) {
    const models = await backendList(query.path)
    for (const model of models) {
      const id = Number(model?.id ?? model?.ID)
      if (Number.isFinite(id) && id > 0 && !byId.has(id)) {
        byId.set(id, model)
      }
    }
  }

  return {
    count: byId.size,
    queries: queries.map((query) => query.label),
    model_contracts: Array.from(byId.values()).map(summarizeModelContractForAgent),
    models: Array.from(byId.values()),
  }
}

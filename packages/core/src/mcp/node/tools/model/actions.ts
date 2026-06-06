import { backendList } from '../../../../backend/node/client.js'
import {
  normalizeModelCapabilityAlias,
  summarizeModelContractForAgent,
} from '../../../tools/model/contracts/index.js'
import { getOptionalString } from '../../../tools/shared/params.js'

export async function listModels(args: Record<string, unknown>): Promise<unknown> {
  const rawCapability = getOptionalString(args, 'capability')
  const capability = normalizeModelCapabilityAlias(rawCapability) ?? rawCapability
  const providerVariants = args.provider_variants === true || args.include_provider_variants === true

  const queries = capability
    ? [{ label: `capability:${capability}`, path: `/models?capability=${encodeURIComponent(capability)}${providerVariants ? '&provider_variants=true' : ''}` }]
    : ['text', 'image', 'image_edit', 'video', 'video_i2v', 'video_v2v', 'audio_tts', 'audio_transcribe', 'subtitle_align', 'render_video'].map((item) => ({
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

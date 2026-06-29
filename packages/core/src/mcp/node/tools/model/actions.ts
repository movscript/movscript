import { backendList } from '../../../../backend/node/client.js'
import {
  normalizeModelCapabilityAlias,
  summarizeModelContractForAgent,
} from '../../../tools/model/contracts/index.js'
import { getOptionalString } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'

export async function listModels(args: Record<string, unknown>): Promise<unknown> {
  const rawCapability = getOptionalString(args, 'capability')
  const operation = getOptionalString(args, 'operation') ?? getOptionalString(args, 'model_operation')
  const normalizedCapability = normalizeModelCapabilityAlias(rawCapability)
  const capability = normalizedCapability ?? (rawCapability ? undefined : capabilityForModelOperation(operation))
  const referenceAssets = modelReferenceAssetsArg(args.reference_assets ?? args.referenceAssets)
  const providerVariants = args.provider_variants === true || args.include_provider_variants === true

  const defaultCapabilities = ['text_generation', 'image_generation', 'video_generation', 'audio_generation', 'text', 'image', 'image_edit', 'video', 'video_i2v', 'video_v2v', 'audio_tts', 'audio_transcribe', 'audio_translate', 'audio_music', 'audio_sfx', 'audio_chat', 'voice_clone', 'voice_design', 'subtitle_align', 'subtitle_translate']
  if (rawCapability && !capability) {
    return {
      count: 0,
      queries: [],
      model_contracts: [],
      models: [],
    }
  }
  if (operation && !capability) {
    return {
      count: 0,
      queries: [],
      model_contracts: [],
      models: [],
    }
  }
  const queries = capability
    ? [modelListQuery(capability, { operation, providerVariants, referenceAssets })]
    : defaultCapabilities.map((item) => ({
        label: `capability:${item}`,
        path: modelListPath(item, { providerVariants }),
      }))

  const byId = new Map<string, Record<string, unknown>>()
  for (const query of queries) {
    const models = await backendList(query.path)
    for (const model of models) {
      const id = Number(model?.id ?? model?.ID)
      const contract = summarizeModelContractForAgent(model)
      const key = typeof contract.model_id === 'string' && contract.model_id.trim()
        ? contract.model_id.trim()
        : Number.isFinite(id) && id > 0
          ? `backend.model.${id}`
          : `model.${byId.size}`
      if (!byId.has(key)) byId.set(key, contract)
    }
  }
  const modelContracts = Array.from(byId.values())

  return {
    count: byId.size,
    queries: queries.map((query) => query.label),
    model_contracts: modelContracts,
    models: modelContracts,
  }
}

function modelListQuery(
  capability: string,
  options: { operation?: string; providerVariants?: boolean; referenceAssets?: ModelReferenceAsset[] },
): { label: string; path: string } {
  const parts = [`capability:${capability}`]
  if (options.operation) parts.push(`operation:${options.operation}`)
  if (options.referenceAssets && options.referenceAssets.length > 0) {
    parts.push(`reference_assets:${options.referenceAssets.length}`)
  }
  return {
    label: parts.join(':'),
    path: modelListPath(capability, options),
  }
}

function modelListPath(
  capability: string,
  options: { operation?: string; providerVariants?: boolean; referenceAssets?: ModelReferenceAsset[] } = {},
): string {
  const params = new URLSearchParams()
  params.set('capability', capability)
  if (options.operation) params.set('operation', options.operation)
  if (options.providerVariants) params.set('provider_variants', 'true')
  if (options.referenceAssets && options.referenceAssets.length > 0) {
    params.set('reference_assets', JSON.stringify(options.referenceAssets))
  }
  return `/models?${params.toString()}`
}

function capabilityForModelOperation(operation: string | undefined): string | undefined {
  const normalized = operation?.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'text_to_image':
    case 'image_to_image':
      return 'image_generation'
    case 'prompt_to_video':
    case 'text_to_video':
    case 'image_to_video':
    case 'first_frame_to_video':
    case 'first_last_frame_to_video':
    case 'reference_to_video':
    case 'video_to_video':
      return 'video_generation'
    case 'tts':
    case 'stt':
    case 'speech_translate':
    case 'audio_chat':
    case 'voice_clone':
    case 'voice_design':
    case 'dubbing':
    case 'music':
    case 'sfx':
    case 'speech_enhancement':
      return 'audio_generation'
    default:
      return undefined
  }
}

type ModelReferenceAsset = {
  role: string
  media_type?: string
}

function modelReferenceAssetsArg(value: unknown): ModelReferenceAsset[] | undefined {
  const raw = Array.isArray(value) ? value : []
  const refs = raw
    .filter(isRecord)
    .map((item) => {
      const role = getOptionalString(item, 'role') ?? 'generic'
      const mediaType = getOptionalString(item, 'media_type') ?? getOptionalString(item, 'mediaType')
      return {
        role,
        ...(mediaType ? { media_type: mediaType } : {}),
      }
    })
    .filter((item) => item.role.trim())
  return refs.length > 0 ? refs : undefined
}

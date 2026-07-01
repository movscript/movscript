import type {
  GenerationModelInputSlot,
  GenerationModelResolverProfile,
  GenerationResolverModelLike,
} from './types.js'
import { normalizeGenerationResolverOutput } from './normalizeReferences.js'

const IMAGE_ROLES = [
  'reference_image',
  'style_reference',
  'character_reference',
  'product_reference',
  'target_image',
  'first_frame',
  'last_frame',
  'generic',
]
const VIDEO_ROLES = ['reference_video', 'target_video', 'generic']
const AUDIO_ROLES = ['reference_audio', 'source_audio', 'speech_audio', 'voice_sample', 'target_voice', 'generic']

const IMAGE_INPUT_OPERATIONS = new Set([
  'reference_to_image',
  'edit_image',
  'inpaint',
  'outpaint',
  'variation',
  'upscale_image',
  'image_to_video',
  'first_frame_to_video',
  'first_last_frame_to_video',
  'reference_to_video',
])
const VIDEO_INPUT_OPERATIONS = new Set(['reference_to_video', 'edit_video', 'extend_video', 'upscale_video'])
const AUDIO_INPUT_OPERATIONS = new Set([
  'reference_to_video',
  'speech_to_text',
  'speech_translate',
  'speech_to_speech',
  'voice_clone',
  'dubbing',
  'voice_isolation',
  'forced_alignment',
])

export function generationModelId(model: GenerationResolverModelLike): string {
  return String(model.model_id ?? model.logical_model_id ?? model.id ?? '').trim() || 'unknown-model'
}

export function generationModelLabel(model: GenerationResolverModelLike): string {
  return String(model.display_name ?? model.short_name ?? model.model_id ?? model.id ?? '').trim() || generationModelId(model)
}

export function normalizeGenerationModelProfile(model: GenerationResolverModelLike): GenerationModelResolverProfile {
  const explicit = model.resolver_profile ?? model.generation_profile
  if (explicit) return normalizeExplicitProfile(explicit)
  if (model.input_slots?.length) {
    return {
      output: outputsFromCapabilities(model.capabilities),
      accepts_prompt_only: true,
      input_slots: model.input_slots,
      operations: operationsFromModel(model),
    }
  }
  const capabilities = normalizedCapabilities(model.capabilities)
  const operations = operationsFromModel(model)
  const outputs = outputsFromCapabilities(capabilities)
  return {
    output: outputs,
    accepts_prompt_only: true,
    input_slots: inferredSlots(model, operations),
    operations,
  }
}

function normalizeExplicitProfile(profile: GenerationModelResolverProfile): GenerationModelResolverProfile {
  return {
    ...profile,
    output: Array.isArray(profile.output)
      ? profile.output.map((item) => normalizeGenerationResolverOutput(item) ?? String(item))
      : normalizeGenerationResolverOutput(profile.output) ?? profile.output,
    input_slots: profile.input_slots ?? [],
  }
}

function normalizedCapabilities(capabilities: readonly string[] | undefined): string[] {
  return (capabilities ?? []).map((item) => item.trim().toLowerCase().replace(/-/g, '_')).filter(Boolean)
}

function outputsFromCapabilities(capabilities: readonly string[] | undefined): string[] {
  const normalized = normalizedCapabilities(capabilities)
  const outputs: string[] = []
  if (normalized.includes('image_generation')) outputs.push('image')
  if (normalized.includes('video_generation')) outputs.push('video')
  if (normalized.includes('audio_generation')) outputs.push('audio')
  if (normalized.includes('text_generation') || normalized.includes('text')) outputs.push('text')
  return outputs.length > 0 ? outputs : ['text']
}

function inferredSlots(model: GenerationResolverModelLike, operations: readonly string[]): GenerationModelInputSlot[] {
  const slots: GenerationModelInputSlot[] = []
  const imageRequirement = model.input_requirements?.image
  const videoRequirement = model.input_requirements?.video
  const audioRequirement = model.input_requirements?.audio
  const normalizedOperations = operations.map((item) => item.trim().toLowerCase()).filter(Boolean)
  const acceptsImage = model.accepts_image_input === true
    || positiveMax(imageRequirement?.max)
    || normalizedOperations.some((operation) => IMAGE_INPUT_OPERATIONS.has(operation))
  const acceptsVideo = positiveMax(videoRequirement?.max)
    || normalizedOperations.some((operation) => VIDEO_INPUT_OPERATIONS.has(operation))
  const acceptsAudio = positiveMax(audioRequirement?.max)
    || normalizedOperations.some((operation) => AUDIO_INPUT_OPERATIONS.has(operation))

  if (acceptsImage) {
    slots.push({
      id: 'image_reference',
      media_type: 'image',
      roles: IMAGE_ROLES,
      min: clampMin(imageRequirement?.min),
      max: maxOrUnlimited(imageRequirement?.max),
      match_level: model.input_requirements?.image ? 'exact' : 'compatible',
      label: '图像引用',
    })
  }
  if (acceptsVideo) {
    slots.push({
      id: 'video_reference',
      media_type: 'video',
      roles: VIDEO_ROLES,
      min: clampMin(videoRequirement?.min),
      max: maxOrUnlimited(videoRequirement?.max),
      match_level: model.input_requirements?.video ? 'exact' : 'compatible',
      label: '视频引用',
    })
  }
  if (acceptsAudio) {
    slots.push({
      id: 'audio_reference',
      media_type: 'audio',
      roles: AUDIO_ROLES,
      min: clampMin(audioRequirement?.min),
      max: maxOrUnlimited(audioRequirement?.max),
      match_level: 'exact',
      label: '音频引用',
    })
  }
  return slots
}

function operationsFromModel(model: GenerationResolverModelLike): string[] {
  return [
    ...(model.operations ?? []),
    ...(model.supported_operations ?? []),
    ...(model.resolver_profile?.operations ?? []),
    ...(model.generation_profile?.operations ?? []),
  ].map((item) => item.trim()).filter(Boolean)
}

function positiveMax(value: unknown): boolean {
  return typeof value === 'number' && (value > 0 || value === -1)
}

function clampMin(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined
}

function maxOrUnlimited(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  if (value === -1) return undefined
  return Math.max(0, value)
}

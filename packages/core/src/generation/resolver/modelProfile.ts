import type {
  GenerationModelInputSlot,
  GenerationModelResolverProfile,
  GenerationResolverModelLike,
} from './types.js'
import { normalizeGenerationResolverOutput } from './normalizeReferences.js'

const IMAGE_ROLES = ['reference_image', 'style_reference', 'first_frame', 'last_frame', 'generic']
const VIDEO_ROLES = ['reference_video', 'motion_reference', 'source_video', 'generic']
const AUDIO_ROLES = ['reference_audio', 'source_audio', 'generic']

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
  const outputs = outputsFromCapabilities(capabilities)
  return {
    output: outputs,
    accepts_prompt_only: true,
    input_slots: inferredSlots(model, capabilities),
    operations: operationsFromModel(model),
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
  if (normalized.some((capability) => ['image', 'image_generation', 'image_edit'].includes(capability))) outputs.push('image')
  if (normalized.some((capability) => ['video', 'video_generation', 'video_i2v', 'video_v2v'].includes(capability))) outputs.push('video')
  if (normalized.some((capability) => capability.startsWith('audio') || ['voice_clone', 'voice_design'].includes(capability))) outputs.push('audio')
  if (normalized.some((capability) => ['text', 'text_generation', 'reasoning'].includes(capability))) outputs.push('text')
  return outputs.length > 0 ? outputs : ['text']
}

function inferredSlots(model: GenerationResolverModelLike, capabilities: readonly string[]): GenerationModelInputSlot[] {
  const slots: GenerationModelInputSlot[] = []
  const imageRequirement = model.input_requirements?.image
  const videoRequirement = model.input_requirements?.video
  const audioRequirement = model.input_requirements?.audio
  const acceptsImage = model.accepts_image_input === true
    || positiveMax(imageRequirement?.max)
    || capabilities.includes('image_edit')
    || capabilities.includes('video_i2v')
  const acceptsVideo = positiveMax(videoRequirement?.max) || capabilities.includes('video_v2v')
  const acceptsAudio = positiveMax(audioRequirement?.max)

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

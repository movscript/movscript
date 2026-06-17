import type { GenerationParamValue } from './jobPayload.js'

export type GenerationJobOutputType = 'image' | 'video' | 'audio' | 'text'
export type GenerationResolvedJobType =
  | 'image'
  | 'image_edit'
  | 'video'
  | 'video_i2v'
  | 'video_v2v'
  | 'audio_tts'
  | 'text'
  | (string & {})

export interface GenerationJobDecisionModelLike {
  capabilities?: readonly string[] | null
  accepts_image_input?: boolean | null
  supported_params?: readonly {
    key: string
    default?: GenerationParamValue
  }[] | null
}

export interface GenerationJobDecisionResourceLike {
  type?: string | null
}

export interface ResolveGenerationJobTypeInput {
  outputType: GenerationJobOutputType | (string & {})
  model?: GenerationJobDecisionModelLike | null
  attachments?: readonly GenerationJobDecisionResourceLike[] | null
}

export interface ResolveGenerationJobTypeFromResourceCountInput {
  outputType: GenerationJobOutputType | (string & {})
  inputResourceCount?: number | null
  preferredVideoJobType?: unknown
}

export function generationModelCapabilities(model?: GenerationJobDecisionModelLike | null): readonly string[] {
  return Array.isArray(model?.capabilities) ? model.capabilities : []
}

export function generationModelAcceptsImageInput(model?: GenerationJobDecisionModelLike | null): boolean {
  const caps = generationModelCapabilities(model)
  return caps.includes('image_edit') || caps.includes('video_i2v') || caps.includes('video_v2v') || model?.accepts_image_input === true
}

export function generationModelAcceptsVideoInput(model?: GenerationJobDecisionModelLike | null): boolean {
  return generationModelCapabilities(model).includes('video_v2v')
}

export function generationAttachmentsIncludeType(
  attachments: readonly GenerationJobDecisionResourceLike[] | null | undefined,
  type: string,
): boolean {
  return Array.isArray(attachments) && attachments.some((attachment) => attachment.type === type)
}

export function resolveGenerationJobType(input: ResolveGenerationJobTypeInput): GenerationResolvedJobType {
  const caps = generationModelCapabilities(input.model)
  const hasImageAttachment = generationAttachmentsIncludeType(input.attachments, 'image')
  const hasVideoAttachment = generationAttachmentsIncludeType(input.attachments, 'video')

  if (input.outputType === 'image' && caps.includes('image_edit') && (hasImageAttachment || !caps.includes('image'))) {
    return 'image_edit'
  }
  if (input.outputType === 'video') {
    if (caps.includes('video_v2v') && hasVideoAttachment) return 'video_v2v'
    if (caps.includes('video_i2v') && hasImageAttachment) return 'video_i2v'
    if (caps.includes('video_i2v') && !caps.includes('video')) return 'video_i2v'
    if (caps.includes('video_v2v') && !caps.includes('video')) return 'video_v2v'
  }
  if (input.outputType === 'audio') return 'audio_tts'
  return input.outputType
}

export function resolveGenerationJobTypeFromResourceCount(
  input: ResolveGenerationJobTypeFromResourceCountInput,
): GenerationResolvedJobType {
  const hasInputResource = positiveResourceCount(input.inputResourceCount) > 0
  if (input.outputType === 'image') return hasInputResource ? 'image_edit' : 'image'
  if (input.outputType === 'video') {
    const preferredVideoJobType = generationPreferredVideoJobType(input.preferredVideoJobType)
    if (preferredVideoJobType) return preferredVideoJobType
    return hasInputResource ? 'video_i2v' : 'video'
  }
  if (input.outputType === 'audio') return 'audio_tts'
  return input.outputType
}

export function resolveGenerationCapabilityForResourceCount(
  input: Pick<ResolveGenerationJobTypeFromResourceCountInput, 'outputType' | 'inputResourceCount'>,
): GenerationResolvedJobType {
  return resolveGenerationJobTypeFromResourceCount(input)
}

export function generationPreferredVideoJobType(value: unknown): 'video_i2v' | 'video_v2v' | undefined {
  return value === 'video_i2v' || value === 'video_v2v' ? value : undefined
}

export function generationParamDefaults(
  model?: Pick<GenerationJobDecisionModelLike, 'supported_params'> | null,
): Record<string, GenerationParamValue> {
  const defaults: Record<string, GenerationParamValue> = {}
  if (!Array.isArray(model?.supported_params)) return defaults
  for (const param of model.supported_params) {
    if (typeof param.key === 'string' && param.key && param.default !== undefined) {
      defaults[param.key] = param.default
    }
  }
  return defaults
}

function positiveResourceCount(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value) || 0))
}

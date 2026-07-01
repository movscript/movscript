import type { GenerationParamValue } from './jobPayload.js'

export type GenerationJobOutputType = 'image' | 'video' | 'audio' | 'text'
export type GenerationResolvedJobType =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | (string & {})

export interface GenerationJobDecisionModelLike {
  capabilities?: readonly string[] | null
  accepts_image_input?: boolean | null
  input_requirements?: {
    image?: { max?: number | null } | null
    video?: { max?: number | null } | null
  } | null
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
}

export function generationModelCapabilities(model?: GenerationJobDecisionModelLike | null): readonly string[] {
  return Array.isArray(model?.capabilities) ? model.capabilities : []
}

export function generationModelAcceptsImageInput(model?: GenerationJobDecisionModelLike | null): boolean {
  return model?.accepts_image_input === true || positiveInputMax(model?.input_requirements?.image?.max)
}

export function generationModelAcceptsVideoInput(model?: GenerationJobDecisionModelLike | null): boolean {
  return positiveInputMax(model?.input_requirements?.video?.max)
}

export function generationAttachmentsIncludeType(
  attachments: readonly GenerationJobDecisionResourceLike[] | null | undefined,
  type: string,
): boolean {
  return Array.isArray(attachments) && attachments.some((attachment) => attachment.type === type)
}

export function resolveGenerationJobType(input: ResolveGenerationJobTypeInput): GenerationResolvedJobType {
  return input.outputType
}

export function resolveGenerationJobTypeFromResourceCount(
  input: ResolveGenerationJobTypeFromResourceCountInput,
): GenerationResolvedJobType {
  return input.outputType
}

export function resolveGenerationCapabilityForResourceCount(
  input: Pick<ResolveGenerationJobTypeFromResourceCountInput, 'outputType' | 'inputResourceCount'>,
): GenerationResolvedJobType {
  return resolveGenerationJobTypeFromResourceCount(input)
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

function positiveInputMax(value: unknown): boolean {
  return typeof value === 'number' && (value > 0 || value === -1)
}

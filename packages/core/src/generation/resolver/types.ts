import type { GenerationParamDef } from '../params.js'

export type GenerationResolverOutputKind = 'image' | 'video' | 'audio' | 'text' | string
export type GenerationResolverMediaType = 'image' | 'video' | 'audio' | 'text' | 'file' | string
export type GenerationResolverMatchLevel = 'exact' | 'compatible' | 'requires_adaptation'
export type GenerationResolverBlockerCode =
  | 'missing_output'
  | 'missing_reference_media_type'
  | 'missing_reference_role'
  | 'unsupported_output'
  | 'unsupported_reference'
  | 'too_many_references'
  | 'missing_required_reference'

export interface GenerationResolverReferenceInput {
  role?: string | null
  media_type?: GenerationResolverMediaType | null
  mediaType?: GenerationResolverMediaType | null
  resource_id?: number | null
  resourceId?: number | null
  source?: string | null
}

export interface GenerationResolverReference {
  role: string
  media_type: GenerationResolverMediaType
  resource_id?: number
  source?: string
  inferred_role?: boolean
}

export interface GenerationModelInputSlot {
  id?: string
  media_type: GenerationResolverMediaType | readonly GenerationResolverMediaType[]
  roles?: readonly string[]
  min?: number
  max?: number
  required?: boolean
  match_level?: GenerationResolverMatchLevel
  operation?: string
  label?: string
}

export interface GenerationModelResolverProfile {
  output: GenerationResolverOutputKind | readonly GenerationResolverOutputKind[]
  accepts_prompt_only?: boolean
  input_slots?: readonly GenerationModelInputSlot[]
  operations?: readonly string[]
  labels?: readonly string[]
}

export interface GenerationResolverModelLike {
  id?: string | number
  model_id?: string
  display_name?: string
  short_name?: string
  logical_model_id?: string
  capabilities?: readonly string[]
  supported_params?: GenerationParamDef[]
  supported_params_by_operation?: Record<string, GenerationParamDef[]>
  is_default?: boolean
  accepts_image_input?: boolean | null
  input_requirements?: {
    image?: { min?: number; max?: number }
    video?: { min?: number; max?: number }
    audio?: { min?: number; max?: number }
  } | null
  resolver_profile?: GenerationModelResolverProfile | null
  generation_profile?: GenerationModelResolverProfile | null
  input_slots?: readonly GenerationModelInputSlot[]
  operations?: readonly string[]
  supported_operations?: readonly string[]
}

export interface GenerationCallProfile {
  output: GenerationResolverOutputKind
  labels: string[]
  reference_roles: string[]
  reference_media_types: GenerationResolverMediaType[]
  preferred_operations: string[]
}

export interface GenerationResolverBlocker {
  code: GenerationResolverBlockerCode
  message: string
  model_id?: string
  reference?: Partial<GenerationResolverReferenceInput | GenerationResolverReference>
  details?: Record<string, unknown>
}

export interface GenerationResolvedModel<Model extends GenerationResolverModelLike = GenerationResolverModelLike> {
  model: Model
  model_id: string
  label: string
  level: GenerationResolverMatchLevel
  score: number
  reasons: string[]
  supported_params?: GenerationParamDef[]
  profile: GenerationModelResolverProfile
  selected_operation?: string
}

export interface GenerationBlockedModel<Model extends GenerationResolverModelLike = GenerationResolverModelLike> {
  model: Model
  model_id: string
  label: string
  blockers: GenerationResolverBlocker[]
  profile: GenerationModelResolverProfile
}

export interface ResolveGenerationModelsInput<Model extends GenerationResolverModelLike = GenerationResolverModelLike> {
  targetOutput: GenerationResolverOutputKind | null | undefined
  references?: readonly GenerationResolverReferenceInput[]
  models?: readonly Model[]
}

export interface ResolveGenerationModelsResult<Model extends GenerationResolverModelLike = GenerationResolverModelLike> {
  profile: GenerationCallProfile | null
  references: GenerationResolverReference[]
  matches: GenerationResolvedModel<Model>[]
  blocked: GenerationBlockedModel<Model>[]
  blockers: GenerationResolverBlocker[]
}

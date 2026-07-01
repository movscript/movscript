import { resourceIdsFromMentions } from '@movscript/workspace'

export type GenerationParamValue = string | number | boolean

export interface GenerationParamRequiresValue {
  param: string
  value: GenerationParamValue
}

export interface GenerationJobPayloadParamDef {
  key: string
  requires_value?: GenerationParamRequiresValue[]
}

export interface BuildGenerationJobPayloadInput {
  modelId: string
  jobType: string
  generationIntent?: GenerationIntentPayload | null
  title: string
  prompt: string
  params: Record<string, GenerationParamValue>
  supportedParams?: readonly GenerationJobPayloadParamDef[] | null
  inputResourceIds: number[]
  sourceKey: string
}

export interface GenerationIntentPayload {
  capability: string
  operation: string
  reference_assets?: GenerationReferenceAssetPayload[]
}

export interface GenerationReferenceAssetPayload {
  reference_id?: string
  source_kind?: string
  source_id?: string | number
  source_ref?: string | number
  role: string
  media_type: string
  resource_id: number
}

export function buildGenerationJobPayload(input: BuildGenerationJobPayloadInput): Record<string, unknown> {
  const effectiveParams = filterGenerationParamsByRequiresValue(input.params, input.supportedParams)
  const { aspect_ratio, duration, ...remainingParams } = effectiveParams
  const durationValue = duration === undefined || duration === '' ? undefined : Number(duration)
  if (duration !== undefined && duration !== '' && !Number.isFinite(durationValue)) {
    remainingParams.duration = duration
  }
  const generationIntent = normalizeGenerationIntentPayload(input.generationIntent, input.inputResourceIds)
  validatePromptResourceMentions(input.prompt, input.inputResourceIds, generationIntent?.reference_assets)
  return {
    model_id: input.modelId.trim(),
    job_type: input.jobType,
    title: input.title,
    prompt: input.prompt.trim(),
    aspect_ratio: aspect_ratio ?? undefined,
    duration: Number.isFinite(durationValue) ? durationValue : undefined,
    extra_params: Object.keys(remainingParams).length > 0 ? JSON.stringify(remainingParams) : undefined,
    input_resource_ids: input.inputResourceIds,
    ...(generationIntent ? { generation_intent: generationIntent } : {}),
    feature_key: input.sourceKey,
  }
}

function validatePromptResourceMentions(
  prompt: string,
  inputResourceIds: readonly number[],
  referenceAssets: readonly GenerationReferenceAssetPayload[] | undefined,
) {
  const mentions = resourceIdsFromMentions(prompt)
  if (mentions.length === 0) return
  const allowed = new Set([
    ...inputResourceIds,
    ...(referenceAssets ?? []).map((asset) => asset.resource_id),
  ].filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0))
  const missing = [...new Set(mentions.filter((id) => !allowed.has(id)))]
  if (missing.length > 0) {
    throw new Error(`generation_prompt_reference_not_in_input_resources:${missing.join(',')}`)
  }
}

function normalizeGenerationIntentPayload(
  intent: GenerationIntentPayload | null | undefined,
  inputResourceIds: readonly number[],
): GenerationIntentPayload | undefined {
  if (!intent?.capability?.trim() || !intent.operation?.trim()) return undefined
  const refs = Array.isArray(intent.reference_assets) ? intent.reference_assets : []
  return {
    capability: intent.capability.trim(),
    operation: intent.operation.trim(),
    ...(refs.length > 0
      ? {
          reference_assets: refs.map((ref, index) => normalizeGenerationReferenceAssetPayload(ref, inputResourceIds[index])),
        }
      : {}),
  }
}

function normalizeGenerationReferenceAssetPayload(
  ref: GenerationReferenceAssetPayload,
  fallbackResourceId: number | undefined,
): GenerationReferenceAssetPayload {
  const role = ref.role.trim()
  const mediaType = ref.media_type?.trim()
  const resourceId = ref.resource_id || fallbackResourceId
  const referenceId = optionalTrimmedString(ref.reference_id)
  const sourceKind = optionalTrimmedString(ref.source_kind)
  const sourceId = optionalStringOrNumber(ref.source_id)
  const sourceRef = optionalStringOrNumber(ref.source_ref)
  if (!role || !mediaType || !resourceId) {
    throw new Error('generation_intent.reference_assets must include role, media_type, and resource_id for every resource input')
  }
  return {
    ...(referenceId ? { reference_id: referenceId } : {}),
    ...(sourceKind ? { source_kind: sourceKind } : {}),
    ...(sourceId !== undefined ? { source_id: sourceId } : {}),
    ...(sourceRef !== undefined ? { source_ref: sourceRef } : {}),
    role,
    media_type: mediaType,
    resource_id: resourceId,
  }
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalStringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return optionalTrimmedString(value)
}

export function filterGenerationParamsByRequiresValue(
  params: Record<string, GenerationParamValue>,
  supportedParams?: readonly GenerationJobPayloadParamDef[] | null,
): Record<string, GenerationParamValue> {
  if (!Array.isArray(supportedParams) || supportedParams.length === 0) return { ...params }
  const paramDefs = new Map(supportedParams.map((param) => [param.key, param]))
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => {
      const paramDef = paramDefs.get(key)
      return Boolean(paramDef) && generationParamRequiresValueSatisfied(paramDef, params)
    }),
  )
}

export function generationParamRequiresValueSatisfied(
  param: GenerationJobPayloadParamDef,
  values: Record<string, GenerationParamValue>,
): boolean {
  const rules = Array.isArray(param.requires_value) ? param.requires_value : []
  return rules.every((rule) => values[rule.param] === rule.value)
}

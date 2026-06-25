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
  title: string
  prompt: string
  params: Record<string, GenerationParamValue>
  supportedParams?: readonly GenerationJobPayloadParamDef[] | null
  inputResourceIds: number[]
  sourceKey: string
}

export function buildGenerationJobPayload(input: BuildGenerationJobPayloadInput): Record<string, unknown> {
  const effectiveParams = filterGenerationParamsByRequiresValue(input.params, input.supportedParams)
  const { aspect_ratio, duration, ...remainingParams } = effectiveParams
  const durationValue = duration === undefined || duration === '' ? undefined : Number(duration)
  if (duration !== undefined && duration !== '' && !Number.isFinite(durationValue)) {
    remainingParams.duration = duration
  }
  return {
    model_id: input.modelId.trim(),
    job_type: input.jobType,
    title: input.title,
    prompt: input.prompt.trim(),
    aspect_ratio: aspect_ratio ?? undefined,
    duration: Number.isFinite(durationValue) ? durationValue : undefined,
    extra_params: Object.keys(remainingParams).length > 0 ? JSON.stringify(remainingParams) : undefined,
    input_resource_ids: input.inputResourceIds,
    feature_key: input.sourceKey,
  }
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
      return !paramDef || generationParamRequiresValueSatisfied(paramDef, params)
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

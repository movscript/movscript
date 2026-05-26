export type GenerationParamValue = string | number | boolean

export interface BuildGenerationJobPayloadInput {
  modelId: string
  jobType: string
  title: string
  prompt: string
  params: Record<string, GenerationParamValue>
  inputResourceIds: number[]
  featureKey: string
}

export function buildGenerationJobPayload(input: BuildGenerationJobPayloadInput): Record<string, unknown> {
  const { aspect_ratio, duration, ...remainingParams } = input.params
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
    feature_key: input.featureKey,
  }
}

import { backendGet, backendPost } from '../../../../backend/node/client.js'
import { listModels } from '../model/actions.js'
import { getOptionalNumeric, getOptionalString, numericValues } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'
import { resolveMCPRequiredProjectId } from '../workspace/locator.js'

type GenerationJobType = 'image' | 'image_edit' | 'video' | 'video_i2v'

type BuiltGenerationRequest = {
  prompt: string
  refIds: number[]
  jobType: GenerationJobType
  timeoutMs: number
  params: Record<string, unknown>
  explicitParamKeys: Set<string>
  defaultParamKeys: Set<string>
}

type ModelSelection = {
  modelId: string
  model?: Record<string, unknown>
}

type ParameterMode = 'strict' | 'compatible'

type ParamAuditItem = {
  key: string
  value?: unknown
  reason: string
  source?: 'explicit' | 'default' | 'compatible'
  mapped_to?: string
  mapped_value?: unknown
}

type PreparedGenerationParams = {
  aspectRatio?: string
  duration?: number
  extraParams: Record<string, unknown>
  audit: ParamAuditItem[]
}

export async function generateImage(args: Record<string, unknown>): Promise<unknown> {
  const built = buildImageRequest(args)
  const selection = await resolveModelSelection(args, built.jobType, built.jobType === 'image_edit' ? 'image' : 'image_edit')
  const submitted = await submitGenerationJob(args, selection, built, 'electron.generation.image')
  return generationSubmitResult('image', submitted.job, 'generation_image_job_get', submitted.paramAudit)
}

export async function getImageGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  return generationJobGetResult('image', await getGenerationJob(normalizedJobId(args)))
}

export async function getImageGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  return getGenerationJobs('image', args)
}

export async function generateVideo(args: Record<string, unknown>): Promise<unknown> {
  const built = buildVideoRequest(args)
  const selection = await resolveModelSelection(args, built.jobType, 'video')
  const submitted = await submitGenerationJob(args, selection, built, 'electron.generation.video')
  return generationSubmitResult('video', submitted.job, 'generation_video_job_get', submitted.paramAudit)
}

export async function getVideoGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  return generationJobGetResult('video', await getGenerationJob(normalizedJobId(args)))
}

export async function getVideoGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  return getGenerationJobs('video', args)
}

function buildImageRequest(args: Record<string, unknown>): BuiltGenerationRequest {
  const prompt = promptArg(args)
  const refIds = resourceIds(args.input_resource_ids) ?? resourceIds(args.reference_resource_ids) ?? []
  const params = extraParamsArg(args.extra_params)
  const explicitParamKeys = new Set(Object.keys(params))
  const defaultParamKeys = new Set<string>()

  assignStringParam(args, params, explicitParamKeys, 'image_size')
  assignDefaultParam(params, defaultParamKeys, 'image_size', '1024x1024')
  assignStringParam(args, params, explicitParamKeys, 'aspect_ratio')
  assignDefaultParam(params, defaultParamKeys, 'aspect_ratio', '1:1')
  const quality = getOptionalString(args, 'quality')
  if (quality) {
    params.quality = quality
    explicitParamKeys.add('quality')
  }
  const negativePrompt = getOptionalString(args, 'negative_prompt')
  if (negativePrompt) {
    params.negative_prompt = negativePrompt
    explicitParamKeys.add('negative_prompt')
  }
  const steps = getOptionalNumeric(args, 'steps')
  if (steps !== undefined) {
    params.steps = steps
    explicitParamKeys.add('steps')
  }
  const seed = getOptionalNumeric(args, 'seed')
  if (seed !== undefined) {
    params.seed = seed
    explicitParamKeys.add('seed')
  }

  return {
    prompt,
    refIds,
    jobType: refIds.length > 0 ? 'image_edit' : 'image',
    timeoutMs: getOptionalNumeric(args, 'timeout_ms') ?? 180_000,
    params,
    explicitParamKeys,
    defaultParamKeys,
  }
}

function buildVideoRequest(args: Record<string, unknown>): BuiltGenerationRequest {
  const prompt = promptArg(args)
  const refIds = resourceIds(args.input_resource_ids) ?? resourceIds(args.reference_resource_ids) ?? []
  const params = { ...extraParamsArg(args.extra_params) }
  const explicitParamKeys = new Set(Object.keys(params))
  const defaultParamKeys = new Set<string>()
  assignStringParam(args, params, explicitParamKeys, 'aspect_ratio')
  assignDefaultParam(params, defaultParamKeys, 'aspect_ratio', '16:9')
  const duration = getOptionalNumeric(args, 'duration')
  if (duration !== undefined) {
    params.duration = duration
    explicitParamKeys.add('duration')
  } else {
    assignDefaultParam(params, defaultParamKeys, 'duration', 5)
  }
  const quality = getOptionalString(args, 'quality')
  if (quality) {
    params.quality = quality
    explicitParamKeys.add('quality')
  }
  const fps = getOptionalNumeric(args, 'fps')
  if (fps !== undefined) {
    params.fps = fps
    explicitParamKeys.add('fps')
  }
  const seed = getOptionalNumeric(args, 'seed')
  if (seed !== undefined) {
    params.seed = seed
    explicitParamKeys.add('seed')
  }

  return {
    prompt,
    refIds,
    jobType: refIds.length > 0 ? 'video_i2v' : 'video',
    timeoutMs: getOptionalNumeric(args, 'timeout_ms') ?? 600_000,
    params,
    explicitParamKeys,
    defaultParamKeys,
  }
}

async function resolveModelSelection(args: Record<string, unknown>, primaryCapability: string, fallbackCapability: string): Promise<ModelSelection> {
  const explicit = getOptionalString(args, 'model_id')
  if (explicit) {
    const models = await modelsForCapabilities([primaryCapability, fallbackCapability])
    return { modelId: explicit, model: models.find((model) => modelMatchesPublicId(model, explicit)) }
  }

  const primary = await modelsForCapability(primaryCapability)
  const fallback = primary.length > 0 ? primary : await modelsForCapability(fallbackCapability)
  const modelId = modelPublicId(fallback[0])
  if (!modelId) throw new Error(`No enabled generation model is configured for ${primaryCapability}`)
  return { modelId, model: isRecord(fallback[0]) ? fallback[0] : undefined }
}

async function modelsForCapability(capability: string): Promise<unknown[]> {
  const result = await listModels({ capability })
  return isRecord(result) && Array.isArray(result.models) ? result.models : []
}

async function modelsForCapabilities(capabilities: string[]): Promise<Record<string, unknown>[]> {
  const byId = new Map<string, Record<string, unknown>>()
  for (const capability of Array.from(new Set(capabilities))) {
    for (const model of await modelsForCapability(capability)) {
      if (!isRecord(model)) continue
      const key = String(idField(model.id) ?? idField(model.ID) ?? modelPublicId(model) ?? byId.size)
      if (!byId.has(key)) byId.set(key, model)
    }
  }
  return Array.from(byId.values())
}

async function submitGenerationJob(
  args: Record<string, unknown>,
  selection: ModelSelection,
  built: BuiltGenerationRequest,
  featureKey: string,
): Promise<{ job: Record<string, unknown>; paramAudit: ParamAuditItem[] }> {
  const prepared = prepareGenerationParams(built, selection.model, parameterModeArg(args))
  const body: Record<string, unknown> = {
    model_id: selection.modelId,
    job_type: built.jobType,
    feature_key: featureKey,
    prompt: built.prompt,
    input_resource_ids: built.refIds,
    extra_params: JSON.stringify(prepared.extraParams),
  }
  if (prepared.aspectRatio !== undefined) body.aspect_ratio = prepared.aspectRatio
  if (prepared.duration !== undefined) body.duration = prepared.duration
  const title = getOptionalString(args, 'title')
  if (title) body.title = title
  body.project_id = resolveMCPRequiredProjectId(args)

  const job = await backendPost('/jobs', body)
  if (!isRecord(job)) throw new Error('Generation job create returned an invalid response')
  return { job: normalizeJob(job), paramAudit: prepared.audit }
}

async function getGenerationJob(jobId: number): Promise<Record<string, unknown>> {
  const job = await backendGet(`/jobs/${jobId}`)
  if (!isRecord(job)) throw new Error('Generation job get returned an invalid response')
  return normalizeJob(job)
}

function generationSubmitResult(kind: 'image' | 'video', job: Record<string, unknown>, monitorTool: string, paramAudit: ParamAuditItem[] = []): Record<string, unknown> {
  const jobId = idField(job.id) ?? idField(job.ID)
  if (jobId === undefined) throw new Error('Generation job create did not return a valid job id')
  return {
    status: 'submitted',
    terminal: false,
    jobId,
    job_id: jobId,
    monitor: { tool: monitorTool, args: { jobId } },
    message: `${kind === 'image' ? 'Image' : 'Video'} generation job submitted (Job #${jobId})`,
    job,
    ...(paramAudit.length > 0 ? { param_audit: paramAudit, paramAudit } : {}),
  }
}

function generationJobGetResult(kind: 'image' | 'video', job: Record<string, unknown>): Record<string, unknown> {
  const jobId = idField(job.id) ?? idField(job.ID)
  if (jobId === undefined) throw new Error('Generation job response does not include a valid job id')
  const status = stringField(job.status) ?? 'unknown'
  const outputResourceIds = outputResourceIdsFromJob(job)
  return {
    status,
    terminal: isTerminalStatus(status),
    jobId,
    job_id: jobId,
    outputResourceIds,
    output_resource_ids: outputResourceIds,
    ...(outputResourceIds[0] ? { output_resource_id: outputResourceIds[0], outputResourceId: outputResourceIds[0] } : {}),
    message: `${kind === 'image' ? 'Image' : 'Video'} generation job #${jobId} status: ${status}`,
    job,
  }
}

async function getGenerationJobs(kind: 'image' | 'video', args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const jobIds = normalizedJobIds(args)
  const items: Record<string, unknown>[] = []
  for (let index = 0; index < jobIds.length; index += 1) {
    const jobId = jobIds[index]!
    try {
      const result = generationJobGetResult(kind, await getGenerationJob(jobId))
      items.push({
        index,
        status: 'loaded',
        jobId,
        job_id: jobId,
        terminal: result.terminal,
        outputResourceIds: result.outputResourceIds,
        output_resource_ids: result.output_resource_ids,
        result,
      })
    } catch (error) {
      items.push({
        index,
        status: 'error',
        jobId,
        job_id: jobId,
        terminal: true,
        error: errorMessage(error),
      })
    }
  }
  const successItems = items.filter((item) => item.status !== 'error')
  const failedItems = items.filter((item) => item.status === 'error')
  const terminalCount = items.filter((item) => item.terminal === true).length
  const outputResourceIds = Array.from(new Set(successItems.flatMap((item) => numericList(item.output_resource_ids))))
  return {
    status: failedItems.length === 0 ? 'loaded' : successItems.length > 0 ? 'partial_error' : 'error',
    total: jobIds.length,
    success_count: successItems.length,
    failed_count: failedItems.length,
    terminal_count: terminalCount,
    all_terminal: terminalCount === jobIds.length,
    output_resource_ids: outputResourceIds,
    outputResourceIds,
    items,
    message: `${successItems.length}/${jobIds.length} ${kind} generation job(s) loaded.`,
  }
}

function normalizeJob(job: Record<string, unknown>): Record<string, unknown> {
  const outputResourceIds = outputResourceIdsFromJob(job)
  return {
    ...job,
    ...(outputResourceIds.length > 0 ? { outputResourceIds, output_resource_ids: outputResourceIds } : {}),
  }
}

function outputResourceIdsFromJob(job: Record<string, unknown>): number[] {
  const ids: number[] = []
  appendId(ids, job.output_resource_id)
  appendId(ids, job.outputResourceId)
  appendId(ids, isRecord(job.output_resource) ? job.output_resource.id ?? job.output_resource.ID : undefined)
  appendId(ids, isRecord(job.outputResource) ? job.outputResource.id ?? job.outputResource.ID : undefined)
  appendIds(ids, job.output_resource_ids)
  appendIds(ids, job.outputResourceIds)
  return Array.from(new Set(ids))
}

function promptArg(args: Record<string, unknown>): string {
  const prompt = getOptionalString(args, 'prompt')
  if (!prompt) throw new Error('prompt is required')
  return prompt
}

function resourceIds(value: unknown): number[] | undefined {
  if (typeof value === 'string') {
    const ids = value.split(',').map((item) => Number(item.trim()))
    return positiveIntegerIds(ids)
  }
  const values = numericValues(value)
  return values ? positiveIntegerIds(values) : undefined
}

function positiveIntegerIds(values: number[]): number[] {
  return Array.from(new Set(values.filter((id) => Number.isFinite(id) && id > 0).map((id) => Math.floor(id))))
}

function extraParamsArg(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return { ...value }
  if (typeof value === 'string' && value.trim()) {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) throw new Error('extra_params must be an object')
    return { ...parsed }
  }
  return {}
}

function assignStringParam(args: Record<string, unknown>, params: Record<string, unknown>, explicitParamKeys: Set<string>, key: string): void {
  const value = getOptionalString(args, key)
  if (!value) return
  params[key] = value
  explicitParamKeys.add(key)
}

function assignDefaultParam(params: Record<string, unknown>, defaultParamKeys: Set<string>, key: string, value: unknown): void {
  if (params[key] !== undefined && params[key] !== null && params[key] !== '') return
  params[key] = value
  defaultParamKeys.add(key)
}

function parameterModeArg(args: Record<string, unknown>): ParameterMode {
  const raw = getOptionalString(args, 'parameter_mode') ?? getOptionalString(args, 'param_mode')
  return raw === 'strict' ? 'strict' : 'compatible'
}

function prepareGenerationParams(
  built: BuiltGenerationRequest,
  model: Record<string, unknown> | undefined,
  mode: ParameterMode,
): PreparedGenerationParams {
  const supported = supportedParamMap(model)
  const hasContract = supported !== undefined
  const output: Record<string, unknown> = {}
  const audit: ParamAuditItem[] = []
  const pending = { ...built.params }

  if (
    hasContract &&
    mode === 'compatible' &&
    !supported.has('aspect_ratio') &&
    supported.has('image_size') &&
    pending.aspect_ratio !== undefined &&
    (pending.image_size === undefined || built.defaultParamKeys.has('image_size'))
  ) {
    const mapped = aspectRatioToImageSize(String(pending.aspect_ratio), supported.get('image_size'))
    if (mapped) {
      pending.image_size = mapped
      built.defaultParamKeys.delete('image_size')
      audit.push({
        key: 'aspect_ratio',
        value: pending.aspect_ratio,
        reason: 'mapped_unsupported_aspect_ratio_to_image_size',
        source: paramSource(built, 'aspect_ratio'),
        mapped_to: 'image_size',
        mapped_value: mapped,
      })
    }
  }

  for (const [key, value] of Object.entries(pending)) {
    const source = paramSource(built, key)
    if (value === undefined || value === null || value === '') continue

    const paramDef = hasContract ? supported.get(key) : undefined
    if (hasContract && !paramDef) {
      if (mode === 'strict' && source === 'explicit') {
        throw unsupportedMCPParamError(key, model, supported)
      }
      audit.push({ key, value, reason: 'dropped_unsupported_parameter', source })
      continue
    }

    const normalized = normalizeParamValue(value, paramDef)
    const checked = hasContract && paramDef ? compatibleParamValue(key, normalized, paramDef, source, mode, model, supported, audit) : normalized
    if (checked === undefined) continue
    output[key] = checked
  }

  const { aspect_ratio, duration, ...extraParams } = output
  return {
    aspectRatio: typeof aspect_ratio === 'string' ? aspect_ratio : undefined,
    duration: numericDuration(duration),
    extraParams,
    audit,
  }
}

function compatibleParamValue(
  key: string,
  value: unknown,
  paramDef: Record<string, unknown>,
  source: 'explicit' | 'default' | 'compatible',
  mode: ParameterMode,
  model: Record<string, unknown> | undefined,
  supported: Map<string, Record<string, unknown>>,
  audit: ParamAuditItem[],
): unknown {
  const options = Array.isArray(paramDef.options) ? paramDef.options.filter((item): item is string => typeof item === 'string') : []
  if (options.length > 0 && typeof value === 'string' && !options.includes(value)) {
    if (mode === 'strict' && source === 'explicit') {
      throw invalidMCPParamOptionError(key, value, model, options)
    }
    const fallback = typeof paramDef.default === 'string' && options.includes(paramDef.default) ? paramDef.default : options[0]
    audit.push({ key, value, reason: 'replaced_invalid_option', source, mapped_value: fallback })
    return fallback
  }

  const type = typeof paramDef.type === 'string' ? paramDef.type : ''
  if (type === 'number' && typeof value === 'number') {
    const min = typeof paramDef.min === 'number' ? paramDef.min : undefined
    const max = typeof paramDef.max === 'number' ? paramDef.max : undefined
    const clamped = Math.min(max ?? value, Math.max(min ?? value, value))
    if (clamped !== value) {
      if (mode === 'strict' && source === 'explicit') {
        throw new Error(`parameter "${key}" is outside the supported range for model "${modelDisplay(model)}"`)
      }
      audit.push({ key, value, reason: 'clamped_numeric_range', source, mapped_value: clamped })
    }
    return clamped
  }

  return value
}

function supportedParamMap(model: Record<string, unknown> | undefined): Map<string, Record<string, unknown>> | undefined {
  if (!model) return undefined
  const params = Array.isArray(model.supported_params) ? model.supported_params : undefined
  if (params) {
    const out = new Map<string, Record<string, unknown>>()
    for (const item of params) {
      if (!isRecord(item)) continue
      const key = stringField(item.key)
      if (key) out.set(key, item)
    }
    return out
  }
  if (Array.isArray(model.supported_param_keys)) {
    return new Map(model.supported_param_keys.flatMap((item) => {
      const key = stringField(item)
      return key ? [[key, { key }]] : []
    }))
  }
  const schema = isRecord(model.params_schema) ? model.params_schema : undefined
  const properties = isRecord(schema?.properties) ? schema.properties : undefined
  if (properties) {
    return new Map(Object.keys(properties).map((key) => [key, { key, ...(isRecord(properties[key]) ? properties[key] : {}) }]))
  }
  return undefined
}

function aspectRatioToImageSize(aspectRatio: string, imageSizeParam: Record<string, unknown> | undefined): string | undefined {
  const options = Array.isArray(imageSizeParam?.options) ? imageSizeParam.options.filter((item): item is string => typeof item === 'string') : []
  const byRatio: Record<string, string[]> = {
    '1:1': ['2048x2048', '1024x1024', '4096x4096'],
    '4:3': ['2304x1728'],
    '3:4': ['1728x2304'],
    '16:9': ['2848x1600', '1792x1024', '1536x1024', '1280x720'],
    '9:16': ['1600x2848', '1024x1792', '1024x1536', '720x1280'],
  }
  for (const candidate of byRatio[aspectRatio] ?? []) {
    if (options.includes(candidate)) return candidate
  }
  return undefined
}

function normalizeParamValue(value: unknown, paramDef: Record<string, unknown> | undefined): unknown {
  if (!paramDef) return value
  if (paramDef.type === 'number' && typeof value === 'string' && value.trim()) {
    const number = Number(value)
    return Number.isFinite(number) ? number : value
  }
  if (paramDef.type === 'boolean' && typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return value
}

function numericDuration(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function paramSource(built: BuiltGenerationRequest, key: string): 'explicit' | 'default' | 'compatible' {
  if (built.explicitParamKeys.has(key)) return 'explicit'
  if (built.defaultParamKeys.has(key)) return 'default'
  return 'compatible'
}

function unsupportedMCPParamError(key: string, model: Record<string, unknown> | undefined, supported: Map<string, Record<string, unknown>>): Error {
  const allowed = Array.from(supported.keys()).sort()
  const err = new Error(`parameter "${key}" is not supported by model "${modelDisplay(model)}"; supported parameters: ${allowed.join(', ') || '(none)'}`)
  Object.assign(err, {
    code: 'UNSUPPORTED_PARAMETER',
    field: key,
    supported_params: allowed,
  })
  return err
}

function invalidMCPParamOptionError(key: string, value: unknown, model: Record<string, unknown> | undefined, options: string[]): Error {
  const err = new Error(`parameter "${key}" value ${JSON.stringify(value)} is not supported by model "${modelDisplay(model)}"; allowed values: ${options.join(', ')}`)
  Object.assign(err, {
    code: 'INVALID_PARAMETER_OPTION',
    field: key,
    allowed_values: options,
  })
  return err
}

function normalizedJobId(args: Record<string, unknown>): number {
  const jobId = getOptionalNumeric(args, 'jobId') ?? getOptionalNumeric(args, 'job_id')
  if (jobId === undefined || !Number.isInteger(jobId) || jobId <= 0) throw new Error('jobId must be a positive integer')
  return jobId
}

function normalizedJobIds(args: Record<string, unknown>): number[] {
  const rawIds = Array.isArray(args.jobIds)
    ? args.jobIds
    : Array.isArray(args.job_ids)
      ? args.job_ids
      : undefined
  const ids = rawIds
    ? rawIds.map((value) => idField(value)).filter((value): value is number => value !== undefined)
    : Array.isArray(args.items)
      ? args.items.map((item) => isRecord(item) ? normalizedJobId(item) : undefined).filter((value): value is number => value !== undefined)
      : []
  const unique = Array.from(new Set(ids))
  if (unique.length === 0) throw new Error('jobIds must contain at least one positive integer')
  return unique
}

function modelPublicId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return stringField(value.model_id) ?? stringField(value.logical_model_id) ?? stringField(value.model_def_id)
}

function modelMatchesPublicId(model: Record<string, unknown>, publicId: string): boolean {
  const ids = [
    modelPublicId(model),
    stringField(model.model_id),
    stringField(model.logical_model_id),
    stringField(model.model_def_id),
    idField(model.id) !== undefined ? `backend.model.${idField(model.id)}` : undefined,
    idField(model.ID) !== undefined ? `backend.model.${idField(model.ID)}` : undefined,
    idField(model.id) !== undefined ? `model_config:${idField(model.id)}` : undefined,
    idField(model.ID) !== undefined ? `model_config:${idField(model.ID)}` : undefined,
  ]
  return ids.includes(publicId)
}

function modelDisplay(model: Record<string, unknown> | undefined): string {
  return stringField(model?.display_name)
    ?? stringField(model?.short_name)
    ?? (model ? modelPublicId(model) : undefined)
    ?? 'selected model'
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idField(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function appendId(ids: number[], value: unknown): void {
  const id = idField(value)
  if (id !== undefined) ids.push(id)
}

function appendIds(ids: number[], value: unknown): void {
  if (!Array.isArray(value)) return
  for (const item of value) appendId(ids, item)
}

function numericList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map(idField).filter((item): item is number => item !== undefined)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.trim().toLowerCase())
}

const TERMINAL_STATUSES = new Set(['succeeded', 'succeed', 'success', 'completed', 'complete', 'done', 'finished', 'failed', 'failure', 'error', 'cancelled', 'canceled'])

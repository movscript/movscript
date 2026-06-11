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
  aspectRatio: string
  duration?: number
  timeoutMs: number
  extraParams: Record<string, unknown>
}

export async function generateImage(args: Record<string, unknown>): Promise<unknown> {
  const built = buildImageRequest(args)
  const modelId = await resolveModelId(args, built.jobType, built.jobType === 'image_edit' ? 'image' : 'image_edit')
  const job = await submitGenerationJob(args, modelId, built, 'electron.generation.image')
  return generationSubmitResult('image', job, 'generation_image_job_get')
}

export async function getImageGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  return generationJobGetResult('image', await getGenerationJob(normalizedJobId(args)))
}

export async function getImageGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  return getGenerationJobs('image', args)
}

export async function generateVideo(args: Record<string, unknown>): Promise<unknown> {
  const built = buildVideoRequest(args)
  const modelId = await resolveModelId(args, built.jobType, 'video')
  const job = await submitGenerationJob(args, modelId, built, 'electron.generation.video')
  return generationSubmitResult('video', job, 'generation_video_job_get')
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
  const extraParams: Record<string, unknown> = {
    image_size: getOptionalString(args, 'image_size') ?? '1024x1024',
    ...extraParamsArg(args.extra_params),
  }
  const quality = getOptionalString(args, 'quality')
  if (quality) extraParams.quality = quality
  const negativePrompt = getOptionalString(args, 'negative_prompt')
  if (negativePrompt) extraParams.negative_prompt = negativePrompt
  const steps = getOptionalNumeric(args, 'steps')
  if (steps !== undefined) extraParams.steps = steps
  const seed = getOptionalNumeric(args, 'seed')
  if (seed !== undefined) extraParams.seed = seed

  return {
    prompt,
    refIds,
    jobType: refIds.length > 0 ? 'image_edit' : 'image',
    aspectRatio: getOptionalString(args, 'aspect_ratio') ?? '1:1',
    timeoutMs: getOptionalNumeric(args, 'timeout_ms') ?? 180_000,
    extraParams,
  }
}

function buildVideoRequest(args: Record<string, unknown>): BuiltGenerationRequest {
  const prompt = promptArg(args)
  const refIds = resourceIds(args.input_resource_ids) ?? resourceIds(args.reference_resource_ids) ?? []
  const extraParams = { ...extraParamsArg(args.extra_params) }
  const quality = getOptionalString(args, 'quality')
  if (quality) extraParams.quality = quality
  const fps = getOptionalNumeric(args, 'fps')
  if (fps !== undefined) extraParams.fps = fps
  const seed = getOptionalNumeric(args, 'seed')
  if (seed !== undefined) extraParams.seed = seed

  return {
    prompt,
    refIds,
    jobType: refIds.length > 0 ? 'video_i2v' : 'video',
    aspectRatio: getOptionalString(args, 'aspect_ratio') ?? '16:9',
    duration: getOptionalNumeric(args, 'duration') ?? 5,
    timeoutMs: getOptionalNumeric(args, 'timeout_ms') ?? 600_000,
    extraParams,
  }
}

async function resolveModelId(args: Record<string, unknown>, primaryCapability: string, fallbackCapability: string): Promise<string> {
  const explicit = getOptionalString(args, 'model_id')
  if (explicit) return explicit

  const primary = await modelsForCapability(primaryCapability)
  const fallback = primary.length > 0 ? primary : await modelsForCapability(fallbackCapability)
  const modelId = modelPublicId(fallback[0])
  if (!modelId) throw new Error(`No enabled generation model is configured for ${primaryCapability}`)
  return modelId
}

async function modelsForCapability(capability: string): Promise<unknown[]> {
  const result = await listModels({ capability })
  return isRecord(result) && Array.isArray(result.models) ? result.models : []
}

async function submitGenerationJob(
  args: Record<string, unknown>,
  modelId: string,
  built: BuiltGenerationRequest,
  featureKey: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    model_id: modelId,
    job_type: built.jobType,
    feature_key: featureKey,
    prompt: built.prompt,
    input_resource_ids: built.refIds,
    aspect_ratio: built.aspectRatio,
    extra_params: JSON.stringify(built.extraParams),
  }
  const title = getOptionalString(args, 'title')
  if (title) body.title = title
  if (built.duration !== undefined) body.duration = built.duration
  body.project_id = resolveMCPRequiredProjectId(args)

  const job = await backendPost('/jobs', body)
  if (!isRecord(job)) throw new Error('Generation job create returned an invalid response')
  return normalizeJob(job)
}

async function getGenerationJob(jobId: number): Promise<Record<string, unknown>> {
  const job = await backendGet(`/jobs/${jobId}`)
  if (!isRecord(job)) throw new Error('Generation job get returned an invalid response')
  return normalizeJob(job)
}

function generationSubmitResult(kind: 'image' | 'video', job: Record<string, unknown>, monitorTool: string): Record<string, unknown> {
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
  return stringField(value.model_id) ?? stringField(value.logical_model_id)
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

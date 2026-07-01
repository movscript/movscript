import {
  formatResourceMention,
  parseResourceMentions,
  resourceIdsFromMentions,
} from '@movscript/workspace'
import { type GenerationResolvedJobType } from './jobDecision.js'
import {
  buildGenerationJobPayload,
  type GenerationIntentPayload,
  type GenerationJobPayloadParamDef,
  type GenerationParamValue,
  type GenerationReferenceAssetPayload,
} from './jobPayload.js'
import { completeGenerationReferenceAssets } from './promptComposer.js'

export type ContentUnitGenerationOutputKind = 'image' | 'video'
export type ContentUnitGenerationCandidateStatus =
  | 'queued'
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'cancelled'
  | 'imported'

export interface ContentUnitGenerationRequestInput {
  contentUnitId: string | number
  outputKind: ContentUnitGenerationOutputKind
  compiledPrompt: Record<string, unknown>
  modelId: string
  params?: Record<string, GenerationParamValue>
  supportedParams?: readonly GenerationJobPayloadParamDef[] | null
  modelParams?: Record<string, unknown>
  additionalInputResourceIds?: number[]
  preferredVideoJobType?: unknown
  generationIntent?: GenerationIntentPayload | null
  paramAudit?: unknown[]
}

export interface ContentUnitGenerationRequest {
  contentUnitId: string | number
  outputKind: ContentUnitGenerationOutputKind
  promptText: string
  inputResourceIds: number[]
  jobType: GenerationResolvedJobType
  generationIntent: GenerationIntentPayload
  featureKey: string
  params: Record<string, GenerationParamValue>
  promptSnapshot: Record<string, unknown>
}

export interface ContentUnitGenerationJobPayloadInput extends ContentUnitGenerationRequestInput {
  projectId?: number | string
}

export interface ContentUnitGenerationJobPayloadResult extends ContentUnitGenerationRequest {
  payload: Record<string, unknown>
}

export interface ContentUnitGenerationJobLike {
  ID?: number
  id?: number
  status?: string
  job_type?: string
  model_id?: string
  output_resource_id?: number
  output_resource_ids?: number[]
  CreatedAt?: string
  created_at?: string
}

export interface ContentUnitGenerationCandidateCreatePlan {
  contentUnitId: string
  candidateId: string
  source: 'ai_generate'
  status: ContentUnitGenerationCandidateStatus
  producer: Record<string, unknown>
  outputs: Array<{
    kind: ContentUnitGenerationOutputKind
    resource_id: number
    metadata?: Record<string, unknown>
  }>
  promptSnapshot: Record<string, unknown>
  createdAt: string
}

type PromptReferenceAssetIntent = {
  reference_id?: string
  source_kind?: string
  source_id?: string | number
  source_ref?: string | number
  role?: string
  media_type?: string
  resource_id: number
}

export function buildContentUnitGenerationRequest(
  input: ContentUnitGenerationRequestInput,
): ContentUnitGenerationRequest {
  const promptText = compiledContentUnitGenerationPromptText(input.compiledPrompt)
  const inputResourceIds = positiveIntegerIds([
    ...compiledContentUnitGenerationPromptResourceIds(input.compiledPrompt),
    ...(input.additionalInputResourceIds ?? []),
  ])
  const generationIntent = requiredContentUnitGenerationIntent(input.generationIntent)
  const jobType = generationExecutionJobTypeForIntent(generationIntent, input.outputKind)
  const params = contentUnitGenerationParams(input.outputKind, input.compiledPrompt, input.params)
  const promptSnapshot = buildContentUnitGenerationPromptSnapshot({
    contentUnitId: input.contentUnitId,
    outputKind: input.outputKind,
    modelId: input.modelId,
    compiledPrompt: input.compiledPrompt,
    resourceIds: inputResourceIds,
    paramAudit: input.paramAudit,
    modelParams: input.modelParams ?? params,
  })

  return {
    contentUnitId: input.contentUnitId,
    outputKind: input.outputKind,
    promptText,
    inputResourceIds,
    jobType,
    generationIntent,
    featureKey: contentUnitGenerationFeatureKey(input.outputKind),
    params,
    promptSnapshot,
  }
}

export function generationExecutionJobTypeForIntent(
  intent: Pick<GenerationIntentPayload, 'capability' | 'operation'> | undefined,
  fallbackOutputKind: ContentUnitGenerationOutputKind | 'audio' | 'text',
): GenerationResolvedJobType {
  switch (intent?.capability?.trim()) {
    case 'video_generation':
      return 'video'
    case 'image_generation':
      return 'image'
    case 'audio_generation':
      return 'audio'
    default:
      return fallbackOutputKind
  }
}

export function buildContentUnitGenerationJobPayload(
  input: ContentUnitGenerationJobPayloadInput,
): ContentUnitGenerationJobPayloadResult {
  const request = buildContentUnitGenerationRequest(input)
  return {
    ...request,
    payload: {
      ...buildGenerationJobPayload({
        modelId: input.modelId,
        jobType: request.jobType,
        generationIntent: request.generationIntent,
        title: contentUnitGenerationJobTitle(input.outputKind),
        prompt: request.promptText,
        params: request.params,
        supportedParams: input.supportedParams,
        inputResourceIds: request.inputResourceIds,
        sourceKey: request.featureKey,
      }),
      ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
    },
  }
}

function requiredContentUnitGenerationIntent(intent: GenerationIntentPayload | null | undefined): GenerationIntentPayload {
  if (!intent?.capability?.trim() || !intent.operation?.trim()) {
    throw new Error('generationIntent with capability and operation is required for content-unit generation')
  }
  return intent
}

export function buildContentUnitGenerationPendingCandidate(
  input: {
    contentUnitId: string | number
    outputKind: ContentUnitGenerationOutputKind
    candidateId: string | number
    job: ContentUnitGenerationJobLike
    modelId: string
    modelParams?: Record<string, unknown>
    promptSnapshot: Record<string, unknown>
    createdAt?: string
  },
): ContentUnitGenerationCandidateCreatePlan {
  const jobId = contentUnitGenerationJobId(input.job)
  const createdAt = input.createdAt ?? stringField(input.job.CreatedAt) ?? stringField(input.job.created_at) ?? new Date().toISOString()
  return {
    contentUnitId: String(input.contentUnitId),
    candidateId: String(input.candidateId),
    source: 'ai_generate',
    status: contentUnitGenerationCandidateStatus(input.job.status),
    producer: {
      kind: 'generation',
      tool: contentUnitGenerationToolName(input.outputKind),
      job_id: jobId,
      model_id: input.modelId,
      job_type: input.job.job_type,
      ...(nonEmptyRecord(input.modelParams ?? recordField(input.promptSnapshot.model_params)) ? { model_params: nonEmptyRecord(input.modelParams ?? recordField(input.promptSnapshot.model_params)) } : {}),
    },
    outputs: [],
    promptSnapshot: {
      ...input.promptSnapshot,
      input_hash: `job:${String(jobId)}`,
      job_id: jobId,
    },
    createdAt,
  }
}

export function buildContentUnitGenerationOutputCandidate(
  input: {
    contentUnitId: string | number
    outputKind: ContentUnitGenerationOutputKind
    job: ContentUnitGenerationJobLike
    resourceId: number
    promptSnapshot?: Record<string, unknown>
    modelId?: string
    modelParams?: Record<string, unknown>
    candidateId?: string | number
  },
): ContentUnitGenerationCandidateCreatePlan {
  const jobId = contentUnitGenerationJobId(input.job)
  const candidateId = input.candidateId ?? contentUnitGenerationCandidateId(input.outputKind, jobId, input.resourceId)
  const promptSnapshot = input.promptSnapshot ?? {}
  const modelId = input.modelId ?? stringField(input.job.model_id) ?? stringField(promptSnapshot.model_id)
  const modelParams = nonEmptyRecord(input.modelParams ?? recordField(promptSnapshot.model_params))
  return {
    contentUnitId: String(input.contentUnitId),
    candidateId: String(candidateId),
    source: 'ai_generate',
    status: 'succeeded',
    producer: {
      kind: 'generation',
      tool: contentUnitGenerationToolName(input.outputKind),
      job_id: jobId,
      ...(modelId ? { model_id: modelId } : {}),
      ...(stringField(input.job.job_type) ? { job_type: stringField(input.job.job_type) } : {}),
      ...(modelParams ? { model_params: modelParams } : {}),
    },
    outputs: [{
      kind: input.outputKind,
      resource_id: input.resourceId,
      metadata: {
        job_id: jobId,
        ...(modelId ? { model_id: modelId } : {}),
        ...(stringField(input.job.job_type) ? { job_type: stringField(input.job.job_type) } : {}),
        tool: contentUnitGenerationMonitorToolName(input.outputKind),
      },
    }],
    promptSnapshot,
    createdAt: stringField(input.job.CreatedAt) ?? stringField(input.job.created_at) ?? new Date().toISOString(),
  }
}

export function contentUnitGenerationCandidateId(
  outputKind: ContentUnitGenerationOutputKind,
  jobId: number,
  resourceId: number,
): string {
  return `gen_${outputKind}_${String(jobId)}_${String(resourceId)}`
}

export function compiledContentUnitGenerationPromptText(prompt: Record<string, unknown>): string {
  const text = stringField(prompt.text)
  if (text) return normalizeCompiledPromptResourceMentions(text)
  throw new Error('compiled content unit prompt has no text')
}

function normalizeCompiledPromptResourceMentions(text: string): string {
  const mentions = parseResourceMentions(text)
  if (mentions.length === 0) return text
  let normalized = ''
  let lastIndex = 0
  for (const mention of mentions) {
    normalized += text.slice(lastIndex, mention.index)
    normalized += formatResourceMention(mention.id, {
      ...(mention.mediaType ? { mediaType: mention.mediaType } : {}),
      ...(mention.role ? { role: mention.role } : {}),
    })
    lastIndex = mention.index + mention.token.length
  }
  return normalized + text.slice(lastIndex)
}

export function compiledContentUnitGenerationPromptResourceIds(prompt: Record<string, unknown>): number[] {
  return positiveIntegerIds([
    ...resourceIdsFromMentions(stringField(prompt.text)),
    ...resourceIdsFromMentions(stringField(prompt.negative_text)),
    ...numericList(prompt.resource_ids),
    ...numericList(prompt.resourceIds),
    ...numericList(prompt.style_reference_resource_ids),
    ...numericList(prompt.styleReferenceResourceIds),
  ])
}

export function compiledContentUnitGenerationPromptReferenceAssets(prompt: Record<string, unknown>): GenerationReferenceAssetPayload[] {
  const declared = referenceAssetsFromValue(prompt.reference_assets ?? prompt.referenceAssets)
  const mentioned = [
    ...referenceAssetsFromMentions(stringField(prompt.text)),
    ...referenceAssetsFromMentions(stringField(prompt.negative_text)),
    ...referenceAssetsFromMentions(stringField(prompt.notes)),
  ]
  const all = [...declared, ...mentioned]
  const seen = new Set<number>()
  const deduped = all.filter((asset) => {
    if (seen.has(asset.resource_id)) return false
    seen.add(asset.resource_id)
    return true
  })
  return completeGenerationReferenceAssets({
    existing: deduped,
    inputResourceIds: compiledContentUnitGenerationPromptResourceIds(prompt),
  })
}

export function buildContentUnitGenerationPromptSnapshot(input: {
  contentUnitId: string | number
  outputKind: ContentUnitGenerationOutputKind
  modelId: string
  compiledPrompt: Record<string, unknown>
  resourceIds?: number[]
  paramAudit?: unknown[]
  modelParams?: Record<string, unknown>
}): Record<string, unknown> {
  const resourceIds = input.resourceIds ?? compiledContentUnitGenerationPromptResourceIds(input.compiledPrompt)
  const modelParams = nonEmptyRecord(input.modelParams)
  const referenceAssets = compiledContentUnitGenerationPromptReferenceAssets(input.compiledPrompt)
  return {
    schema: 'movscript.content_unit_generation_prompt_snapshot.v1',
    content_unit_id: input.contentUnitId,
    output_kind: input.outputKind,
    model_id: input.modelId,
    compiled_prompt: input.compiledPrompt,
    resource_ids: resourceIds,
    ...(referenceAssets.length > 0 ? { reference_assets: referenceAssets } : {}),
    ...(modelParams ? { model_params: modelParams } : {}),
    ...(Array.isArray(input.paramAudit) && input.paramAudit.length > 0 ? { param_audit: input.paramAudit } : {}),
  }
}

export function contentUnitGenerationFeatureKey(outputKind: ContentUnitGenerationOutputKind): string {
  return outputKind === 'image'
    ? 'electron.generation.content_unit.image'
    : 'electron.generation.content_unit.video'
}

export function contentUnitGenerationMonitorToolName(outputKind: ContentUnitGenerationOutputKind): string {
  return 'generation_job_get'
}

export function contentUnitGenerationSystemMonitorToolName(outputKind: ContentUnitGenerationOutputKind): string {
  return contentUnitGenerationMonitorToolName(outputKind)
}

export function contentUnitGenerationToolName(outputKind: ContentUnitGenerationOutputKind): string {
  return 'generation_submit'
}

function contentUnitGenerationJobTitle(outputKind: ContentUnitGenerationOutputKind): string {
  return outputKind === 'image' ? 'Content unit image generation' : 'Content unit video generation'
}

function contentUnitGenerationParams(
  outputKind: ContentUnitGenerationOutputKind,
  prompt: Record<string, unknown>,
  params: Record<string, GenerationParamValue> = {},
): Record<string, GenerationParamValue> {
  const next: Record<string, GenerationParamValue> = { ...params }
  if (outputKind === 'image') {
    if (next.aspect_ratio === undefined) next.aspect_ratio = '1:1'
    const negativePrompt = stringField(prompt.negative_text)
    if (negativePrompt && next.negative_prompt === undefined) next.negative_prompt = negativePrompt
  } else {
    if (next.aspect_ratio === undefined) next.aspect_ratio = '16:9'
    if (next.duration === undefined) next.duration = 5
  }
  return next
}

function contentUnitGenerationJobId(job: ContentUnitGenerationJobLike): number {
  const id = numericId(job.ID) ?? numericId(job.id)
  if (id !== undefined) return id
  throw new Error('Generation job response does not include a valid job id')
}

function contentUnitGenerationCandidateStatus(value: unknown): ContentUnitGenerationCandidateStatus {
  if (value === 'pending' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'cancelled') return value
  if (value === 'canceled') return 'canceled'
  if (value === 'queued' || value === 'imported') return value
  return 'running'
}

function referenceAssetsFromValue(value: unknown): PromptReferenceAssetIntent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): PromptReferenceAssetIntent[] => {
    const record = recordField(item)
    if (!record) return []
    const resourceId = numericId(record.resource_id ?? record.resourceId ?? record.id)
    if (resourceId === undefined) return []
    const role = stringField(record.role)
    const mediaType = stringField(record.media_type ?? record.mediaType)
    const referenceId = stringField(record.reference_id ?? record.referenceId)
    const sourceKind = stringField(record.source_kind ?? record.sourceKind)
    const sourceId = stringOrNumberField(record.source_id ?? record.sourceId)
    const sourceRef = stringOrNumberField(record.source_ref ?? record.sourceRef)
    return [{
      resource_id: resourceId,
      ...(referenceId ? { reference_id: referenceId } : {}),
      ...(sourceKind ? { source_kind: sourceKind } : {}),
      ...(sourceId !== undefined ? { source_id: sourceId } : {}),
      ...(sourceRef !== undefined ? { source_ref: sourceRef } : {}),
      ...(role ? { role } : {}),
      ...(mediaType ? { media_type: mediaType } : {}),
    }]
  })
}

function referenceAssetsFromMentions(text: string | undefined): PromptReferenceAssetIntent[] {
  return parseResourceMentions(text).map((mention) => ({
    resource_id: mention.id,
    ...(mention.role ? { role: mention.role } : {}),
    ...(mention.mediaType ? { media_type: mention.mediaType } : {}),
  }))
}

function positiveIntegerIds(values: unknown[]): number[] {
  const ids = values
    .map((value) => numericId(value))
    .filter((value): value is number => value !== undefined)
  return Array.from(new Set(ids))
}

function numericList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => numericId(item))
    .filter((item): item is number => item !== undefined)
}

function numericId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value.trim())
    if (Number.isInteger(numberValue) && numberValue > 0) return numberValue
  }
  return undefined
}

function stringOrNumberField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return stringField(value)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function nonEmptyRecord(value: unknown): Record<string, unknown> | undefined {
  const record = recordField(value)
  return record && Object.keys(record).length > 0 ? record : undefined
}

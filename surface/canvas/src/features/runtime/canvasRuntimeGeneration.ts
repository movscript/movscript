import { canvasApi, canvasServicePaths } from '../application/canvasServiceApi'
import { publicAgentBackendModelId as publicModelId } from '@movscript/core/agent'
import { surfaceModelReferenceAssetsKey, type CanvasNodeData, type CanvasPortType, type CanvasPortValue, type Job, type PublicModel, type RawResource } from '@movscript/shared'
import {
  buildGenerationJobPayload,
  generationExecutionJobTypeForIntent,
  generationOperationAcceptsReferences,
  type GenerationIntentPayload,
} from '@movscript/resource-surface/data'

export interface CanvasRuntimeTextRequest {
  modelId?: string
  prompt: string
  params?: Record<string, unknown>
  projectId?: number
}

export interface CanvasRuntimeGenerationRequest {
  nodeType?: string
  data: Partial<CanvasNodeData>
  outputType: CanvasPortType
  prompt: string
  inputResourceIds: number[]
  inputResources?: RawResource[]
  inputValues?: Record<string, CanvasPortValue[]>
  projectId?: number
}

type ResolvedCanvasRuntimeModel = {
  modelId?: string
}

export async function resolveCanvasRuntimeModel(
  data: Partial<CanvasNodeData>,
  capability: string,
  operation?: string,
  referenceAssets: NonNullable<GenerationIntentPayload['reference_assets']> = [],
): Promise<ResolvedCanvasRuntimeModel> {
  if (data.modelId) {
    const model = await findCanvasRuntimeModel(data, capability, operation, referenceAssets)
    if (model) return resolvedCanvasRuntimeModel(model)
    return {}
  }
  const models = await canvasApi.get(canvasServicePaths.runtimeModels, { params: canvasRuntimeModelQuery(capability, operation, referenceAssets) }).then((r) => r.data as PublicModel[])
  const model = models.find((item) => item.is_default) ?? models[0]
  if (!model) return {}
  return resolvedCanvasRuntimeModel(model)
}

async function findCanvasRuntimeModel(
  data: Partial<CanvasNodeData>,
  capability: string,
  operation?: string,
  referenceAssets: NonNullable<GenerationIntentPayload['reference_assets']> = [],
): Promise<PublicModel | undefined> {
  const models = await canvasApi.get(canvasServicePaths.runtimeModels, { params: canvasRuntimeModelQuery(capability, operation, referenceAssets) }).then((r) => r.data as PublicModel[])
  return models.find((model) => publicModelId(model) === data.modelId)
}

function canvasRuntimeModelQuery(
  capability: string,
  operation?: string,
  referenceAssets: NonNullable<GenerationIntentPayload['reference_assets']> = [],
): Record<string, string> {
  return {
    capability,
    ...(operation ? { operation } : {}),
    ...(referenceAssets.length > 0 ? { reference_assets: surfaceModelReferenceAssetsKey(referenceAssets) } : {}),
  }
}

function resolvedCanvasRuntimeModel(model: PublicModel): ResolvedCanvasRuntimeModel {
  return {
    modelId: publicModelId(model),
  }
}

export async function generateCanvasRuntimeText(input: CanvasRuntimeTextRequest) {
  const response = await canvasApi.post(canvasServicePaths.runtimeText, {
    model_id: input.modelId,
    prompt: input.prompt,
    params: input.params ?? {},
    project_id: input.projectId,
  }).then((r) => r.data as { text: string; model_id?: string })
  return response
}

export async function generateCanvasRuntimeMedia(input: CanvasRuntimeGenerationRequest) {
  const sourceKey = runtimeSourceKey(input.nodeType, input.outputType)
  const generationIntent = canvasRuntimeGenerationIntent(input)
  const model = await resolveCanvasRuntimeModel(input.data, generationIntent.capability, generationIntent.operation, generationIntent.reference_assets ?? [])
  const modelId = model.modelId
  if (!modelId) throw new Error('no_model_select')

  const jobType = generationExecutionJobTypeForIntent(generationIntent, input.outputType === 'video' ? 'video' : 'image')
  const created = await canvasApi.post(canvasServicePaths.runtimeMedia, {
    ...buildGenerationJobPayload({
      modelId,
      jobType,
      generationIntent,
      title: runtimeJobTitle(jobType),
      prompt: input.prompt,
      params: normalizeGenerationParams(input.data.params),
      inputResourceIds: input.inputResourceIds,
      sourceKey,
    }),
    project_id: input.projectId,
  }).then((r) => r.data as Job)

  return pollCanvasRuntimeJob(created.ID, jobType.startsWith('video') ? 600_000 : 180_000)
}

export async function uploadCanvasRuntimeTextResource(name: string, text: string) {
  const filename = name.endsWith('.txt') ? name : `${name || 'canvas-output'}.txt`
  return canvasApi.post(canvasServicePaths.runtimeTextResource, {
    name: filename,
    text,
  }).then((r) => r.data)
}

async function pollCanvasRuntimeJob(jobId: number, timeoutMs: number) {
  const started = Date.now()
  for (;;) {
    const job = await canvasApi.get(canvasServicePaths.runtimeJob(jobId)).then((r) => r.data as Job)
    if (job.status === 'succeeded') return job
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.error_msg || `generation job ${job.status}`)
    }
    if (Date.now() - started > timeoutMs) throw new Error('generation job timed out')
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

function runtimeSourceKey(nodeType: string | undefined, outputType: CanvasPortType) {
  if (nodeType && ['ref_image_gen', 'ref_video_gen', 'multi_angle', 'style_transfer', 'motion_imitation'].includes(nodeType)) return nodeType
  if (outputType === 'text') return 'canvas_text'
  if (outputType === 'video') return 'canvas_video'
  return 'canvas_image'
}

function canvasRuntimeGenerationIntent(input: CanvasRuntimeGenerationRequest): GenerationIntentPayload {
  const operation = canvasRuntimeOperation(input)
  const capability = canvasRuntimeCapability(input.outputType)
  const referenceAssets = canvasRuntimeReferenceAssets(input.inputValues, input.inputResourceIds, input.inputResources)
  validateCanvasRuntimeOperationInputs(operation, referenceAssets.reference_assets ?? [])
  return {
    capability,
    operation,
    ...referenceAssets,
  }
}

function canvasRuntimeCapability(outputType: CanvasPortType) {
  if (outputType === 'video') return 'video_generation'
  if (outputType === 'image') return 'image_generation'
  throw new Error(`unsupported_canvas_generation_output:${outputType}`)
}

function canvasRuntimeOperation(input: CanvasRuntimeGenerationRequest): string {
  const explicit = input.data.modelOperation?.trim()
  if (explicit) return explicit
  const defaultOperation = canvasRuntimeDefaultOperation(input.nodeType, input.outputType)
  if (defaultOperation) return defaultOperation
  throw new Error('missing_canvas_operation_intent')
}

function canvasRuntimeDefaultOperation(nodeType: string | undefined, outputType: CanvasPortType): string | undefined {
  switch (nodeType) {
    case 'ref_image_gen':
      return 'image_to_image'
    case 'multi_angle':
      return 'reference_to_image'
    case 'style_transfer':
      return 'style_transfer'
    case 'ref_video_gen':
    case 'motion_imitation':
      return 'reference_to_video'
    case 'ai_gen':
      if (outputType === 'video') return 'prompt_to_video'
      if (outputType === 'image') return 'text_to_image'
      return undefined
    default:
      if (outputType === 'video') return 'prompt_to_video'
      if (outputType === 'image') return 'text_to_image'
      return undefined
  }
}

function canvasRuntimeReferenceAssets(
  inputValues: Record<string, CanvasPortValue[]> | undefined,
  inputResourceIds: readonly number[] = [],
  inputResources: readonly RawResource[] = [],
): Pick<GenerationIntentPayload, 'reference_assets'> {
  const refs: NonNullable<GenerationIntentPayload['reference_assets']> = []
  const seen = new Set<number>()
  for (const values of Object.values(inputValues ?? {})) {
    for (const value of values) {
      if (!value.resource_id) continue
      const mediaType = value.media_type || canvasRuntimeMediaType(value)
      if (!mediaType) {
        throw new Error('invalid_canvas_operation_inputs:resource_media_type_required')
      }
      refs.push({
        resource_id: value.resource_id,
        role: value.role || canvasRuntimeReferenceRole(value),
        media_type: mediaType,
      })
      seen.add(value.resource_id)
    }
  }
  const resourcesById = new Map(inputResources.map((resource) => [resource.ID, resource]))
  for (const resourceId of inputResourceIds) {
    if (seen.has(resourceId)) continue
    const resource = resourcesById.get(resourceId)
    const mediaType = resource ? canvasRuntimeResourceMediaType(resource) : undefined
    if (!mediaType) {
      throw new Error('invalid_canvas_operation_inputs:resource_media_type_required')
    }
    refs.push({
      resource_id: resourceId,
      role: canvasRuntimeReferenceRole({ type: mediaType }),
      media_type: mediaType,
    })
    seen.add(resourceId)
  }
  return refs.length > 0 ? { reference_assets: refs } : {}
}

function validateCanvasRuntimeOperationInputs(
  operation: string,
  referenceAssets: NonNullable<GenerationIntentPayload['reference_assets']>,
) {
  const roles = new Set(referenceAssets.map((asset) => asset.role))
  if (operation === 'first_last_frame_to_video') {
    if (!roles.has('first_frame') || !roles.has('last_frame')) {
      throw new Error('invalid_canvas_operation_inputs:first_last_frame_requires_first_frame_and_last_frame')
    }
  }
  if (operation === 'first_frame_to_video' && !roles.has('first_frame')) {
    throw new Error('invalid_canvas_operation_inputs:first_frame_to_video_requires_first_frame')
  }
  if (!generationOperationAcceptsReferences(operation, referenceAssets)) {
    throw new Error('invalid_canvas_operation_inputs:operation_reference_assets_mismatch')
  }
}

function canvasRuntimeReferenceRole(value: CanvasPortValue): string {
  if (value.type === 'video') return 'reference_video'
  if (value.type === 'audio') return 'reference_audio'
  if (value.type === 'image') return 'reference_image'
  return 'generic'
}

function canvasRuntimeMediaType(value: CanvasPortValue): 'image' | 'video' | 'audio' | undefined {
  if (value.type === 'image' || value.type === 'video' || value.type === 'audio') return value.type
  return undefined
}

function canvasRuntimeResourceMediaType(resource: Pick<RawResource, 'type'>): 'image' | 'video' | 'audio' | undefined {
  if (resource.type === 'image' || resource.type === 'video' || resource.type === 'audio') return resource.type
  return undefined
}

function runtimeJobTitle(jobType: string) {
  if (jobType.startsWith('video')) return 'Canvas video generation'
  if (jobType === 'image_edit') return 'Canvas reference image generation'
  return 'Canvas image generation'
}

function normalizeGenerationParams(params: Record<string, unknown> | undefined) {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value
  }
  return out
}

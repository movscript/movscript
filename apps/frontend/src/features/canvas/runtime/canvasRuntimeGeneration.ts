import { api } from '@/shared/infrastructure/api'
import { buildGenerationJobPayload } from '@/features/resources/domain/generationJobPayload'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { CanvasNodeData, CanvasPortType, Job, PublicModel } from '@/types'
import {
  resolveGenerationCapabilityForResourceCount,
  resolveGenerationJobTypeFromResourceCount,
} from '@movscript/core/generation'

export interface CanvasRuntimeTextRequest {
  modelId?: string
  modelConfigId?: number
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
  projectId?: number
}

export async function resolveCanvasRuntimeModel(data: Partial<CanvasNodeData>, capability: string) {
  if (data.modelId || data.modelDbId) {
    return { modelId: data.modelId, modelConfigId: data.modelDbId }
  }
  const models = await api.get('/models', { params: { capability } }).then((r) => r.data as PublicModel[])
  const model = models.find((item) => item.is_default) ?? models[0]
  if (!model) return {}
  return { modelId: publicModelId(model), modelConfigId: model.id }
}

export async function generateCanvasRuntimeText(input: CanvasRuntimeTextRequest) {
  const response = await api.post('/canvas-runtime/text', {
    model_id: input.modelId,
    model_config_id: input.modelConfigId,
    prompt: input.prompt,
    params: input.params ?? {},
    project_id: input.projectId,
  }).then((r) => r.data as { text: string; model_id?: string; model_config_id?: number })
  return response
}

export async function generateCanvasRuntimeMedia(input: CanvasRuntimeGenerationRequest) {
  const sourceKey = runtimeSourceKey(input.nodeType, input.outputType)
  const capability = runtimeCapability(input.outputType, input.inputResourceIds)
  const model = await resolveCanvasRuntimeModel(input.data, capability)
  const modelId = model.modelId
  if (!modelId) throw new Error('no_model_select')

  const jobType = runtimeJobType(input.outputType, input.inputResourceIds, input.data)
  const created = await api.post('/jobs', {
    ...buildGenerationJobPayload({
      modelId,
      jobType,
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
  const file = new File([text], name.endsWith('.txt') ? name : `${name || 'canvas-output'}.txt`, { type: 'text/plain' })
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/resources/upload', fd).then((r) => r.data)
}

async function pollCanvasRuntimeJob(jobId: number, timeoutMs: number) {
  const started = Date.now()
  for (;;) {
    const job = await api.get(`/jobs/${jobId}`).then((r) => r.data as Job)
    if (job.status === 'succeeded') return job
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.error_msg || `generation job ${job.status}`)
    }
    if (Date.now() - started > timeoutMs) throw new Error('generation job timed out')
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

function runtimeCapability(outputType: CanvasPortType, inputResourceIds: number[]) {
  return resolveGenerationCapabilityForResourceCount({
    outputType,
    inputResourceCount: inputResourceIds.length,
  })
}

function runtimeJobType(outputType: CanvasPortType, inputResourceIds: number[], data: Partial<CanvasNodeData>) {
  return resolveGenerationJobTypeFromResourceCount({
    outputType,
    inputResourceCount: inputResourceIds.length,
    preferredVideoJobType: data.params?.job_type,
  })
}

function runtimeSourceKey(nodeType: string | undefined, outputType: CanvasPortType) {
  if (nodeType && ['ref_image_gen', 'ref_video_gen', 'multi_angle', 'style_transfer', 'motion_imitation'].includes(nodeType)) return nodeType
  if (outputType === 'text') return 'canvas_text'
  if (outputType === 'video') return 'canvas_video'
  return 'canvas_image'
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

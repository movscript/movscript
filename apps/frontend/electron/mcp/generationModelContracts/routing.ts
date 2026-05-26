import { stringModelField } from '../modelContracts'
import { isRecord } from '../valueUtils'
import { backendList, getOptionalString } from './utils'

export function inferGenerationJobType(args: Record<string, unknown>, inputResourceIds: number[]): string {
  const explicit = getOptionalString(args, 'job_type') ?? getOptionalString(args, 'jobType')
  if (explicit && isGenerationJobType(explicit)) return explicit
  if (explicit) throw new Error(`unsupported job_type: ${explicit}`)

  const outputType = getOptionalString(args, 'output_type') ?? getOptionalString(args, 'outputType') ?? 'image'
  if (outputType === 'image') return inputResourceIds.length > 0 ? 'image_edit' : 'image'
  if (outputType === 'video') {
    const referenceKind = getOptionalString(args, 'reference_type') ?? getOptionalString(args, 'referenceType')
    if (referenceKind === 'video') return 'video_v2v'
    if (inputResourceIds.length > 0) return 'video_i2v'
    return 'video'
  }
  if (isGenerationJobType(outputType)) return outputType
  throw new Error(`unsupported output_type: ${outputType}`)
}

function isGenerationJobType(value: string): boolean {
  return value === 'image'
    || value === 'image_edit'
    || value === 'video'
    || value === 'video_i2v'
    || value === 'video_v2v'
}

async function pickGenerationModelConfigId(jobType: string): Promise<number> {
  const capabilityCandidates = modelCapabilityCandidates(jobType)
  for (const capability of capabilityCandidates) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => Number.isFinite(Number(item?.id ?? item?.ID)))
    const id = Number(model?.id ?? model?.ID)
    if (Number.isFinite(id) && id > 0) return id
  }
  throw new Error(`没有可用的 ${jobType} 模型配置，请先在管理后台配置可用模型`)
}

export async function resolveGenerationModelRouteForMcp(jobType: string, requestedModelId?: string, legacyModelConfigId?: number): Promise<{ modelId?: string, modelConfigId: number }> {
  if (requestedModelId) {
    return {
      modelId: requestedModelId,
      modelConfigId: await findGenerationModelConfigIdByModelId(jobType, requestedModelId) ?? legacyModelConfigId ?? 0,
    }
  }
  if (legacyModelConfigId) {
    return {
      modelId: await findGenerationModelIdByConfigId(jobType, legacyModelConfigId),
      modelConfigId: legacyModelConfigId,
    }
  }
  return pickGenerationModelRoute(jobType)
}

async function pickGenerationModelRoute(jobType: string): Promise<{ modelId?: string, modelConfigId: number }> {
  const capabilityCandidates = modelCapabilityCandidates(jobType)
  for (const capability of capabilityCandidates) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => Number.isFinite(Number(item?.id ?? item?.ID)))
    const id = Number(model?.id ?? model?.ID)
    if (Number.isFinite(id) && id > 0) {
      return { modelId: modelIDFromModel(model), modelConfigId: id }
    }
  }
  throw new Error(`没有可用的 ${jobType} 模型配置，请先在管理后台配置可用模型`)
}

async function findGenerationModelConfigIdByModelId(jobType: string, modelId: string): Promise<number | undefined> {
  for (const capability of modelCapabilityCandidates(jobType)) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => modelIDFromModel(item) === modelId || item?.logical_model_id === modelId || item?.model_def_id === modelId)
    const id = Number(model?.id ?? model?.ID)
    if (Number.isFinite(id) && id > 0) return id
  }
  return undefined
}

async function findGenerationModelIdByConfigId(jobType: string, modelConfigId: number): Promise<string | undefined> {
  for (const capability of modelCapabilityCandidates(jobType)) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => Number(item?.id ?? item?.ID) === modelConfigId)
    const modelId = modelIDFromModel(model)
    if (modelId) return modelId
  }
  return undefined
}

function modelIDFromModel(model: unknown): string | undefined {
  if (!isRecord(model)) return undefined
  return stringModelField(model, 'model_id') ?? stringModelField(model, 'logical_model_id') ?? stringModelField(model, 'model_def_id')
}

export function modelCapabilityCandidates(jobType: string): string[] {
  switch (jobType) {
    case 'image_edit':
      return ['image_edit', 'image']
    case 'video_i2v':
      return ['video_i2v', 'video']
    case 'video_v2v':
      return ['video_v2v', 'video']
    default:
      return [jobType]
  }
}

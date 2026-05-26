import {
  generationJobMessage,
  isTerminalGenerationStatus,
  normalizeGenerationJob,
  stringValue,
} from '../generation'
import { isRecord } from '../valueUtils'

export function buildCompletedGenerationJobResult(input: {
  jobId: number
  finalJob: unknown
  paramValidation: unknown
}): Record<string, unknown> {
  const normalized = normalizeGenerationJob(input.finalJob)
  const finalStatus = stringValue(normalized.status) ?? 'unknown'
  const outputResourceId = typeof normalized.output_resource_id === 'number' ? normalized.output_resource_id : undefined
  const outputResource = isRecord(normalized.output_resource) ? normalized.output_resource : undefined
  const outputResourceIds = Array.isArray(normalized.output_resource_ids) ? normalized.output_resource_ids.filter((id): id is number => typeof id === 'number') : []
  const outputResources = Array.isArray(normalized.output_resources) ? normalized.output_resources.filter(isRecord) : []
  const media = isRecord(normalized.media) ? normalized.media : undefined

  return {
    status: finalStatus,
    job: normalized.job,
    jobId: input.jobId,
    ...(outputResources.length > 0 ? { output_resources: outputResources } : {}),
    ...(outputResourceIds.length > 0 ? { output_resource_ids: outputResourceIds } : {}),
    ...(outputResource ? { output_resource: outputResource } : {}),
    ...(outputResourceId ? { output_resource_id: outputResourceId } : {}),
    ...(media ? { media } : {}),
    param_validation: input.paramValidation,
    terminal: isTerminalGenerationStatus(finalStatus),
    message: finalStatus === 'succeeded'
      ? generationJobMessage(input.jobId, normalized)
      : `生成任务结束，状态：${finalStatus}。`,
  }
}

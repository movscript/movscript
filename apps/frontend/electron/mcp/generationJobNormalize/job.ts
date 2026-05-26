import { isRecord } from '../valueUtils'
import { getJobId } from '../generationJobs/values'
import {
  generationMediaSummary,
  getGenerationOutputResourceIds,
  getGenerationOutputResources,
} from './resources'
import {
  getGenerationProgress,
  getGenerationStage,
} from './status'

export function normalizeGenerationJob(rawJob: unknown): Record<string, unknown> {
  const job = isRecord(rawJob) ? rawJob : {}
  const jobId = getJobId(job)
  const status = typeof job.status === 'string' ? job.status : 'unknown'
  const outputResources = getGenerationOutputResources(job)
  const outputResourceIds = getGenerationOutputResourceIds(job, outputResources)
  const outputResourceId = typeof job.output_resource_id === 'number'
    ? job.output_resource_id
    : outputResourceIds[0]
  const outputResource = isRecord(job.output_resource) ? job.output_resource : outputResources[0]
  const progress = getGenerationProgress(job)
  const stage = getGenerationStage(job)
  return {
    job,
    ...(jobId ? { jobId } : {}),
    status,
    ...(typeof job.job_type === 'string' ? { jobType: job.job_type } : {}),
    ...(typeof job.provider_name === 'string' && job.provider_name ? { providerName: job.provider_name } : {}),
    ...(typeof job.model_display === 'string' && job.model_display ? { modelDisplay: job.model_display } : {}),
    ...(typeof job.model_identifier === 'string' && job.model_identifier ? { modelIdentifier: job.model_identifier } : {}),
    ...(typeof job.model_config_id === 'number' ? { modelConfigId: job.model_config_id } : {}),
    ...(progress !== undefined ? { progress } : {}),
    ...(stage ? { stage } : {}),
    ...(typeof job.error_msg === 'string' && job.error_msg ? { error: job.error_msg } : {}),
    ...(outputResourceIds.length > 0 ? { output_resource_ids: outputResourceIds } : {}),
    ...(outputResources.length > 0 ? { output_resources: outputResources } : {}),
    ...(outputResourceId ? { output_resource_id: outputResourceId } : {}),
    ...(outputResource ? { output_resource: outputResource } : {}),
    ...(outputResource ? { media: generationMediaSummary(outputResource, outputResourceId) } : {}),
  }
}

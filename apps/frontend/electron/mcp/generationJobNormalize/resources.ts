import { isRecord } from '../valueUtils'
import { uniquePositiveNumbers } from '../generationJobs/values'

export function generationMediaSummary(outputResource: Record<string, unknown>, outputResourceId?: number): Record<string, unknown> {
  return {
    id: outputResourceId ?? getRawResourceId(outputResource),
    type: outputResource.type,
    name: outputResource.name,
    url: outputResource.url,
    direct_url: outputResource.direct_url,
    mime_type: outputResource.mime_type,
  }
}

export function getRawResourceId(resource: Record<string, unknown>): number | undefined {
  const id = Number(resource.ID ?? resource.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

export function getGenerationOutputResources(job: Record<string, unknown>): Record<string, unknown>[] {
  const rawResources = Array.isArray(job.output_resources)
    ? job.output_resources
    : Array.isArray(job.outputResources)
      ? job.outputResources
      : []
  const resources = rawResources.filter(isRecord)
  if (resources.length > 0) return resources
  return isRecord(job.output_resource) ? [job.output_resource] : []
}

export function getGenerationOutputResourceIds(job: Record<string, unknown>, outputResources: Array<Record<string, unknown>>): number[] {
  const explicitIds = Array.isArray(job.output_resource_ids)
    ? job.output_resource_ids
    : Array.isArray(job.outputResourceIds)
      ? job.outputResourceIds
      : []
  if (explicitIds.length > 0) return uniquePositiveNumbers(explicitIds)
  if (job.output_resource_id !== undefined && outputResources.length <= 1) {
    return uniquePositiveNumbers([job.output_resource_id])
  }
  return uniquePositiveNumbers([
    job.output_resource_id,
    ...outputResources.map((resource) => getRawResourceId(resource)),
  ])
}

export function normalizeGenerationJob(rawJob: unknown): Record<string, unknown> {
  const job = isRecord(rawJob) ? rawJob : {}
  const jobId = getJobId(job)
  const status = typeof job.status === 'string' ? job.status : 'unknown'
  const outputResources = getOutputResources(job)
  const outputResourceIds = getOutputResourceIds(job, outputResources)
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

export function getGenerationProgress(job: Record<string, unknown>): number | undefined {
  const candidates = [
    job.progress,
    job.progress_percent,
    job.percent,
    isRecord(job.metadata) ? job.metadata.progress : undefined,
  ]
  for (const value of candidates) {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isFinite(numeric)) return numeric > 1 ? Math.round(numeric) : Math.round(numeric * 100)
  }
  return undefined
}

export function getGenerationStage(job: Record<string, unknown>): string | undefined {
  const value = job.stage ?? job.provider_status ?? (isRecord(job.metadata) ? job.metadata.stage : undefined)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function isTerminalGenerationStatus(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

export function generationJobMessage(jobId: number, normalized: Record<string, unknown>): string {
  const status = stringValue(normalized.status) ?? 'unknown'
  if (status === 'succeeded') {
    const outputResourceIds = Array.isArray(normalized.output_resource_ids)
      ? uniquePositiveNumbers(normalized.output_resource_ids)
      : []
    if (outputResourceIds.length > 1) return `生成完成，输出资源 ${outputResourceIds.map((id) => `#${id}`).join('、')}。`
    return `生成完成${typeof normalized.output_resource_id === 'number' ? `，输出资源 #${normalized.output_resource_id}` : ''}。`
  }
  if (status === 'failed') {
    return `生成失败${typeof normalized.error === 'string' ? `：${normalized.error}` : ''}。`
  }
  if (status === 'cancelled') return `生成任务 Job #${jobId} 已取消。`
  const progress = typeof normalized.progress === 'number' ? `，进度 ${normalized.progress}%` : ''
  const stage = typeof normalized.stage === 'string' ? `，阶段：${normalized.stage}` : ''
  return `生成任务 Job #${jobId} 仍在进行中，状态：${status}${progress}${stage}。`
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function getJobId(job: unknown): number | undefined {
  if (!isRecord(job)) return undefined
  const id = Number(job.ID ?? job.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

export function getRawResourceId(resource: Record<string, unknown>): number | undefined {
  const id = Number(resource.ID ?? resource.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

function getOutputResources(job: Record<string, unknown>): Record<string, unknown>[] {
  const rawResources = Array.isArray(job.output_resources)
    ? job.output_resources
    : Array.isArray(job.outputResources)
      ? job.outputResources
      : []
  const resources = rawResources.filter(isRecord)
  if (resources.length > 0) return resources
  return isRecord(job.output_resource) ? [job.output_resource] : []
}

function getOutputResourceIds(job: Record<string, unknown>, outputResources: Array<Record<string, unknown>>): number[] {
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

function uniquePositiveNumbers(values: unknown[]): number[] {
  const seen = new Set<number>()
  const ids: number[] = []
  for (const value of values) {
    const id = Number(value)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

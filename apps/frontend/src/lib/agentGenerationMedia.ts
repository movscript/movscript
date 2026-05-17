import type { RawResource } from '@/types'
import { isRecord } from '@/lib/jsonValue'

export interface GenerationProgressState {
  jobId?: number
  jobType?: string
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  modelConfigId?: number
  status: string
  stage?: string
  progress?: number
  terminal: boolean
  outputResourceId?: number
  message?: string
  firstSeenAt?: string
  updatedAt?: string
  completedAt?: string
}

export interface GenerationMediaMetadata {
  jobId?: number
  jobType?: string
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  modelConfigId?: number
  status?: string
  stage?: string
}

export interface GenerationTraceReplay {
  jobs: GenerationProgressState[]
  latestJob: GenerationProgressState | null
  outputResourceIds: number[]
  outputResources: RawResource[]
  metadataByResourceId: Map<number, GenerationMediaMetadata>
  active: number
  terminal: number
  succeeded: number
  failed: number
  cancelled: number
  timeout: number
}

export function rawResourceFromUnknown(value: unknown): RawResource | undefined {
  if (!isRecord(value)) return undefined
  const id = Number(value.ID ?? value.id)
  const rawType = value.type
  if (!Number.isFinite(id) || id <= 0) return undefined
  if (rawType !== 'image' && rawType !== 'video' && rawType !== 'audio' && rawType !== 'text' && rawType !== 'file') return undefined
  const type: RawResource['type'] = rawType
  return {
    ID: id,
    owner_id: Number(value.owner_id ?? value.ownerId ?? 0),
    type,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : `resource-${id}`,
    url: typeof value.url === 'string' && value.url ? value.url : `/api/v1/resources/${id}/file`,
    size: typeof value.size === 'number' ? value.size : 0,
    mime_type: typeof value.mime_type === 'string'
      ? value.mime_type
      : typeof value.mimeType === 'string'
        ? value.mimeType
        : type === 'video' ? 'video/mp4' : type === 'image' ? 'image/png' : 'application/octet-stream',
    ...(typeof value.direct_url === 'string' ? { direct_url: value.direct_url } : {}),
    ...(typeof value.storage_backend === 'string' ? { storage_backend: value.storage_backend } : {}),
    ...(typeof value.storage_key === 'string' ? { storage_key: value.storage_key } : {}),
  }
}

export function collectGeneratedMediaHints(value: unknown, resources: Map<number, RawResource>, ids: Set<number>, depth = 0): void {
  if (value === undefined || value === null || depth > 7) return
  if (Array.isArray(value)) {
    for (const item of value) collectGeneratedMediaHints(item, resources, ids, depth + 1)
    return
  }
  if (!isRecord(value)) return

  const resource = rawResourceFromUnknown(value)
  if (resource && (resource.type === 'image' || resource.type === 'video')) {
    resources.set(resource.ID, resource)
  }

  for (const key of ['output_resource', 'outputResource', 'media']) {
    const nested = value[key]
    const nestedResource = rawResourceFromUnknown(nested)
    if (nestedResource && (nestedResource.type === 'image' || nestedResource.type === 'video')) {
      resources.set(nestedResource.ID, nestedResource)
    } else {
      collectGeneratedMediaHints(nested, resources, ids, depth + 1)
    }
  }

  for (const key of ['output_resources', 'outputResources']) {
    collectGeneratedMediaHints(value[key], resources, ids, depth + 1)
  }

  const outputId = Number(value.output_resource_id ?? value.outputResourceId)
  if (Number.isInteger(outputId) && outputId > 0) ids.add(outputId)
  const outputIds = value.output_resource_ids ?? value.outputResourceIds
  if (Array.isArray(outputIds)) {
    for (const id of outputIds) {
      const numeric = Number(id)
      if (Number.isInteger(numeric) && numeric > 0) ids.add(numeric)
    }
  }

  const data = value.data
  if (data !== value) collectGeneratedMediaHints(data, resources, ids, depth + 1)
  const job = value.job
  if (job !== value) collectGeneratedMediaHints(job, resources, ids, depth + 1)
  const generation = value.generation
  if (generation !== value) collectGeneratedMediaHints(generation, resources, ids, depth + 1)
}

export interface GenerationTraceEventLike {
  data?: unknown
  createdAt?: string
  completedAt?: string
}

export function generationMetadataByResourceIdFromEvents(events: GenerationTraceEventLike[]): Map<number, GenerationMediaMetadata> {
  const metadataByResourceId = new Map<number, GenerationMediaMetadata>()
  for (const event of events) {
    const data = isRecord(event.data) ? event.data : undefined
    const generation = data?.generation && isRecord(data.generation) ? data.generation : undefined
    if (!generation) continue
    const metadata = generationMetadataFromRecord(generation)
    const outputResourceId = Number(generation.outputResourceId ?? generation.output_resource_id)
    if (Number.isInteger(outputResourceId) && outputResourceId > 0) {
      metadataByResourceId.set(outputResourceId, metadata)
    }
    const media = rawResourceFromUnknown(generation.media)
    if (media && (media.type === 'image' || media.type === 'video')) {
      metadataByResourceId.set(media.ID, metadata)
    }
  }
  return metadataByResourceId
}

export function generationProgressFromEvents(events: GenerationTraceEventLike[]): GenerationProgressState | null {
  return generationProgressListFromEvents(events).at(-1) ?? null
}

export function generationProgressListFromEvents(events: GenerationTraceEventLike[]): GenerationProgressState[] {
  const statesByKey = new Map<string, GenerationProgressState>()
  const keys: string[] = []
  events.forEach((event, index) => {
    const data = isRecord(event.data) ? event.data : undefined
    const generation = data?.generation && isRecord(data.generation) ? data.generation : undefined
    if (!generation) return
    const status = typeof generation.status === 'string' && generation.status.trim() ? generation.status.trim() : 'unknown'
    const jobId = typeof generation.jobId === 'number' ? generation.jobId : undefined
    const state: GenerationProgressState = {
      ...(typeof generation.jobId === 'number' ? { jobId: generation.jobId } : {}),
      ...(typeof generation.jobType === 'string' ? { jobType: generation.jobType } : {}),
      ...(typeof generation.providerName === 'string' ? { providerName: generation.providerName } : {}),
      ...(typeof generation.modelDisplay === 'string' ? { modelDisplay: generation.modelDisplay } : {}),
      ...(typeof generation.modelIdentifier === 'string' ? { modelIdentifier: generation.modelIdentifier } : {}),
      ...(typeof generation.modelConfigId === 'number' ? { modelConfigId: generation.modelConfigId } : {}),
      status,
      ...(typeof generation.stage === 'string' ? { stage: generation.stage } : {}),
      ...(typeof generation.progress === 'number' ? { progress: generation.progress } : {}),
      terminal: generation.terminal === true,
      ...(typeof generation.outputResourceId === 'number' ? { outputResourceId: generation.outputResourceId } : {}),
      ...(typeof generation.message === 'string' ? { message: generation.message } : {}),
    }
    const key = jobId !== undefined
      ? `job:${jobId}`
      : state.outputResourceId !== undefined
        ? `resource:${state.outputResourceId}`
        : `event:${index}`
    const previous = statesByKey.get(key)
    const eventCreatedAt = typeof event.createdAt === 'string' && event.createdAt.trim() ? event.createdAt : undefined
    const eventCompletedAt = typeof event.completedAt === 'string' && event.completedAt.trim() ? event.completedAt : undefined
    const timedState: GenerationProgressState = {
      ...state,
      ...(previous?.firstSeenAt || eventCreatedAt ? { firstSeenAt: previous?.firstSeenAt ?? eventCreatedAt } : {}),
      ...(eventCreatedAt || previous?.updatedAt ? { updatedAt: eventCreatedAt ?? previous?.updatedAt } : {}),
      ...(eventCompletedAt || previous?.completedAt ? { completedAt: eventCompletedAt ?? previous?.completedAt } : {}),
    }
    if (!statesByKey.has(key)) keys.push(key)
    statesByKey.set(key, timedState)
  })
  return keys.map((key) => statesByKey.get(key)).filter((state): state is GenerationProgressState => !!state)
}

export function replayGenerationTrace(events: GenerationTraceEventLike[]): GenerationTraceReplay {
  const resources = new Map<number, RawResource>()
  const resourceIds = new Set<number>()
  for (const event of events) {
    collectGeneratedMediaHints(event.data, resources, resourceIds)
  }
  const jobs = generationProgressListFromEvents(events)
  return {
    jobs,
    latestJob: jobs.at(-1) ?? null,
    outputResourceIds: [...resourceIds],
    outputResources: [...resources.values()],
    metadataByResourceId: generationMetadataByResourceIdFromEvents(events),
    active: jobs.filter((job) => !job.terminal && job.status !== 'timeout' && job.stage !== 'timeout').length,
    terminal: jobs.filter((job) => job.terminal).length,
    succeeded: jobs.filter((job) => job.status === 'succeeded' || job.stage === 'completed').length,
    failed: jobs.filter((job) => job.status === 'failed' || job.stage === 'failed').length,
    cancelled: jobs.filter((job) => job.status === 'cancelled' || job.stage === 'cancelled').length,
    timeout: jobs.filter((job) => job.status === 'timeout' || job.stage === 'timeout').length,
  }
}

function generationMetadataFromRecord(generation: Record<string, unknown>): GenerationMediaMetadata {
  return {
    ...(typeof generation.jobId === 'number' ? { jobId: generation.jobId } : {}),
    ...(typeof generation.jobType === 'string' ? { jobType: generation.jobType } : {}),
    ...(typeof generation.providerName === 'string' ? { providerName: generation.providerName } : {}),
    ...(typeof generation.modelDisplay === 'string' ? { modelDisplay: generation.modelDisplay } : {}),
    ...(typeof generation.modelIdentifier === 'string' ? { modelIdentifier: generation.modelIdentifier } : {}),
    ...(typeof generation.modelConfigId === 'number' ? { modelConfigId: generation.modelConfigId } : {}),
    ...(typeof generation.status === 'string' ? { status: generation.status } : {}),
    ...(typeof generation.stage === 'string' ? { stage: generation.stage } : {}),
  }
}

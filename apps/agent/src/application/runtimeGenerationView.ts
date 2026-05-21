import type { AgentRun, AgentTraceEvent } from '../state/types.js'

export interface AgentGenerationProgressState {
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
  outputResourceIds?: number[]
  message?: string
  firstSeenAt?: string
  updatedAt?: string
  completedAt?: string
}

export interface AgentGenerationMediaMetadata {
  jobId?: number
  jobType?: string
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  modelConfigId?: number
  status?: string
  stage?: string
}

export interface AgentGenerationResource {
  ID: number
  owner_id: number
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  name: string
  url: string
  size: number
  mime_type: string
  direct_url?: string
  storage_backend?: string
  storage_key?: string
}

export interface AgentRunGenerationView {
  schema: 'movscript.agent-run-generation-view.v1'
  generatedAt: string
  runId: string
  jobs: AgentGenerationProgressState[]
  latestJob: AgentGenerationProgressState | null
  outputResourceIds: number[]
  outputResources: AgentGenerationResource[]
  metadataByResourceId: Record<string, AgentGenerationMediaMetadata>
  active: number
  terminal: number
  succeeded: number
  failed: number
  cancelled: number
  timeout: number
}

interface GenerationTraceEventLike {
  data?: unknown
  createdAt?: string
  completedAt?: string
}

export function buildRuntimeRunGenerationView(input: {
  run: AgentRun
  events: AgentTraceEvent[]
  generatedAt?: string
}): AgentRunGenerationView {
  const eventLikes: GenerationTraceEventLike[] = [
    ...input.run.steps.map((step) => ({ data: step.result, createdAt: step.createdAt, completedAt: step.completedAt })),
    ...input.events,
  ]
  const replay = replayGenerationTrace(eventLikes)
  return {
    schema: 'movscript.agent-run-generation-view.v1',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runId: input.run.id,
    jobs: replay.jobs,
    latestJob: replay.latestJob,
    outputResourceIds: replay.outputResourceIds,
    outputResources: replay.outputResources,
    metadataByResourceId: Object.fromEntries(
      Array.from(replay.metadataByResourceId.entries()).map(([id, metadata]) => [String(id), metadata]),
    ),
    active: replay.active,
    terminal: replay.terminal,
    succeeded: replay.succeeded,
    failed: replay.failed,
    cancelled: replay.cancelled,
    timeout: replay.timeout,
  }
}

function replayGenerationTrace(events: GenerationTraceEventLike[]) {
  const resources = new Map<number, AgentGenerationResource>()
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

function generationProgressListFromEvents(events: GenerationTraceEventLike[]): AgentGenerationProgressState[] {
  const statesByKey = new Map<string, AgentGenerationProgressState>()
  const keys: string[] = []
  events.forEach((event, index) => {
    const data = isRecord(event.data) ? event.data : undefined
    const generation = data?.generation && isRecord(data.generation) ? data.generation : undefined
    if (!generation) return
    const status = typeof generation.status === 'string' && generation.status.trim() ? generation.status.trim() : 'unknown'
    const jobId = typeof generation.jobId === 'number' ? generation.jobId : undefined
    const outputResourceIds = outputResourceIdsFromGeneration(generation)
    const outputResourceId = typeof generation.outputResourceId === 'number' ? generation.outputResourceId : outputResourceIds[0]
    const state: AgentGenerationProgressState = {
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
      ...(outputResourceId !== undefined ? { outputResourceId } : {}),
      ...(outputResourceIds.length > 0 ? { outputResourceIds } : {}),
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
    const timedState: AgentGenerationProgressState = {
      ...state,
      ...(previous?.firstSeenAt || eventCreatedAt ? { firstSeenAt: previous?.firstSeenAt ?? eventCreatedAt } : {}),
      ...(eventCreatedAt || previous?.updatedAt ? { updatedAt: eventCreatedAt ?? previous?.updatedAt } : {}),
      ...(eventCompletedAt || previous?.completedAt ? { completedAt: eventCompletedAt ?? previous?.completedAt } : {}),
    }
    if (!statesByKey.has(key)) keys.push(key)
    statesByKey.set(key, timedState)
  })
  return keys.map((key) => statesByKey.get(key)).filter((state): state is AgentGenerationProgressState => !!state)
}

function generationMetadataByResourceIdFromEvents(events: GenerationTraceEventLike[]): Map<number, AgentGenerationMediaMetadata> {
  const metadataByResourceId = new Map<number, AgentGenerationMediaMetadata>()
  for (const event of events) {
    const data = isRecord(event.data) ? event.data : undefined
    const generation = data?.generation && isRecord(data.generation) ? data.generation : undefined
    if (!generation) continue
    const metadata = generationMetadataFromRecord(generation)
    const resources = new Map<number, AgentGenerationResource>()
    const ids = new Set<number>()
    collectGeneratedMediaHints(generation, resources, ids)
    for (const id of ids) metadataByResourceId.set(id, metadata)
    for (const resource of resources.values()) metadataByResourceId.set(resource.ID, metadata)
  }
  return metadataByResourceId
}

function collectGeneratedMediaHints(value: unknown, resources: Map<number, AgentGenerationResource>, ids: Set<number>, depth = 0): void {
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

function rawResourceFromUnknown(value: unknown): AgentGenerationResource | undefined {
  if (!isRecord(value)) return undefined
  const id = Number(value.ID ?? value.id)
  const rawType = value.type
  if (!Number.isFinite(id) || id <= 0) return undefined
  if (rawType !== 'image' && rawType !== 'video' && rawType !== 'audio' && rawType !== 'text' && rawType !== 'file') return undefined
  const type: AgentGenerationResource['type'] = rawType
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

function outputResourceIdsFromGeneration(generation: Record<string, unknown>): number[] {
  const ids = new Set<number>()
  const explicit = Number(generation.outputResourceId ?? generation.output_resource_id)
  if (Number.isInteger(explicit) && explicit > 0) ids.add(explicit)
  const list = generation.outputResourceIds ?? generation.output_resource_ids
  if (Array.isArray(list)) {
    for (const id of list) {
      const numeric = Number(id)
      if (Number.isInteger(numeric) && numeric > 0) ids.add(numeric)
    }
  }
  const resources = [
    ...(Array.isArray(generation.outputResources) ? generation.outputResources : []),
    ...(Array.isArray(generation.output_resources) ? generation.output_resources : []),
  ]
  for (const resource of resources) {
    if (!isRecord(resource)) continue
    const id = Number(resource.ID ?? resource.id)
    if (Number.isInteger(id) && id > 0) ids.add(id)
  }
  return [...ids]
}

function generationMetadataFromRecord(generation: Record<string, unknown>): AgentGenerationMediaMetadata {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

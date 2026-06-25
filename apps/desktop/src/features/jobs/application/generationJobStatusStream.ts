import { jobKeys } from '@/features/jobs/application/jobQueryKeys'
import type { JobsQueryResult } from '@/features/jobs/components/JobsPageParts'
import {
  publishCrossPageNotification,
  subscribeCrossPageNotifications,
  type CrossPageNotificationEvent,
} from '@/shared/application/crossPageNotifications'
import type { Job, JobStatus, PaginatedResponse } from '@/types'

export interface GenerationJobStatusEvent {
  jobId: number
  status?: JobStatus | string
  job?: Job
  projectId?: number
  jobType?: string
  providerTaskId?: string
  message?: string
  updatedAt: string
  source: string
}

export interface GenerationJobStatusQueryClient {
  setQueriesData: <TData>(
    filters: { queryKey: readonly unknown[] },
    updater: (current: TData | undefined) => TData | undefined,
  ) => unknown
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export function publishGenerationJobStatus(input: Omit<GenerationJobStatusEvent, 'updatedAt' | 'source'> & {
  updatedAt?: string
  source?: string
}): boolean {
  return publishCrossPageNotification(generationJobStatusCrossPageEvent({
    ...input,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    source: input.source ?? 'generation-job',
  }))
}

export function generationJobStatusCrossPageEvent(event: GenerationJobStatusEvent): CrossPageNotificationEvent {
  return {
    id: generationJobStatusEventId(event),
    topic: 'generation-job',
    scope: event.projectId !== undefined ? { kind: 'project', id: String(event.projectId) } : { kind: 'global' },
    transport: 'local',
    source: event.source,
    emittedAt: event.updatedAt,
    payload: event,
    raw: event,
  }
}

export function subscribeGenerationJobStatus(handler: (event: GenerationJobStatusEvent) => void): () => void {
  return subscribeCrossPageNotifications((event) => {
    const generationEvent = generationJobStatusEventFromCrossPage(event)
    if (!generationEvent) return
    handler(generationEvent)
  }, (event) => event.topic === 'generation-job')
}

export function applyGenerationJobStatusEventToCache(
  queryClient: GenerationJobStatusQueryClient,
  event: GenerationJobStatusEvent,
): void {
  queryClient.setQueriesData<JobsStatusCacheResult>({ queryKey: jobKeys.all }, (current) => {
    if (!current) return current
    return updateJobsQueryResult(current, event)
  })
  void queryClient.invalidateQueries({ queryKey: jobKeys.all })
}

export function installGenerationJobStatusStream(queryClient: GenerationJobStatusQueryClient): () => void {
  return subscribeGenerationJobStatus((event) => {
    applyGenerationJobStatusEventToCache(queryClient, event)
  })
}

export function generationJobStatusEventFromCrossPage(event: CrossPageNotificationEvent): GenerationJobStatusEvent | undefined {
  if (event.topic !== 'generation-job') return undefined
  return isGenerationJobStatusEvent(event.payload) ? event.payload : undefined
}

type JobsStatusCacheResult = JobsQueryResult | PaginatedResponse<Job>

function updateJobsQueryResult(current: JobsStatusCacheResult, event: GenerationJobStatusEvent): JobsStatusCacheResult {
  if (hasJobList(current, 'jobs')) {
    return updateJobListResult(current, 'jobs', event)
  }
  if (hasJobList(current, 'items')) {
    return updateJobListResult(current, 'items', event)
  }
  return current
}

function updateJobListResult<T extends JobsStatusCacheResult, TKey extends 'jobs' | 'items'>(
  current: T & Record<TKey, Job[]>,
  key: TKey,
  event: GenerationJobStatusEvent,
): T {
  const jobs = current[key]
  const index = jobs.findIndex((job) => job.ID === event.jobId)
  if (index < 0) return current
  const existing = jobs[index]
  const nextJob = mergeJobStatus(existing, event)
  return {
    ...current,
    [key]: jobs.map((job) => job.ID === event.jobId ? nextJob : job),
  }
}

function hasJobList<TKey extends 'jobs' | 'items'>(
  value: JobsStatusCacheResult,
  key: TKey,
): value is JobsStatusCacheResult & Record<TKey, Job[]> {
  return Array.isArray((value as Partial<Record<TKey, unknown>>)[key])
}

function mergeJobStatus(job: Job, event: GenerationJobStatusEvent): Job {
  const snapshot = event.job
  return {
    ...job,
    ...(snapshot ?? {}),
    ID: event.jobId,
    status: (snapshot?.status ?? event.status ?? job.status) as JobStatus,
    ...(event.jobType ? { job_type: event.jobType } : {}),
    ...(event.providerTaskId ? { provider_task_id: event.providerTaskId } : {}),
    ...(event.message && !snapshot?.error_msg ? { error_msg: event.message } : {}),
    UpdatedAt: snapshot?.UpdatedAt ?? event.updatedAt,
  }
}

function generationJobStatusEventId(event: GenerationJobStatusEvent): string {
  return [
    'generation-job',
    event.jobId,
    event.status ?? event.job?.status ?? 'unknown',
    event.job?.UpdatedAt ?? event.updatedAt,
  ].join(':')
}

function isGenerationJobStatusEvent(value: unknown): value is GenerationJobStatusEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<GenerationJobStatusEvent>
  return typeof record.jobId === 'number'
    && Number.isFinite(record.jobId)
    && typeof record.updatedAt === 'string'
    && typeof record.source === 'string'
}

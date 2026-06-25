import { jobKeys } from '../application/jobQueryKeys'
import { publishAppEvent } from '@movscript/shared/app-events'

export interface JobQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export type JobMutationEvent =
  | {
    type: 'JobListChanged'
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'ToolJobsChanged'
    nodeType: string
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }

export interface JobMutationResult {
  event: JobMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function jobListChangedResult(input: {
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
} = {}): JobMutationResult {
  return jobMutationResult({
    type: 'JobListChanged',
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function toolJobsChangedResult(input: {
  nodeType: string
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): JobMutationResult {
  return jobMutationResult({
    type: 'ToolJobsChanged',
    nodeType: input.nodeType,
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function invalidateJobMutationResult(
  queryClient: JobQueryInvalidator,
  result: JobMutationResult,
): void {
  publishJobMutationEvent(result.event)
  invalidateJobMutationEvent(queryClient, result.event)
}

export function invalidateJobMutationEvent(
  queryClient: JobQueryInvalidator,
  event: JobMutationEvent,
): void {
  switch (event.type) {
    case 'JobListChanged':
      void queryClient.invalidateQueries({ queryKey: jobKeys.all })
      return
    case 'ToolJobsChanged':
      void queryClient.invalidateQueries({ queryKey: jobKeys.toolHistoryScope(event.nodeType) })
      return
  }
}

function jobMutationResult(event: JobMutationEvent): JobMutationResult {
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

function publishJobMutationEvent(event: JobMutationEvent): void {
  publishAppEvent({
    topic: 'job.mutation',
    scope: { kind: 'global' },
    source: 'query-invalidation',
    payload: event,
    raw: event,
  })
}

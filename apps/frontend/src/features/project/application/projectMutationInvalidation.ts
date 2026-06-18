import { projectKeys } from '@/features/project/application/projectQueries'
import { publishAppEvent } from '@/shared/application/appEvents'

export interface ProjectQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export interface ProjectMutationEvent {
  type: 'ProjectListChanged'
  orgId: number | null | undefined
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export interface ProjectMutationResult {
  event: ProjectMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function projectListChangedResult(input: {
  orgId: number | null | undefined
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): ProjectMutationResult {
  const event: ProjectMutationEvent = {
    type: 'ProjectListChanged',
    orgId: input.orgId,
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  }
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

export function invalidateProjectMutationResult(
  queryClient: ProjectQueryInvalidator,
  result: ProjectMutationResult,
): void {
  publishProjectMutationEvent(result.event)
  invalidateProjectMutationEvent(queryClient, result.event)
}

export function invalidateProjectMutationEvent(
  queryClient: ProjectQueryInvalidator,
  event: ProjectMutationEvent,
): void {
  switch (event.type) {
    case 'ProjectListChanged':
      void queryClient.invalidateQueries({ queryKey: projectKeys.list(event.orgId) })
      return
  }
}

function publishProjectMutationEvent(event: ProjectMutationEvent): void {
  publishAppEvent({
    topic: 'project.mutation',
    scope: { kind: 'global' },
    source: 'query-invalidation',
    payload: event,
    raw: event,
  })
}

import { semanticEntityKeys } from '@/shared/application/semanticEntityQueryKeys'
import type { SemanticEntityConfig } from '@/shared/infrastructure/api/semanticEntities'
import { projectAppEventScope, publishAppEvent } from './appEvents'

export interface SemanticEntityQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export interface SemanticEntityMutationEvent {
  type: 'SemanticEntityChanged'
  projectId: number | undefined
  kind: SemanticEntityConfig['kind']
  recordId?: number | string
  consumerQueryKey?: readonly unknown[]
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export interface SemanticEntityMutationResult {
  event: SemanticEntityMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function semanticEntityChangedResult(input: {
  projectId: number | undefined
  kind: SemanticEntityConfig['kind']
  recordId?: number | string
  consumerQueryKey?: readonly unknown[]
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): SemanticEntityMutationResult {
  const changedIds = input.changedIds ?? (input.recordId !== undefined ? [input.recordId] : [])
  const event: SemanticEntityMutationEvent = {
    type: 'SemanticEntityChanged',
    projectId: input.projectId,
    kind: input.kind,
    ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
    ...(input.consumerQueryKey ? { consumerQueryKey: input.consumerQueryKey } : {}),
    changedIds,
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

export function invalidateSemanticEntityMutationResult(
  queryClient: SemanticEntityQueryInvalidator,
  result: SemanticEntityMutationResult,
): void {
  publishSemanticEntityMutationEvent(result.event)
  invalidateSemanticEntityMutationEvent(queryClient, result.event)
}

export function invalidateSemanticEntityMutationEvent(
  queryClient: SemanticEntityQueryInvalidator,
  event: SemanticEntityMutationEvent,
): void {
  switch (event.type) {
    case 'SemanticEntityChanged':
      if (event.consumerQueryKey) void queryClient.invalidateQueries({ queryKey: event.consumerQueryKey })
      void queryClient.invalidateQueries({ queryKey: semanticEntityKeys.list(event.kind, event.projectId) })
      if (event.recordId !== undefined) {
        void queryClient.invalidateQueries({ queryKey: semanticEntityKeys.sourceLock(event.projectId, event.kind, event.recordId) })
      }
      return
  }
}

function publishSemanticEntityMutationEvent(event: SemanticEntityMutationEvent): void {
  publishAppEvent({
    topic: 'semantic-entity.mutation',
    scope: projectAppEventScope(event.projectId),
    source: 'query-invalidation',
    payload: event,
    raw: event,
  })
}

import { shotLibraryKeys } from './shotLibraryQueryKeys'
import { publishAppEvent } from '@movscript/shared/app-events'

export interface ShotLibraryQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export interface ShotLibraryMutationEvent {
  type: 'ShotReferencesChanged'
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export interface ShotLibraryMutationResult {
  event: ShotLibraryMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function shotReferencesChangedResult(input: {
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
} = {}): ShotLibraryMutationResult {
  const event: ShotLibraryMutationEvent = {
    type: 'ShotReferencesChanged',
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

export function invalidateShotLibraryMutationResult(
  queryClient: ShotLibraryQueryInvalidator,
  result: ShotLibraryMutationResult,
): void {
  publishShotLibraryMutationEvent(result.event)
  invalidateShotLibraryMutationEvent(queryClient, result.event)
}

export function invalidateShotLibraryMutationEvent(
  queryClient: ShotLibraryQueryInvalidator,
  event: ShotLibraryMutationEvent,
): void {
  switch (event.type) {
    case 'ShotReferencesChanged':
      void queryClient.invalidateQueries({ queryKey: shotLibraryKeys.references })
      return
  }
}

function publishShotLibraryMutationEvent(event: ShotLibraryMutationEvent): void {
  publishAppEvent({
    topic: 'shot-library.mutation',
    scope: { kind: 'global' },
    source: 'query-invalidation',
    payload: event,
    raw: event,
  })
}

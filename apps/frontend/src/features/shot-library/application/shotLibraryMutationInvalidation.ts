import { shotLibraryKeys } from '@/features/shot-library/application/shotLibraryQueryKeys'

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

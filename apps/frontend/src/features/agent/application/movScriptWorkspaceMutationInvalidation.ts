import { movScriptWorkspaceKeys } from '@/features/agent/application/movScriptWorkspaceQueryKeys'

export interface MovScriptWorkspaceQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export type MovScriptWorkspaceMutationEvent =
  | {
    type: 'WorkspaceFilesChanged'
    changedIds: readonly string[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'WorkspaceFileChanged'
    path: string | null | undefined
    changedIds: readonly string[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }

export interface MovScriptWorkspaceMutationResult {
  event: MovScriptWorkspaceMutationEvent
  changedIds: readonly string[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function workspaceFilesChangedResult(input: {
  changedPaths?: readonly string[]
  snapshotVersion?: number
} = {}): MovScriptWorkspaceMutationResult {
  return movScriptWorkspaceMutationResult({
    type: 'WorkspaceFilesChanged',
    changedIds: input.changedPaths ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function workspaceFileChangedResult(input: {
  path: string | null | undefined
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): MovScriptWorkspaceMutationResult {
  const changedPaths = input.changedPaths ?? (input.path ? [input.path] : [])
  return movScriptWorkspaceMutationResult({
    type: 'WorkspaceFileChanged',
    path: input.path,
    changedIds: changedPaths,
    changedPaths,
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function invalidateMovScriptWorkspaceMutationResult(
  queryClient: MovScriptWorkspaceQueryInvalidator,
  result: MovScriptWorkspaceMutationResult,
): void {
  invalidateMovScriptWorkspaceMutationEvent(queryClient, result.event)
}

export function invalidateMovScriptWorkspaceMutationEvent(
  queryClient: MovScriptWorkspaceQueryInvalidator,
  event: MovScriptWorkspaceMutationEvent,
): void {
  switch (event.type) {
    case 'WorkspaceFilesChanged':
      void queryClient.invalidateQueries({ queryKey: movScriptWorkspaceKeys.filesScope })
      return
    case 'WorkspaceFileChanged':
      void queryClient.invalidateQueries({ queryKey: movScriptWorkspaceKeys.file(event.path) })
      return
  }
}

function movScriptWorkspaceMutationResult(
  event: MovScriptWorkspaceMutationEvent,
): MovScriptWorkspaceMutationResult {
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

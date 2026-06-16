import { contentCanvasKeys } from './contentCanvasQueryKeys'

export interface ContentCanvasQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export type ContentCanvasMutationEvent = {
  type: 'ContentCanvasProjectChanged'
  projectId: number | undefined
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export interface ContentCanvasMutationResult {
  event: ContentCanvasMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function contentCanvasProjectChangedResult(input: {
  projectId: number | undefined
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): ContentCanvasMutationResult {
  return contentCanvasMutationResult({
    type: 'ContentCanvasProjectChanged',
    projectId: input.projectId,
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function invalidateContentCanvasMutationResult(
  queryClient: ContentCanvasQueryInvalidator,
  result: ContentCanvasMutationResult,
): void {
  invalidateContentCanvasMutationEvent(queryClient, result.event)
}

export function invalidateContentCanvasMutationEvent(
  queryClient: ContentCanvasQueryInvalidator,
  event: ContentCanvasMutationEvent,
): void {
  switch (event.type) {
    case 'ContentCanvasProjectChanged':
      if (!event.projectId) return
      void queryClient.invalidateQueries({ queryKey: contentCanvasKeys.project(event.projectId) })
      return
  }
}

function contentCanvasMutationResult(event: ContentCanvasMutationEvent): ContentCanvasMutationResult {
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

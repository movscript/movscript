import { canvasKeys } from '@/features/canvas/application/canvasQueryKeys'
import type { Canvas } from '@/types'

export interface CanvasQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export interface CanvasQueryCacheManager extends CanvasQueryInvalidator {
  cancelQueries: (options: { queryKey: readonly unknown[] }) => Promise<unknown>
  getQueryData: <TData>(queryKey: readonly unknown[]) => TData | undefined
  setQueryData: <TData>(
    queryKey: readonly unknown[],
    updater: TData | ((current: TData | undefined) => TData | undefined),
  ) => unknown
}

export interface CanvasRenameMutationContext {
  previousCanvas?: Canvas
}

export type CanvasMutationEvent =
  | {
    type: 'CanvasListChanged'
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'CanvasDocumentChanged'
    canvasId: number | string
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }

export interface CanvasMutationResult {
  event: CanvasMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function canvasListChangedResult(input: {
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
} = {}): CanvasMutationResult {
  return canvasMutationResult({
    type: 'CanvasListChanged',
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function canvasDocumentChangedResult(input: {
  canvasId: number | string
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): CanvasMutationResult {
  return canvasMutationResult({
    type: 'CanvasDocumentChanged',
    canvasId: input.canvasId,
    changedIds: input.changedIds ?? [input.canvasId],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function invalidateCanvasMutationResult(
  queryClient: CanvasQueryInvalidator,
  result: CanvasMutationResult,
): void {
  invalidateCanvasMutationEvent(queryClient, result.event)
}

export function invalidateCanvasMutationEvent(
  queryClient: CanvasQueryInvalidator,
  event: CanvasMutationEvent,
): void {
  switch (event.type) {
    case 'CanvasListChanged':
      void queryClient.invalidateQueries({ queryKey: canvasKeys.all })
      return
    case 'CanvasDocumentChanged':
      void queryClient.invalidateQueries({ queryKey: canvasKeys.detail(event.canvasId) })
      return
  }
}

export async function prepareCanvasRenameMutation(
  queryClient: CanvasQueryCacheManager,
  canvasId: number | string,
  name: string,
): Promise<CanvasRenameMutationContext> {
  const queryKey = canvasKeys.detail(canvasId)
  const nextName = name.trim()
  await queryClient.cancelQueries({ queryKey })
  const previousCanvas = queryClient.getQueryData<Canvas>(queryKey)
  if (previousCanvas) queryClient.setQueryData<Canvas>(queryKey, { ...previousCanvas, name: nextName })
  return previousCanvas ? { previousCanvas } : {}
}

export function restoreCanvasRenameMutation(
  queryClient: CanvasQueryCacheManager,
  canvasId: number | string,
  context: CanvasRenameMutationContext | undefined,
): Canvas | undefined {
  if (!context?.previousCanvas) return undefined
  queryClient.setQueryData<Canvas>(canvasKeys.detail(canvasId), context.previousCanvas)
  return context.previousCanvas
}

export function commitCanvasRenameMutation(
  queryClient: CanvasQueryCacheManager,
  canvasId: number | string,
  nextCanvas: Canvas,
): void {
  queryClient.setQueryData<Canvas>(
    canvasKeys.detail(canvasId),
    (current) => current ? { ...current, name: nextCanvas.name } : nextCanvas,
  )
}

function canvasMutationResult(event: CanvasMutationEvent): CanvasMutationResult {
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

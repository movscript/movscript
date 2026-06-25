import {
  canvasResourceKeys,
  externalResourceKeys,
  resourceBindingKeys,
  resourceCandidateKeys,
  resourceKeys,
  type ResourceQueryInvalidator,
} from '../../resourceQueryKeys.js'
import { projectAppEventScope, publishAppEvent } from '@movscript/shared/app-events'

export type ResourceMutationEvent =
  | {
    type: 'AssetCandidateSelected'
    projectId: number
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'ResourceLibraryChanged'
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'ResourceBindingChanged'
    projectId?: number
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'ExternalResourceSourcesChanged'
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }
  | {
    type: 'CanvasResourceChanged'
    changedIds: readonly (number | string)[]
    changedPaths: readonly string[]
    snapshotVersion?: number
  }

export interface ResourceMutationResult {
  event: ResourceMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export const resourceMutationConsumerKeys = {
  workTargets: (projectId: number, target: 'asset-slots' | 'asset-slot-candidates' | 'keyframes') => ['work-targets', projectId, target] as const,
  semanticPage: (projectId: number, page: 'asset-slot-candidates' | 'asset-slots' | 'keyframes' | 'candidate-decisions' | 'review-events' | 'scene-moment') => [`semantic-${page}-page`, projectId] as const,
  semanticContentPositioning: (projectId: number, scope?: 'keyframes') => scope
    ? ['semantic-content-positioning', projectId, scope] as const
    : ['semantic-content-positioning', projectId] as const,
  semanticSegmentWorkspace: (projectId: number) => ['semantic-segment-workspace', projectId] as const,
  projectWorkspace: (projectId: number) => ['project-workspace', projectId] as const,
  productionFrame: (projectId: number) => ['production-frame', projectId] as const,
  workbench: (projectId: number, kind: 'assets' | 'production') => ['workbench', kind, projectId] as const,
}

export function assetCandidateSelectedResult(input: {
  projectId: number
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): ResourceMutationResult {
  const event: ResourceMutationEvent = {
    type: 'AssetCandidateSelected',
    projectId: input.projectId,
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

export function resourceLibraryChangedResult(input: {
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
} = {}): ResourceMutationResult {
  return resourceMutationResult({
    type: 'ResourceLibraryChanged',
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function resourceBindingChangedResult(input: {
  projectId?: number
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
} = {}): ResourceMutationResult {
  return resourceMutationResult({
    type: 'ResourceBindingChanged',
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function externalResourceSourcesChangedResult(input: {
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
} = {}): ResourceMutationResult {
  return resourceMutationResult({
    type: 'ExternalResourceSourcesChanged',
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function canvasResourceChangedResult(input: {
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
} = {}): ResourceMutationResult {
  return resourceMutationResult({
    type: 'CanvasResourceChanged',
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  })
}

export function invalidateResourceMutationResult(
  queryClient: ResourceQueryInvalidator,
  result: ResourceMutationResult,
): void {
  publishResourceMutationEvent(result.event)
  invalidateResourceMutationEvent(queryClient, result.event)
}

export function invalidateResourceMutationEvent(
  queryClient: ResourceQueryInvalidator,
  event: ResourceMutationEvent,
): void {
  switch (event.type) {
    case 'AssetCandidateSelected':
      invalidateAssetCandidateSelected(queryClient, event)
      return
    case 'ResourceLibraryChanged':
      invalidateResourceLibraryChanged(queryClient)
      return
    case 'ResourceBindingChanged':
      invalidateResourceBindingChanged(queryClient, event)
      return
    case 'ExternalResourceSourcesChanged':
      invalidateExternalResourceSourcesChanged(queryClient)
      return
    case 'CanvasResourceChanged':
      invalidateCanvasResourceChanged(queryClient)
      return
  }
}

function resourceMutationResult(event: ResourceMutationEvent): ResourceMutationResult {
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

function publishResourceMutationEvent(event: ResourceMutationEvent): void {
  publishAppEvent({
    topic: 'resource.mutation',
    scope: 'projectId' in event ? projectAppEventScope(event.projectId) : { kind: 'resource' },
    source: 'query-invalidation',
    payload: event,
  })
}

function invalidateAssetCandidateSelected(
  queryClient: ResourceQueryInvalidator,
  event: Extract<ResourceMutationEvent, { type: 'AssetCandidateSelected' }>,
): void {
  for (const queryKey of assetCandidateSelectedQueryKeys(event.projectId)) {
    void queryClient.invalidateQueries({ queryKey })
  }
  void queryClient.invalidateQueries({ queryKey: resourceCandidateKeys.targetsForProject(event.projectId) })
  void queryClient.invalidateQueries({ queryKey: resourceCandidateKeys.generatedTargets(event.projectId) })
}

function invalidateResourceLibraryChanged(queryClient: ResourceQueryInvalidator): void {
  void queryClient.invalidateQueries({ queryKey: resourceKeys.all })
}

function invalidateResourceBindingChanged(
  queryClient: ResourceQueryInvalidator,
  event: Extract<ResourceMutationEvent, { type: 'ResourceBindingChanged' }>,
): void {
  void queryClient.invalidateQueries({ queryKey: resourceBindingKeys.all })
  if (event.projectId !== undefined) {
    void queryClient.invalidateQueries({ queryKey: resourceBindingKeys.projectLibraryScope(event.projectId) })
  }
}

function invalidateExternalResourceSourcesChanged(queryClient: ResourceQueryInvalidator): void {
  void queryClient.invalidateQueries({ queryKey: externalResourceKeys.sources })
}

function invalidateCanvasResourceChanged(queryClient: ResourceQueryInvalidator): void {
  void queryClient.invalidateQueries({ queryKey: canvasResourceKeys.shelf })
  void queryClient.invalidateQueries({ queryKey: canvasResourceKeys.nodeResources })
}

function assetCandidateSelectedQueryKeys(projectId: number): readonly (readonly unknown[])[] {
  return [
    resourceMutationConsumerKeys.workTargets(projectId, 'asset-slots'),
    resourceMutationConsumerKeys.workTargets(projectId, 'asset-slot-candidates'),
    resourceMutationConsumerKeys.workTargets(projectId, 'keyframes'),
    resourceMutationConsumerKeys.semanticPage(projectId, 'asset-slot-candidates'),
    resourceMutationConsumerKeys.semanticPage(projectId, 'asset-slots'),
    resourceMutationConsumerKeys.semanticPage(projectId, 'keyframes'),
    resourceMutationConsumerKeys.semanticPage(projectId, 'candidate-decisions'),
    resourceMutationConsumerKeys.semanticPage(projectId, 'review-events'),
    resourceMutationConsumerKeys.semanticContentPositioning(projectId, 'keyframes'),
    resourceMutationConsumerKeys.semanticContentPositioning(projectId),
    resourceMutationConsumerKeys.semanticPage(projectId, 'scene-moment'),
    resourceMutationConsumerKeys.semanticSegmentWorkspace(projectId),
    resourceMutationConsumerKeys.projectWorkspace(projectId),
    resourceMutationConsumerKeys.productionFrame(projectId),
    resourceMutationConsumerKeys.workbench(projectId, 'assets'),
    resourceMutationConsumerKeys.workbench(projectId, 'production'),
  ]
}

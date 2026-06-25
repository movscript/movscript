import { scriptKeys } from './scriptQueryKeys'
import { projectAppEventScope, publishAppEvent } from '@movscript/shared/app-events'

export interface ScriptQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export type ScriptMutationEvent = {
  type: 'ScriptSaved' | 'ScriptCategoryChanged' | 'ScriptVersionCreated' | 'ScriptCreated'
  projectId: number | undefined
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export interface ScriptMutationResult {
  event: ScriptMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function scriptSavedResult(input: ScriptMutationInput): ScriptMutationResult {
  return scriptMutationResult(scriptMutationEvent('ScriptSaved', input))
}

export function scriptCategoryChangedResult(input: ScriptMutationInput): ScriptMutationResult {
  return scriptMutationResult(scriptMutationEvent('ScriptCategoryChanged', input))
}

export function scriptVersionCreatedResult(input: ScriptMutationInput): ScriptMutationResult {
  return scriptMutationResult(scriptMutationEvent('ScriptVersionCreated', input))
}

export function scriptCreatedResult(input: ScriptMutationInput): ScriptMutationResult {
  return scriptMutationResult(scriptMutationEvent('ScriptCreated', input))
}

export function invalidateScriptMutationResult(
  queryClient: ScriptQueryInvalidator,
  result: ScriptMutationResult,
): void {
  publishScriptMutationEvent(result.event)
  invalidateScriptMutationEvent(queryClient, result.event)
}

export function invalidateScriptMutationEvent(
  queryClient: ScriptQueryInvalidator,
  event: ScriptMutationEvent,
): void {
  switch (event.type) {
    case 'ScriptSaved':
      refreshProjectScripts(queryClient, event.projectId)
      refreshScriptVersions(queryClient, event.projectId)
      return
    case 'ScriptCategoryChanged':
      refreshProjectScripts(queryClient, event.projectId)
      return
    case 'ScriptVersionCreated':
      refreshProjectScripts(queryClient, event.projectId)
      refreshScriptVersions(queryClient, event.projectId)
      return
    case 'ScriptCreated':
      refreshProjectScripts(queryClient, event.projectId)
      refreshScriptArtifactRefs(queryClient, event.projectId)
      return
  }
}

interface ScriptMutationInput {
  projectId: number | undefined
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}

function scriptMutationEvent(
  type: ScriptMutationEvent['type'],
  input: ScriptMutationInput,
): ScriptMutationEvent {
  return {
    type,
    projectId: input.projectId,
    changedIds: input.changedIds ?? [],
    changedPaths: input.changedPaths ?? [],
    ...(input.snapshotVersion !== undefined ? { snapshotVersion: input.snapshotVersion } : {}),
  }
}

function scriptMutationResult(event: ScriptMutationEvent): ScriptMutationResult {
  return {
    event,
    changedIds: event.changedIds,
    changedPaths: event.changedPaths,
    ...(event.snapshotVersion !== undefined ? { snapshotVersion: event.snapshotVersion } : {}),
  }
}

function publishScriptMutationEvent(event: ScriptMutationEvent): void {
  publishAppEvent({
    topic: 'script.mutation',
    scope: projectAppEventScope(event.projectId),
    source: 'query-invalidation',
    payload: event,
    raw: event,
  })
}

function refreshProjectScripts(queryClient: ScriptQueryInvalidator, projectId: number | undefined): void {
  void queryClient.invalidateQueries({ queryKey: scriptKeys.projectScriptScope(projectId) })
}

function refreshScriptVersions(queryClient: ScriptQueryInvalidator, projectId: number | undefined): void {
  void queryClient.invalidateQueries({ queryKey: scriptKeys.versions(projectId) })
}

function refreshScriptArtifactRefs(queryClient: ScriptQueryInvalidator, projectId: number | undefined): void {
  void queryClient.invalidateQueries({ queryKey: scriptKeys.artifactRefs(projectId) })
}

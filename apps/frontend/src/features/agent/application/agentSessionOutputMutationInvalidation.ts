import { agentSessionOutputKeys } from '@/features/agent/application/agentSessionOutputQueryKeys'

export interface AgentSessionOutputQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => Promise<unknown> | unknown
}

export interface AgentSessionOutputMutationEvent {
  type: 'AgentSessionOutputContentWorkspaceChanged'
  projectId: number | undefined
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export interface AgentSessionOutputMutationResult {
  event: AgentSessionOutputMutationEvent
  changedIds: readonly (number | string)[]
  changedPaths: readonly string[]
  snapshotVersion?: number
}

export function agentSessionOutputContentWorkspaceChangedResult(input: {
  projectId: number | undefined
  changedIds?: readonly (number | string)[]
  changedPaths?: readonly string[]
  snapshotVersion?: number
}): AgentSessionOutputMutationResult {
  const event: AgentSessionOutputMutationEvent = {
    type: 'AgentSessionOutputContentWorkspaceChanged',
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

export function invalidateAgentSessionOutputMutationResult(
  queryClient: AgentSessionOutputQueryInvalidator,
  result: AgentSessionOutputMutationResult,
): Promise<unknown> | unknown {
  return invalidateAgentSessionOutputMutationEvent(queryClient, result.event)
}

export function invalidateAgentSessionOutputMutationEvent(
  queryClient: AgentSessionOutputQueryInvalidator,
  event: AgentSessionOutputMutationEvent,
): Promise<unknown> | unknown {
  switch (event.type) {
    case 'AgentSessionOutputContentWorkspaceChanged':
      return queryClient.invalidateQueries({ queryKey: agentSessionOutputKeys.contentWorkspace(event.projectId) })
  }
}

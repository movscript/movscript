import type { AgentRun, AgentTaskGraphSnapshot, ProviderSessionEventV2 } from '@movscript/core/agent/protocol'

export interface AgentPlanSnapshotQueryCacheWriter {
  setQueryData: <TData>(
    queryKey: readonly unknown[],
    updater: (current: TData | undefined) => TData | undefined,
  ) => unknown
}

export function applyAgentPlanProviderSessionEventToCache(
  queryClient: AgentPlanSnapshotQueryCacheWriter,
  queryKey: readonly unknown[],
  event: ProviderSessionEventV2,
  taskGraphId: string,
): void {
  queryClient.setQueryData<AgentTaskGraphSnapshot | undefined>(
    queryKey,
    (current) => applyAgentPlanProviderSessionEvent(current, event, taskGraphId),
  )
}

export function applyAgentPlanProviderSessionEvent(
  current: AgentTaskGraphSnapshot | undefined,
  event: ProviderSessionEventV2,
  taskGraphId: string,
): AgentTaskGraphSnapshot | undefined {
  if (event.entity?.type === 'task_graph' && event.entity.value.taskGraph.id === taskGraphId) return event.entity.value
  if (event.entity?.type !== 'run' || event.entity.value.taskGraphId !== taskGraphId || !current) return current
  return agentPlanSnapshotWithRun(current, event.entity.value)
}

function agentPlanSnapshotWithRun(
  current: AgentTaskGraphSnapshot,
  nextRun: AgentRun,
): AgentTaskGraphSnapshot {
  const runExists = current.runs.some((run) => run.id === nextRun.id)
  return {
    ...current,
    summary: undefined,
    runs: runExists
      ? current.runs.map((run) => run.id === nextRun.id ? nextRun : run)
      : [...current.runs, nextRun],
  }
}

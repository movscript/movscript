import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { shouldPollPlanSnapshot } from '@/features/agent/domain/agentPlanUi'
import { localAgentClient, type AgentRuntimeEventV2, type AgentTaskGraphSnapshot, type AgentRun } from '@/shared/infrastructure/localAgentClient'

interface UseAgentActivePlanSnapshotInput {
  activeRun: AgentRun | null
  localRuntimeEnabled: boolean
  localAgentOnline: boolean
}

export function useAgentActivePlanSnapshot({
  activeRun,
  localRuntimeEnabled,
  localAgentOnline,
}: UseAgentActivePlanSnapshotInput) {
  const queryClient = useQueryClient()
  const taskGraphId = activeRun?.taskGraphId
  const enabled = localRuntimeEnabled && localAgentOnline && !!taskGraphId
  const queryKey = useMemo(
    () => ['local-agent-taskGraph-snapshot', localAgentClient.baseURL, taskGraphId ?? null] as const,
    [taskGraphId],
  )
  const query = useQuery<AgentTaskGraphSnapshot>({
    queryKey,
    queryFn: async () => {
      if (!taskGraphId) throw new Error('active run is not attached to a task graph')
      await localAgentClient.ensureRunning()
      return localAgentClient.getTaskGraphSnapshot(taskGraphId)
    },
    enabled,
    retry: false,
    refetchInterval: (query) => shouldPollPlanSnapshot(query.state.data, activeRun) ? 1500 : false,
  })

  useEffect(() => {
    if (!enabled || !taskGraphId) return
    const controller = new AbortController()
    void localAgentClient.ensureRunning()
      .then(() => localAgentClient.streamPlan(taskGraphId, {
        signal: controller.signal,
        onRuntimeEvent: (event) => {
          queryClient.setQueryData<AgentTaskGraphSnapshot | undefined>(
            queryKey,
            (current) => applyPlanRuntimeEvent(current, event, taskGraphId),
          )
        },
      }))
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [enabled, queryClient, queryKey, taskGraphId])

  return query
}

function applyPlanRuntimeEvent(
  current: AgentTaskGraphSnapshot | undefined,
  event: AgentRuntimeEventV2,
  taskGraphId: string,
): AgentTaskGraphSnapshot | undefined {
  if (event.entity?.type === 'task_graph' && event.entity.value.taskGraph.id === taskGraphId) return event.entity.value
  if (event.entity?.type !== 'run' || event.entity.value.taskGraphId !== taskGraphId || !current) return current
  const nextRun = event.entity.value
  const runExists = current.runs.some((run) => run.id === nextRun.id)
  return {
    ...current,
    summary: undefined,
    runs: runExists
      ? current.runs.map((run) => run.id === nextRun.id ? nextRun : run)
      : [...current.runs, nextRun],
  }
}

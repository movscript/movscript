import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { shouldPollPlanSnapshot } from '@/features/agent/domain/agentPlanUi'
import { isTerminalAgentRunStatus } from '@/features/agent/domain/agentRunControl'
import { localAgentClient, type AgentRuntimeEventV2, type AgentTaskGraphSnapshot, type AgentRun } from '@/shared/infrastructure/localAgentClient'

interface UseAgentActivePlanSnapshotInput {
  activeRun: AgentRun | null
  localRuntimeEnabled: boolean
  localAgentOnline: boolean
  sessionId?: string
}

export function useAgentActivePlanSnapshot({
  activeRun,
  localRuntimeEnabled,
  localAgentOnline,
  sessionId,
}: UseAgentActivePlanSnapshotInput) {
  const queryClient = useQueryClient()
  const runtimeClient = useMemo(() => sessionId?.trim()
    ? localAgentClient.forSession({ sessionId: sessionId.trim() })
    : localAgentClient, [sessionId])
  const taskGraphId = activeRun?.taskGraphId
  const enabled = localRuntimeEnabled && localAgentOnline && !!taskGraphId
  const queryKey = useMemo(
    () => ['local-agent-taskGraph-snapshot', runtimeClient.baseURL, sessionId?.trim() || null, taskGraphId ?? null] as const,
    [runtimeClient.baseURL, sessionId, taskGraphId],
  )
  const query = useQuery<AgentTaskGraphSnapshot>({
    queryKey,
    queryFn: async () => {
      if (!taskGraphId) throw new Error('active run is not attached to a task graph')
      await runtimeClient.ensureRunning()
      return runtimeClient.getTaskGraphSnapshot(taskGraphId)
    },
    enabled,
    retry: false,
    refetchInterval: (query) => shouldPollPlanSnapshot(query.state.data, activeRun) ? 1500 : false,
  })

  const terminalSnapshotRefreshKeyRef = useRef<string | null>(null)
  const terminalSnapshotRefreshKey = enabled && activeRun && isTerminalAgentRunStatus(activeRun.status)
    ? `${taskGraphId}:${activeRun.id}:${activeRun.status}:${activeRun.updatedAt}`
    : null
  useEffect(() => {
    if (!terminalSnapshotRefreshKey) return
    if (terminalSnapshotRefreshKeyRef.current === terminalSnapshotRefreshKey) return
    terminalSnapshotRefreshKeyRef.current = terminalSnapshotRefreshKey
    void query.refetch()
  }, [query, terminalSnapshotRefreshKey])

  useEffect(() => {
    if (!enabled || !taskGraphId) return
    const controller = new AbortController()
    void runtimeClient.ensureRunning()
      .then(() => runtimeClient.streamPlan(taskGraphId, {
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
  }, [enabled, queryClient, queryKey, runtimeClient, taskGraphId])

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

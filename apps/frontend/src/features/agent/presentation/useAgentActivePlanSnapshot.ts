import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { shouldPollPlanSnapshot } from '@/features/agent/domain/agentPlanUi'
import { isTerminalAgentRunStatus } from '@/features/agent/domain/agentRunControl'
import { providerSessionClient, type ProviderSessionEventV2, type AgentTaskGraphSnapshot, type AgentRun } from '@/shared/infrastructure/providerSessionClient'

interface UseAgentActivePlanSnapshotInput {
  activeRun: AgentRun | null
  providerSessionEnabled: boolean
  providerSessionOnline: boolean
  sessionId?: string
}

export function useAgentActivePlanSnapshot({
  activeRun,
  providerSessionEnabled,
  providerSessionOnline,
  sessionId,
}: UseAgentActivePlanSnapshotInput) {
  const queryClient = useQueryClient()
  const providerSessionPlanClient = useMemo(() => sessionId?.trim()
    ? providerSessionClient.forSession({ sessionId: sessionId.trim() })
    : providerSessionClient, [sessionId])
  const taskGraphId = activeRun?.taskGraphId
  const enabled = providerSessionEnabled && providerSessionOnline && !!taskGraphId
  const queryKey = useMemo(
    () => ['provider-session-taskGraph-snapshot', providerSessionPlanClient.baseURL, sessionId?.trim() || null, taskGraphId ?? null] as const,
    [providerSessionPlanClient.baseURL, sessionId, taskGraphId],
  )
  const query = useQuery<AgentTaskGraphSnapshot>({
    queryKey,
    queryFn: async () => {
      if (!taskGraphId) throw new Error('active run is not attached to a task graph')
      await providerSessionPlanClient.ensureRunning()
      return providerSessionPlanClient.getTaskGraphSnapshot(taskGraphId)
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
    void providerSessionPlanClient.ensureRunning()
      .then(() => providerSessionPlanClient.streamPlan(taskGraphId, {
        signal: controller.signal,
        onProviderEvent: (event) => {
          queryClient.setQueryData<AgentTaskGraphSnapshot | undefined>(
            queryKey,
            (current) => applyPlanProviderSessionEvent(current, event, taskGraphId),
          )
        },
      }))
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [enabled, providerSessionPlanClient, queryClient, queryKey, taskGraphId])

  return query
}

function applyPlanProviderSessionEvent(
  current: AgentTaskGraphSnapshot | undefined,
  event: ProviderSessionEventV2,
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

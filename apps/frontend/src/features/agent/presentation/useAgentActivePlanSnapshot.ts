import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { shouldPollPlanSnapshot } from '@/features/agent/domain/agentPlanUi'
import { isAgentRunTerminalStatus } from '@movscript/core/agent/protocol'
import { agentPlanKeys } from '@/features/agent/application/agentQueryKeys'
import { applyAgentPlanProviderSessionEventToCache } from '@/features/agent/application/agentPlanSnapshotQueryCache'
import { providerSessionClient, type AgentTaskGraphSnapshot, type AgentRun } from '@/shared/infrastructure/providerSessionClient'

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
    () => agentPlanKeys.taskGraphSnapshot(providerSessionPlanClient.baseURL, sessionId?.trim() || null, taskGraphId ?? null),
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
  const terminalSnapshotRefreshKey = enabled && activeRun && isAgentRunTerminalStatus(activeRun.status)
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
          applyAgentPlanProviderSessionEventToCache(queryClient, queryKey, event, taskGraphId)
        },
      }))
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [enabled, providerSessionPlanClient, queryClient, queryKey, taskGraphId])

  return query
}

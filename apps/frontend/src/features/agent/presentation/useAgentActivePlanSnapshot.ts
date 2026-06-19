import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { shouldPollPlanSnapshot } from '@/features/agent/domain/agentPlanUi'
import { isAgentRunTerminalStatus, type AgentTaskGraphSnapshot, type AgentRun } from '@movscript/core/agent/protocol'
import { agentPlanKeys } from '@/features/agent/application/agentQueryKeys'
import { applyAgentPlanProviderSessionEventToCache } from '@/features/agent/application/agentPlanSnapshotQueryCache'
import {
  fetchAgentPlanTaskGraphSnapshot,
  streamAgentPlanTaskGraphSnapshot,
} from '@/features/agent/application/agentPlanSnapshotService'

interface UseAgentActivePlanSnapshotInput {
  activeRun: AgentRun | null
  providerSessionEnabled: boolean
  providerSessionOnline: boolean
  providerSessionTreeId?: string
  sessionId?: string // legacy provider-session input; prefer providerSessionTreeId.
}

export function useAgentActivePlanSnapshot({
  activeRun,
  providerSessionEnabled,
  providerSessionOnline,
  providerSessionTreeId,
  sessionId: legacySessionId,
}: UseAgentActivePlanSnapshotInput) {
  const queryClient = useQueryClient()
  const taskGraphId = activeRun?.taskGraphId
  const enabled = providerSessionEnabled && providerSessionOnline && !!taskGraphId
  const normalizedProviderSessionTreeId = providerSessionTreeId?.trim() || legacySessionId?.trim() || null
  const queryKey = useMemo(
    () => agentPlanKeys.taskGraphSnapshot(normalizedProviderSessionTreeId, taskGraphId ?? null),
    [normalizedProviderSessionTreeId, taskGraphId],
  )
  const query = useQuery<AgentTaskGraphSnapshot>({
    queryKey,
    queryFn: async () => {
      if (!taskGraphId) throw new Error('active run is not attached to a task graph')
      return fetchAgentPlanTaskGraphSnapshot({
        providerSessionTreeId: normalizedProviderSessionTreeId ?? undefined,
        taskGraphId,
      })
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
    void streamAgentPlanTaskGraphSnapshot({
      providerSessionTreeId: normalizedProviderSessionTreeId ?? undefined,
      taskGraphId,
      signal: controller.signal,
      onProviderEvent: (event) => {
        applyAgentPlanProviderSessionEventToCache(queryClient, queryKey, event, taskGraphId)
      },
    })
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [enabled, queryClient, queryKey, taskGraphId, normalizedProviderSessionTreeId])

  return query
}

import { useQuery } from '@tanstack/react-query'
import { shouldPollPlanSnapshot } from '@/lib/agentPlanUi'
import { localAgentClient, type AgentTaskGraphSnapshot, type AgentRun } from '@/lib/localAgentClient'

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
  return useQuery<AgentTaskGraphSnapshot>({
    queryKey: ['local-agent-taskGraph-snapshot', localAgentClient.baseURL, activeRun?.taskGraphId ?? null, activeRun?.updatedAt ?? null],
    queryFn: async () => {
      if (!activeRun?.taskGraphId) throw new Error('active run is not attached to a task graph')
      await localAgentClient.ensureRunning()
      return localAgentClient.getTaskGraphSnapshot(activeRun.taskGraphId)
    },
    enabled: localRuntimeEnabled && localAgentOnline && !!activeRun?.taskGraphId,
    retry: false,
    refetchInterval: (query) => shouldPollPlanSnapshot(query.state.data, activeRun) ? 1500 : false,
  })
}

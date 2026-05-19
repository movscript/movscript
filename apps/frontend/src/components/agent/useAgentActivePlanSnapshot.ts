import { useQuery } from '@tanstack/react-query'
import { shouldPollPlanSnapshot } from '@/lib/agentPlanUi'
import { localAgentClient, type AgentPlanSnapshot, type AgentRun } from '@/lib/localAgentClient'

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
  return useQuery<AgentPlanSnapshot>({
    queryKey: ['local-agent-plan-snapshot', localAgentClient.baseURL, activeRun?.planId ?? null, activeRun?.updatedAt ?? null],
    queryFn: async () => {
      if (!activeRun?.planId) throw new Error('active run is not attached to a plan')
      await localAgentClient.ensureRunning()
      return localAgentClient.getPlanSnapshot(activeRun.planId)
    },
    enabled: localRuntimeEnabled && localAgentOnline && !!activeRun?.planId,
    retry: false,
    refetchInterval: (query) => shouldPollPlanSnapshot(query.state.data, activeRun) ? 1500 : false,
  })
}

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { localAgentClient, type AgentHealth } from '@/lib/localAgentClient'

export interface UseAgentLocalRuntimeContextControllerOptions {
  enabled?: boolean
}

export function useAgentLocalRuntimeContextController({
  enabled = true,
}: UseAgentLocalRuntimeContextControllerOptions) {
  const {
    data: localAgentHealth,
    error: localAgentHealthError,
    refetch: refetchLocalAgentHealth,
  } = useQuery<AgentHealth>({
    queryKey: ['local-agent-health', localAgentClient.baseURL],
    queryFn: () => localAgentClient.ensureRunning(),
    enabled,
    retry: false,
    refetchInterval: enabled ? 5000 : false,
  })

  const localAgentOnline = !!localAgentHealth?.ok && !localAgentHealthError

  const refreshAgentCatalogContext = useCallback(() => {
    void refetchLocalAgentHealth()
  }, [refetchLocalAgentHealth])

  return {
    localAgentHealth,
    localAgentOnline,
    refetchLocalAgentHealth,
    refreshAgentCatalogContext,
  }
}

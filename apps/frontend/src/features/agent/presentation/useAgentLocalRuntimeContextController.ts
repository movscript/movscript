import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { localAgentClient, type AgentHealth } from '@/shared/infrastructure/localAgentClient'

export interface UseAgentLocalRuntimeContextControllerOptions {
  enabled?: boolean
  sessionId?: string
}

export function useAgentLocalRuntimeContextController({
  enabled = true,
  sessionId,
}: UseAgentLocalRuntimeContextControllerOptions) {
  const runtimeClient = useMemo(() => sessionId?.trim()
    ? localAgentClient.forSession({ sessionId: sessionId.trim() })
    : localAgentClient, [sessionId])
  const {
    data: localAgentHealth,
    error: localAgentHealthError,
    refetch: refetchLocalAgentHealth,
  } = useQuery<AgentHealth>({
    queryKey: ['local-agent-health', runtimeClient.baseURL, sessionId?.trim() || null],
    queryFn: () => runtimeClient.ensureRunning(),
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

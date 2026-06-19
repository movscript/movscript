import { useQuery } from '@tanstack/react-query'
import {
  ensureAgentProviderSessionHealth,
  type AgentProviderSessionHealth,
} from '@/features/agent/application/agentProviderSessionHealthService'
import { providerSessionKeys } from '@/features/agent/application/providerSessionQueryKeys'

export interface UseProviderSessionContextControllerOptions {
  enabled?: boolean
  sessionId?: string
}

export function useProviderSessionContextController({
  enabled = true,
  sessionId,
}: UseProviderSessionContextControllerOptions) {
  const trimmedSessionId = sessionId?.trim() || null
  const {
    data: providerSessionHealth,
    error: providerSessionHealthError,
    refetch: refetchProviderSessionHealth,
  } = useQuery<AgentProviderSessionHealth>({
    queryKey: providerSessionKeys.health(trimmedSessionId),
    queryFn: () => ensureAgentProviderSessionHealth({ sessionId: trimmedSessionId ?? undefined }),
    enabled,
    retry: false,
    refetchInterval: enabled ? 5000 : false,
  })

  const providerSessionOnline = !!providerSessionHealth?.ok && !providerSessionHealthError

  return {
    providerSessionHealth,
    providerSessionOnline,
    refetchProviderSessionHealth,
  }
}

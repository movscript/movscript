import { useQuery } from '@tanstack/react-query'
import {
  ensureAgentProviderSessionHealth,
  type AgentProviderSessionHealth,
} from '@/features/agent/application/agentProviderSessionHealthService'
import { providerSessionKeys } from '@/features/agent/application/providerSessionQueryKeys'

export interface UseProviderSessionContextControllerOptions {
  enabled?: boolean
  providerSessionTreeId?: string
  sessionId?: string // legacy provider-session input; prefer providerSessionTreeId.
}

export function useProviderSessionContextController({
  enabled = true,
  providerSessionTreeId,
  sessionId: legacySessionId,
}: UseProviderSessionContextControllerOptions) {
  const normalizedProviderSessionTreeId = providerSessionTreeId?.trim() || legacySessionId?.trim() || null
  const {
    data: providerSessionHealth,
    error: providerSessionHealthError,
    refetch: refetchProviderSessionHealth,
  } = useQuery<AgentProviderSessionHealth>({
    queryKey: providerSessionKeys.health(normalizedProviderSessionTreeId),
    queryFn: () => ensureAgentProviderSessionHealth({ providerSessionTreeId: normalizedProviderSessionTreeId ?? undefined }),
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

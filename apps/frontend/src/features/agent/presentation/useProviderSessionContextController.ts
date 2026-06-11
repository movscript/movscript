import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { providerSessionClient, type ProviderSessionHealth } from '@/shared/infrastructure/providerSessionClient'

export interface UseProviderSessionContextControllerOptions {
  enabled?: boolean
  sessionId?: string
}

export function useProviderSessionContextController({
  enabled = true,
  sessionId,
}: UseProviderSessionContextControllerOptions) {
  const providerSessionHealthClient = useMemo(() => sessionId?.trim()
    ? providerSessionClient.forSession({ sessionId: sessionId.trim() })
    : providerSessionClient, [sessionId])
  const {
    data: providerSessionHealth,
    error: providerSessionHealthError,
    refetch: refetchProviderSessionHealth,
  } = useQuery<ProviderSessionHealth>({
    queryKey: ['provider-session-health', providerSessionHealthClient.baseURL, sessionId?.trim() || null],
    queryFn: () => providerSessionHealthClient.ensureRunning(),
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

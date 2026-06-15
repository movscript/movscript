import type { QueryKey } from '@tanstack/react-query'

export interface ProviderSessionQueryIdentity {
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
}

export type ProviderSessionThreadSurface = 'agent-mode-sidebar' | 'agent-content-panel'

export const providerSessionThreadKeys = {
  all: (baseURL: string) => ['provider-session-threads', baseURL] as const,
  list: (baseURL: string, identity: ProviderSessionQueryIdentity, surface: ProviderSessionThreadSurface) => [
    'provider-session-threads',
    baseURL,
    identity,
    surface,
  ] as const,
  panelHistory: (baseURL: string) => ['provider-session-panel-thread-history', baseURL] as const,
  console: ['agent-console-threads', 'provider-sessions'] as const,
}

export const providerSessionKeys = {
  workspace: ['agent-console-provider-sessions', 'workspace'] as const,
  health: (baseURL: string, sessionId: string | null) => ['provider-session-health', baseURL, sessionId] as const,
  list: (baseURL: string, identity: ProviderSessionQueryIdentity, surface: ProviderSessionThreadSurface) => [
    'provider-sessions',
    baseURL,
    identity,
    surface,
  ] as const,
}

export const providerSessionRunKeys = {
  console: ['agent-console-runs', 'provider-sessions'] as const,
}

export function isProviderSessionThreadListQueryKey(queryKey: QueryKey, baseURL: string): boolean {
  return Array.isArray(queryKey)
    && queryKey[0] === providerSessionThreadKeys.all(baseURL)[0]
    && queryKey[1] === baseURL
}

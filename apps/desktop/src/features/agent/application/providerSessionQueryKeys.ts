import type { QueryKey } from '@tanstack/react-query'

export interface ProviderSessionQueryIdentity {
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
}

export type ProviderSessionThreadSurface = 'agent-mode-sidebar' | 'agent-content-panel'

export const providerSessionThreadKeys = {
  all: ['provider-session-threads'] as const,
  list: (identity: ProviderSessionQueryIdentity, surface: ProviderSessionThreadSurface) => [
    'provider-session-threads',
    identity,
    surface,
  ] as const,
  panelHistory: ['provider-session-panel-thread-history'] as const,
  console: ['agent-console-threads', 'provider-sessions'] as const,
  consoleProfile: (providerProfileKey: string) => ['agent-console-threads', 'provider-sessions', providerProfileKey] as const,
}

export const providerSessionKeys = {
  workspace: ['agent-console-provider-sessions', 'workspace'] as const,
  workspaceProfile: (providerProfileKey: string) => ['agent-console-provider-sessions', 'workspace', providerProfileKey] as const,
  health: (providerSessionTreeId: string | null) => ['provider-session-health', providerSessionTreeId] as const,
  list: (identity: ProviderSessionQueryIdentity, surface: ProviderSessionThreadSurface) => [
    'provider-sessions',
    identity,
    surface,
  ] as const,
}

export const providerSessionRunKeys = {
  console: ['agent-console-runs', 'provider-sessions'] as const,
  consoleProfile: (providerProfileKey: string) => ['agent-console-runs', 'provider-sessions', providerProfileKey] as const,
}

export const providerSessionConsoleProfileKey = (providerProfileKey: string | undefined): string => (
  providerProfileKey?.trim() || 'none'
)

export function isProviderSessionThreadListQueryKey(queryKey: QueryKey): boolean {
  return Array.isArray(queryKey)
    && queryKey[0] === providerSessionThreadKeys.all[0]
}

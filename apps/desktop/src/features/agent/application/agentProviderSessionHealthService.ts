import {
  agentProviderSessionCompatibilityClient,
  agentProviderSessionTreeIdForCompatibilityInput,
  type ProviderSessionHealth,
} from '@/features/agent/infrastructure/agentProviderSessionCompatibility'

export type AgentProviderSessionHealth = ProviderSessionHealth

export async function ensureAgentProviderSessionHealth(input: {
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
} = {}): Promise<AgentProviderSessionHealth> {
  const providerSessionTreeId = agentProviderSessionTreeIdForCompatibilityInput(input)
  const compatibilityClient = agentProviderSessionCompatibilityClient('provider-session-health-compat')
  const client = providerSessionTreeId
    ? compatibilityClient.forSession({ sessionId: providerSessionTreeId })
    : compatibilityClient
  return client.ensureRunning()
}

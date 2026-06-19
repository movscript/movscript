import { providerSessionClient, type ProviderSessionHealth } from '@/shared/infrastructure/providerSessionClient'

export type AgentProviderSessionHealth = ProviderSessionHealth

export async function ensureAgentProviderSessionHealth(input: {
  sessionId?: string
} = {}): Promise<AgentProviderSessionHealth> {
  const sessionId = input.sessionId?.trim()
  const client = sessionId
    ? providerSessionClient.forSession({ sessionId })
    : providerSessionClient
  return client.ensureRunning()
}

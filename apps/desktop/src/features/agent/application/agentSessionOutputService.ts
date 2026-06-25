import { agentProviderSessionCompatibilityClient } from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type { AgentRun } from '@movscript/agent-protocol'

export interface AgentSessionThreadRunsResult {
  threadId: string
  runs: AgentRun[]
}

export async function listAgentSessionThreadRuns(input: {
  providerSessionTreeId?: string
  providerThreadId: string
}): Promise<AgentSessionThreadRunsResult> {
  const providerThreadId = input.providerThreadId.trim()
  const providerSessionTreeId = input.providerSessionTreeId?.trim()
  const compatibilityClient = agentProviderSessionCompatibilityClient('session-output-diagnostics')
  const client = providerSessionTreeId
    ? compatibilityClient.forSession({ sessionId: providerSessionTreeId })
    : compatibilityClient
  return client.listRunsByThread(providerThreadId)
}

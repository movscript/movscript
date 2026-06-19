import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { AgentRun } from '@movscript/core/agent/protocol'

export interface AgentSessionThreadRunsResult {
  threadId: string
  runs: AgentRun[]
}

export async function listAgentSessionThreadRuns(input: {
  providerSessionTreeId?: string
  providerThreadId: string
}): Promise<AgentSessionThreadRunsResult> {
  const providerThreadId = input.providerThreadId.trim()
  const sessionId = input.providerSessionTreeId?.trim()
  const client = sessionId
    ? providerSessionClient.forSession({ sessionId })
    : providerSessionClient
  return client.listRunsByThread(providerThreadId)
}

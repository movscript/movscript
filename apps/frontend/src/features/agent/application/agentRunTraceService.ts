import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { AgentRunTraceSummary, AgentTraceEvent } from '@movscript/core/agent/protocol'
import type { AgentRunTraceResponse } from '@/shared/infrastructure/provider-session-client/types'

export type AgentRunTraceKind = AgentTraceEvent['kind']

export async function getAgentRunTraceSummary(input: {
  sessionId?: string
  runId: string
}): Promise<AgentRunTraceSummary> {
  return agentRunTraceClient(input.sessionId).getRunTraceSummary(input.runId)
}

export async function listAgentRunTraceEvents(input: {
  sessionId?: string
  runId: string
  limit?: number
  cursor?: string
  kind?: AgentRunTraceKind
}): Promise<AgentRunTraceResponse> {
  return agentRunTraceClient(input.sessionId).getRunTraceEvents(input.runId, {
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
  })
}

function agentRunTraceClient(sessionId: string | undefined) {
  const trimmedSessionId = sessionId?.trim()
  return trimmedSessionId
    ? providerSessionClient.forSession({ sessionId: trimmedSessionId })
    : providerSessionClient
}

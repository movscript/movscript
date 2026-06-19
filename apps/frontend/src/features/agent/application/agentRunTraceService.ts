import {
  agentProviderSessionCompatibilityClient,
  agentProviderSessionTreeIdForCompatibilityInput,
  type AgentRunTraceResponse,
} from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type { AgentRunTraceSummary, AgentTraceEvent } from '@movscript/core/agent/protocol'

export type AgentRunTraceKind = AgentTraceEvent['kind']

export async function getAgentRunTraceSummary(input: {
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
  runId: string
}): Promise<AgentRunTraceSummary> {
  return agentRunTraceClient(input).getRunTraceSummary(input.runId)
}

export async function listAgentRunTraceEvents(input: {
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
  runId: string
  limit?: number
  cursor?: string
  kind?: AgentRunTraceKind
}): Promise<AgentRunTraceResponse> {
  return agentRunTraceClient(input).getRunTraceEvents(input.runId, {
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
  })
}

function agentRunTraceClient(input: { providerSessionTreeId?: string; sessionId?: string }) {
  const providerSessionTreeId = agentProviderSessionTreeIdForCompatibilityInput(input)
  const compatibilityClient = agentProviderSessionCompatibilityClient('run-trace-diagnostics')
  return providerSessionTreeId
    ? compatibilityClient.forSession({ sessionId: providerSessionTreeId })
    : compatibilityClient
}

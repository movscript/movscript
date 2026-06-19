import {
  agentProviderSessionCompatibilityClient,
  agentProviderSessionTreeIdForCompatibilityInput,
} from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type { AgentTaskGraphSnapshot, ProviderSessionEventV2 } from '@movscript/core/agent/protocol'

export interface AgentPlanSnapshotRuntimeInput {
  providerSessionTreeId?: string
  sessionId?: string // deprecated legacy provider-session input; normalize to providerSessionTreeId.
  taskGraphId: string
}

export async function fetchAgentPlanTaskGraphSnapshot(
  input: AgentPlanSnapshotRuntimeInput,
): Promise<AgentTaskGraphSnapshot> {
  const client = agentPlanSnapshotClient(input)
  await client.ensureRunning()
  return client.getTaskGraphSnapshot(input.taskGraphId)
}

export async function streamAgentPlanTaskGraphSnapshot(input: AgentPlanSnapshotRuntimeInput & {
  signal: AbortSignal
  onProviderEvent: (event: ProviderSessionEventV2) => void
}): Promise<void> {
  const client = agentPlanSnapshotClient(input)
  await client.ensureRunning()
  await client.streamPlan(input.taskGraphId, {
    signal: input.signal,
    onProviderEvent: input.onProviderEvent,
  })
}

function agentPlanSnapshotClient(input: { providerSessionTreeId?: string; sessionId?: string }) {
  const providerSessionTreeId = agentProviderSessionTreeIdForCompatibilityInput(input)
  const compatibilityClient = agentProviderSessionCompatibilityClient('plan-snapshot-compat')
  return providerSessionTreeId
    ? compatibilityClient.forSession({ sessionId: providerSessionTreeId })
    : compatibilityClient
}

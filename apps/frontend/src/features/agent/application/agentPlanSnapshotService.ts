import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { AgentTaskGraphSnapshot, ProviderSessionEventV2 } from '@movscript/core/agent/protocol'

export interface AgentPlanSnapshotRuntimeInput {
  sessionId?: string
  taskGraphId: string
}

export async function fetchAgentPlanTaskGraphSnapshot(
  input: AgentPlanSnapshotRuntimeInput,
): Promise<AgentTaskGraphSnapshot> {
  const client = agentPlanSnapshotClient(input.sessionId)
  await client.ensureRunning()
  return client.getTaskGraphSnapshot(input.taskGraphId)
}

export async function streamAgentPlanTaskGraphSnapshot(input: AgentPlanSnapshotRuntimeInput & {
  signal: AbortSignal
  onProviderEvent: (event: ProviderSessionEventV2) => void
}): Promise<void> {
  const client = agentPlanSnapshotClient(input.sessionId)
  await client.ensureRunning()
  await client.streamPlan(input.taskGraphId, {
    signal: input.signal,
    onProviderEvent: input.onProviderEvent,
  })
}

function agentPlanSnapshotClient(sessionId: string | undefined) {
  const trimmedSessionId = sessionId?.trim()
  return trimmedSessionId
    ? providerSessionClient.forSession({ sessionId: trimmedSessionId })
    : providerSessionClient
}

import { createAgentRuntimeTransport, type AgentRuntimeTransport } from '@/shared/infrastructure/agentRuntimeTransport'

export const DEFAULT_LOCAL_AGENT_HEALTH_TIMEOUT_MS = 5_000
export const DEFAULT_LOCAL_AGENT_REQUEST_TIMEOUT_MS = 30_000
export const DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS = 60_000

export function runtimeLocalAgentTransport(input: { workspaceDir?: string; sessionId?: string } = {}): AgentRuntimeTransport {
  return createAgentRuntimeTransport({
    ...(input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  })
}

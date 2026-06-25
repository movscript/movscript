import { agentProviderSessionCompatibilityClient } from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type { ProviderSessionEventV2 } from '@movscript/agent-protocol'

export type AgentProviderSessionStatusLightEvent = ProviderSessionEventV2

export interface AgentProviderSessionStatusLightStreamClient {
  forSession?: (input: { sessionId: string; workspaceDir?: string }) => AgentProviderSessionStatusLightStreamClient // legacy provider-session client contract
  streamSession: (sessionId: string, options: { onProviderEvent?: (event: AgentProviderSessionStatusLightEvent) => void; signal?: AbortSignal }) => Promise<void> // legacy provider-session client contract
  streamThread: (threadId: string, options: { onProviderEvent?: (event: AgentProviderSessionStatusLightEvent) => void; signal?: AbortSignal }) => Promise<void>
}

export function createAgentProviderSessionStatusLightStreamClient(): AgentProviderSessionStatusLightStreamClient {
  return agentProviderSessionCompatibilityClient('status-light-compat')
}

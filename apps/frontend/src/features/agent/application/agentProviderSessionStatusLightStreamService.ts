import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { ProviderSessionEventV2 } from '@movscript/core/agent/protocol'

export type AgentProviderSessionStatusLightEvent = ProviderSessionEventV2

export interface AgentProviderSessionStatusLightStreamClient {
  forSession?: (input: { sessionId: string; workspaceDir?: string }) => AgentProviderSessionStatusLightStreamClient
  streamSession: (sessionId: string, options: { onProviderEvent?: (event: AgentProviderSessionStatusLightEvent) => void; signal?: AbortSignal }) => Promise<void>
  streamThread: (threadId: string, options: { onProviderEvent?: (event: AgentProviderSessionStatusLightEvent) => void; signal?: AbortSignal }) => Promise<void>
}

export function createAgentProviderSessionStatusLightStreamClient(): AgentProviderSessionStatusLightStreamClient {
  return providerSessionClient
}

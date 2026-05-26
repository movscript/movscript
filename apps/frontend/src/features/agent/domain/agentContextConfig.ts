import type { AgentManifest } from '@/shared/infrastructure/localAgentClient'

export interface ConversationAgentContextConfig {
  enabled: boolean
  manifest: AgentManifest | null
}

export const EMPTY_AGENT_CONTEXT_CONFIG: ConversationAgentContextConfig = {
  enabled: false,
  manifest: null,
}

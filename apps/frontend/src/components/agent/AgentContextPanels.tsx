import type { AgentManifest } from '@/lib/localAgentClient'

export interface ConversationAgentContextConfig {
  enabled: boolean
  manifest: AgentManifest | null
}

export const EMPTY_AGENT_CONTEXT_CONFIG: ConversationAgentContextConfig = {
  enabled: false,
  manifest: null,
}

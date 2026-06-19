import type { ProviderManifest } from '@movscript/core/agent/protocol'

export interface ConversationAgentContextConfig {
  enabled: boolean
  manifest: ProviderManifest | null
}

export const EMPTY_AGENT_CONTEXT_CONFIG: ConversationAgentContextConfig = {
  enabled: false,
  manifest: null,
}

import { normalizeAgentManifest, type AgentManifest } from '../../../catalog/manifest/agentManifest.js'

export function resolveRuntimeAgentManifest(input: {
  inputManifest?: unknown
  activeAgentManifest: AgentManifest
}): AgentManifest {
  return normalizeAgentManifest(input.inputManifest ?? input.activeAgentManifest)
}

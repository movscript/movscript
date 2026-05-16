import { normalizeAgentManifest, type AgentManifest } from '../catalog/agentManifest.js'

export function resolveRuntimeAgentManifest(input: {
  inputManifest?: unknown
  defaultAgentManifest: AgentManifest
}): AgentManifest {
  return normalizeAgentManifest(input.inputManifest ?? input.defaultAgentManifest)
}

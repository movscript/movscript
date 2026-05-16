import type { AgentManifest } from '../catalog/agentManifest.js'
import { resolveAgentCapabilities, type CapabilityMCPClient } from '../tools/capabilityResolver.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentCapabilitiesResponse, AgentRunRole } from '../state/types.js'
import { resolveRuntimeAgentManifest } from './runtimeManifest.js'

export interface RuntimeCapabilitiesInput {
  agentManifest?: unknown
  currentProjectId?: number
  includeResources?: boolean
  runRole?: AgentRunRole
}

export function resolveRuntimeCapabilities(input: {
  mcpClient: CapabilityMCPClient
  defaultAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
  updateState?: AgentCapabilitiesResponse['updates']
  request?: RuntimeCapabilitiesInput
}): Promise<AgentCapabilitiesResponse> {
  const request = input.request ?? {}
  const agentManifest = resolveRuntimeAgentManifest({
    inputManifest: request.agentManifest,
    defaultAgentManifest: input.defaultAgentManifest,
  })
  return resolveAgentCapabilities({
    mcpClient: input.mcpClient,
    manifest: agentManifest,
    currentProjectId: request.currentProjectId,
    includeResources: request.includeResources,
    registry: input.toolRegistry,
    pluginCatalog: input.pluginCatalogInfo,
    warnings: input.pluginWarnings,
    updates: input.updateState,
    runRole: request.runRole,
  })
}

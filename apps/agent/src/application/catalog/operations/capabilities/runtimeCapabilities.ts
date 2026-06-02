import type { AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import { resolveAgentCapabilities, type CapabilityMCPClient } from '../../../../tools/catalog/capabilities/capabilityResolver.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { AgentCapabilitiesResponse, AgentRunRole } from '../../../../state/shared/types.js'
import { resolveRuntimeAgentManifest } from '../../manifest/runtimeManifest.js'

export interface RuntimeCapabilitiesInput {
  agentManifest?: unknown
  currentProjectId?: number
  includeResources?: boolean
  runRole?: AgentRunRole
}

export function resolveRuntimeCapabilities(input: {
  mcpClient: CapabilityMCPClient
  activeAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
  updateState?: AgentCapabilitiesResponse['updates']
  request?: RuntimeCapabilitiesInput
}): Promise<AgentCapabilitiesResponse> {
  const request = input.request ?? {}
  const agentManifest = resolveRuntimeAgentManifest({
    inputManifest: request.agentManifest,
    activeAgentManifest: input.activeAgentManifest,
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

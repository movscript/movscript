import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../catalog/agentManifest.js'
import type { AgentPluginCatalog, loadAgentPluginCatalog } from '../catalog/loader.js'
import type { AgentCapabilitiesResponse, AgentRuntimeRouterOptions } from '../state/types.js'
import { DEFAULT_TOOL_REGISTRY, type ToolRegistry } from '../tools/toolRegistry.js'

export interface RuntimeCatalogInitialization {
  defaultAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings: string[]
  shouldReloadCatalog: boolean
}

export function resolveRuntimeCatalogInitialization(input: {
  defaultAgentManifest?: AgentManifest
  toolRegistry?: ToolRegistry
  pluginCatalog?: AgentPluginCatalog
  pluginCatalogLoader?: AgentRuntimeRouterOptions['pluginCatalogLoader']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
  loadCatalogSnapshot: typeof loadAgentPluginCatalog
}): RuntimeCatalogInitialization {
  const initialCatalog = input.pluginCatalog
  const builtinCatalog = initialCatalog ?? (!input.pluginCatalogLoader
    && !input.defaultAgentManifest
    && !input.toolRegistry
    ? input.loadCatalogSnapshot()
    : undefined)
  const defaultAgentManifest = input.defaultAgentManifest ?? builtinCatalog?.manifest ?? DEFAULT_AGENT_MANIFEST
  const toolRegistry = input.toolRegistry ?? builtinCatalog?.registry ?? DEFAULT_TOOL_REGISTRY
  const layeredRegistry = builtinCatalog?.layeredRegistry
    ?? input.loadCatalogSnapshot({
      baseManifest: defaultAgentManifest,
      baseTools: toolRegistry.list(),
    }).layeredRegistry
  const pluginCatalogInfo = input.pluginCatalogInfo ?? (builtinCatalog
    ? {
      skillsDir: builtinCatalog.skillsDir,
      toolsDir: builtinCatalog.toolsDir,
      builtinSkillsDir: builtinCatalog.builtinSkillsDir,
      builtinToolsDir: builtinCatalog.builtinToolsDir,
      skillCount: builtinCatalog.layeredSkills.length,
      toolCount: builtinCatalog.layeredTools.length,
    }
    : undefined)
  return {
    defaultAgentManifest,
    toolRegistry,
    layeredRegistry,
    ...(pluginCatalogInfo ? { pluginCatalogInfo } : {}),
    pluginWarnings: input.pluginWarnings ?? builtinCatalog?.warnings ?? [],
    shouldReloadCatalog: Boolean(input.pluginCatalogLoader && !initialCatalog),
  }
}

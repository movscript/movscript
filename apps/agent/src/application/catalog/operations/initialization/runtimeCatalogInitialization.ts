import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentPluginCatalog, loadAgentPluginCatalog } from '../../../../catalog/loading/core/loader.js'
import type { AgentCapabilitiesResponse, AgentRuntimeRouterOptions } from '../../../../state/shared/types.js'
import { DEFAULT_TOOL_REGISTRY, type ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'

export interface RuntimeCatalogInitialization {
  activeAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings: string[]
  shouldReloadCatalog: boolean
}

export function resolveRuntimeCatalogInitialization(input: {
  activeAgentManifest?: AgentManifest
  toolRegistry?: ToolRegistry
  pluginCatalog?: AgentPluginCatalog
  pluginCatalogLoader?: AgentRuntimeRouterOptions['pluginCatalogLoader']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
  loadCatalogSnapshot: typeof loadAgentPluginCatalog
}): RuntimeCatalogInitialization {
  const initialCatalog = input.pluginCatalog
  const builtinCatalog = initialCatalog ?? (!input.pluginCatalogLoader
    && !input.activeAgentManifest
    && !input.toolRegistry
    ? input.loadCatalogSnapshot()
    : undefined)
  const activeAgentManifest = input.activeAgentManifest ?? builtinCatalog?.manifest ?? DEFAULT_AGENT_MANIFEST
  const toolRegistry = input.toolRegistry ?? builtinCatalog?.registry ?? DEFAULT_TOOL_REGISTRY
  const layeredRegistry = builtinCatalog?.layeredRegistry
    ?? input.loadCatalogSnapshot({
      baseManifest: activeAgentManifest,
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
    activeAgentManifest,
    toolRegistry,
    layeredRegistry,
    ...(pluginCatalogInfo ? { pluginCatalogInfo } : {}),
    pluginWarnings: input.pluginWarnings ?? builtinCatalog?.warnings ?? [],
    shouldReloadCatalog: Boolean(input.pluginCatalogLoader && !initialCatalog),
  }
}

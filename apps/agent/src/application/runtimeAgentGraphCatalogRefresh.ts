import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentDebugContextPanel, AgentMessage, AgentRun, AgentRunRole, ResolvedAgentSkill, ResolvedToolCatalog } from '../state/types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import { resolveAgentCapabilities, type CapabilityMCPClient } from '../tools/capabilityResolver.js'
import { resolveRuntimeLayers } from '../skills/runtimeLayerResolver.js'
import { activeSkillStateFromRun } from '../skills/activeSkillState.js'
import type { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'

export interface RuntimeAgentGraphCatalogRefreshResult {
  manifest: AgentManifest
  capabilities: ResolvedToolCatalog
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  registry: ToolRegistry
  warnings: string[]
}

export async function refreshRuntimeAgentGraphCatalog(input: {
  run: AgentRun
  catalogSnapshots: Pick<RuntimeCatalogSnapshotRegistry, 'captureRun'>
  mcpClient: CapabilityMCPClient
  currentProjectId?: number
  updateState?: Parameters<typeof resolveAgentCapabilities>[0]['updates']
  userMessage: string
  debugContext: AgentDebugContextPanel
  clientInput?: NormalizedClientInput
  history: AgentMessage[]
  runRole?: AgentRunRole
}): Promise<RuntimeAgentGraphCatalogRefreshResult> {
  const catalogSnapshot = input.catalogSnapshots.captureRun(input.run.id)
  const refreshedBaseManifest = input.run.metadata?.manifestSource === 'default'
    ? catalogSnapshot.defaultAgentManifest
    : input.run.agentManifest ?? catalogSnapshot.defaultAgentManifest
  const activeSkillState = activeSkillStateFromRun(input.run)
  const refreshedLayers = input.run.metadata?.manifestSource === 'default' && catalogSnapshot.layeredRegistry.profiles.size > 0
    ? resolveRuntimeLayers({
      registry: catalogSnapshot.layeredRegistry,
      baseManifest: refreshedBaseManifest,
      message: input.userMessage,
      debugContext: input.debugContext,
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
      history: input.history,
      requestedSkillIds: activeSkillState.loadedSkillIds,
      unloadedSkillIds: activeSkillState.unloadedSkillIds,
    })
    : undefined
  const refreshedManifest = refreshedLayers?.manifest ?? refreshedBaseManifest
  input.run.agentManifest = refreshedManifest
  const refreshedSkills = refreshedLayers?.skills ?? []
  const refreshedCapabilities = await resolveAgentCapabilities({
    mcpClient: input.mcpClient,
    manifest: refreshedManifest,
    currentProjectId: input.currentProjectId,
    registry: catalogSnapshot.toolRegistry,
    pluginCatalog: catalogSnapshot.pluginCatalogInfo,
    warnings: [...catalogSnapshot.pluginWarnings, ...(refreshedLayers?.warnings ?? [])],
    updates: input.updateState,
    ...(refreshedLayers ? { activeSkills: refreshedSkills } : {}),
    userMessage: input.userMessage,
    runRole: input.runRole,
  })
  return {
    manifest: refreshedManifest,
    capabilities: refreshedCapabilities.resolvedTools,
    skills: refreshedSkills,
    ...(refreshedLayers?.skillDiscovery ? { skillDiscovery: refreshedLayers.skillDiscovery } : {}),
    registry: catalogSnapshot.toolRegistry,
    warnings: refreshedCapabilities.warnings,
  }
}

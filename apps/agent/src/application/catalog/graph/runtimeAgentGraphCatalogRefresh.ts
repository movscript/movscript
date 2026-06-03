import type { NormalizedClientInput } from '../../../context/input/client/normalizeClientInput.js'
import type { AgentDebugContextPanel, AgentMessage, AgentRun, AgentRunRole, ResolvedAgentSkill, ResolvedToolCatalog } from '../../../state/shared/types.js'
import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type { SkillDiscoverySummary } from '../../../context/prompt/registry/promptCandidateParts.js'
import type { ToolRegistry } from '../../../tools/registry/core/toolRegistry.js'
import { resolveAgentCapabilities, type CapabilityMCPClient } from '../../../tools/catalog/capabilities/capabilityResolver.js'
import { addSkillToolGrantsToManifest, resolveRuntimeLayers } from '../../../skills/resolution/layers/runtimeLayerResolver.js'
import { activeSkillStateFromRun } from '../../../skills/activation/state/activeSkillState.js'
import type { RuntimeCatalogSnapshotRegistry } from '../snapshot/core/runtimeCatalogSnapshot.js'

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
    ? catalogSnapshot.activeAgentManifest
    : input.run.agentManifest ?? catalogSnapshot.activeAgentManifest
  const activeSkillState = activeSkillStateFromRun(input.run)
  const shouldResolveLayers = catalogSnapshot.layeredRegistry.configFiles.size > 0
    && (input.run.metadata?.manifestSource === 'default' || activeSkillState.loadedSkillIds.length > 0 || activeSkillState.unloadedSkillIds.length > 0)
  const refreshedLayers = shouldResolveLayers
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
  const refreshedManifest = refreshedLayers?.manifest
    ? input.run.metadata?.manifestSource === 'default'
      ? refreshedLayers.manifest
      : mergeSkillToolGrantsIntoManifest(refreshedBaseManifest, refreshedLayers.manifest, refreshedLayers.skills, catalogSnapshot.layeredRegistry)
    : refreshedBaseManifest
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

function mergeSkillToolGrantsIntoManifest(
  base: AgentManifest,
  layered: AgentManifest,
  skills: ResolvedAgentSkill[],
  registry: Parameters<typeof addSkillToolGrantsToManifest>[1]['registry'],
): AgentManifest {
  return addSkillToolGrantsToManifest({
    ...base,
    metadata: {
      ...(base.metadata ?? {}),
      ...(layered.metadata?.resolvedFrom ? { resolvedFrom: layered.metadata.resolvedFrom } : {}),
      ...(layered.metadata?.configFileId ? { configFileId: layered.metadata.configFileId } : {}),
      ...(layered.metadata?.configFileVersion ? { configFileVersion: layered.metadata.configFileVersion } : {}),
    },
  }, {
    registry,
    skillIds: skills.map((skill) => skill.id),
  })
}

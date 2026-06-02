import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type { AgentConfigFile } from '../../../catalog/registry/shared/types.js'
import type { AgentRunExecutionConfig } from '../../../state/shared/types.js'
import type { AgentRuntimeCatalogSnapshot } from '../../catalog/snapshot/core/runtimeCatalogSnapshot.js'

export function runtimeLimitDefaultsFromConfigFile(
  catalogSnapshot: AgentRuntimeCatalogSnapshot,
  agentManifest: AgentManifest,
): { maxToolCalls?: number; maxIterations?: number; execution?: AgentRunExecutionConfig } {
  const configFile = activeConfigFileForManifest(catalogSnapshot, agentManifest)
  const limits = configFile?.limits
  if (!limits) return {}
  const execution = configFileExecutionDefaults(limits)
  return {
    ...(typeof limits.maxToolCalls === 'number' ? { maxToolCalls: limits.maxToolCalls } : {}),
    ...(typeof limits.maxIterations === 'number' ? { maxIterations: limits.maxIterations } : {}),
    ...(execution ? { execution } : {}),
  }
}

function activeConfigFileForManifest(
  catalogSnapshot: AgentRuntimeCatalogSnapshot,
  agentManifest: AgentManifest,
): AgentConfigFile | undefined {
  const configFileId = typeof agentManifest.metadata?.configFileId === 'string' && agentManifest.metadata.configFileId.trim()
    ? agentManifest.metadata.configFileId.trim()
    : typeof catalogSnapshot.activeAgentManifest.metadata?.configFileId === 'string' && catalogSnapshot.activeAgentManifest.metadata.configFileId.trim()
      ? catalogSnapshot.activeAgentManifest.metadata.configFileId.trim()
      : undefined
  return (configFileId ? catalogSnapshot.layeredRegistry.configFiles.get(configFileId) : undefined)
    ?? catalogSnapshot.layeredRegistry.configFiles.get('movscript.config_file.base')
    ?? (catalogSnapshot.layeredRegistry.configFiles.values().next().value as AgentConfigFile | undefined)
}

function configFileExecutionDefaults(limits: NonNullable<AgentConfigFile['limits']>): AgentRunExecutionConfig | undefined {
  if (!limits.executionMode && limits.allowForcedToolCalls === undefined) return undefined
  return {
    mode: limits.executionMode ?? 'standard',
    includeMemories: true,
    ...(limits.allowForcedToolCalls !== undefined ? { allowForcedToolCalls: limits.allowForcedToolCalls } : {}),
  }
}

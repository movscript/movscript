import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentPluginCatalog } from '../catalog/loader.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentCapabilitiesResponse } from '../state/types.js'

export interface AgentRuntimeCatalogSnapshot {
  id: string
  catalogVersion: string | null
  defaultAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings: string[]
}

export function buildRuntimeCatalogSnapshot(input: {
  id: string
  defaultAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
}): AgentRuntimeCatalogSnapshot {
  const catalogVersion = input.pluginCatalogInfo?.metadata?.catalogVersion
  return {
    id: input.id,
    catalogVersion: typeof catalogVersion === 'string' ? catalogVersion : null,
    defaultAgentManifest: input.defaultAgentManifest,
    toolRegistry: input.toolRegistry,
    layeredRegistry: input.layeredRegistry,
    ...(input.pluginCatalogInfo ? { pluginCatalogInfo: input.pluginCatalogInfo } : {}),
    pluginWarnings: input.pluginWarnings ?? [],
  }
}

export class RuntimeCatalogSnapshotRegistry {
  private currentSnapshot: AgentRuntimeCatalogSnapshot
  private readonly snapshotsByRunId = new Map<string, AgentRuntimeCatalogSnapshot>()

  constructor(snapshot: AgentRuntimeCatalogSnapshot) {
    this.currentSnapshot = snapshot
  }

  get current(): AgentRuntimeCatalogSnapshot {
    return this.currentSnapshot
  }

  replaceCurrent(snapshot: AgentRuntimeCatalogSnapshot): void {
    this.currentSnapshot = snapshot
  }

  captureRun(runId: string): AgentRuntimeCatalogSnapshot {
    const snapshot = this.currentSnapshot
    this.snapshotsByRunId.set(runId, snapshot)
    return snapshot
  }

  rememberRun(runId: string, snapshot: AgentRuntimeCatalogSnapshot): void {
    this.snapshotsByRunId.set(runId, snapshot)
  }

  getForRun(runId: string): AgentRuntimeCatalogSnapshot {
    return this.snapshotsByRunId.get(runId) ?? this.currentSnapshot
  }

  deleteRun(runId: string): void {
    this.snapshotsByRunId.delete(runId)
  }
}

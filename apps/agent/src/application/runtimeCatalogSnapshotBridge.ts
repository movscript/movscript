import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentPluginCatalog } from '../catalog/loader.js'
import type { AgentCapabilitiesResponse } from '../state/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import {
  createRuntimeCatalogSnapshot,
  type AgentRuntimeCatalogSnapshot,
} from './runtimeCatalogSnapshot.js'
import { makeId } from './runtimeIdentity.js'

export interface RuntimeCatalogSnapshotBridge {
  createSnapshot: () => AgentRuntimeCatalogSnapshot
}

export function createRuntimeCatalogSnapshotBridge(input: {
  getCatalogState: () => {
    defaultAgentManifest: AgentManifest
    toolRegistry: ToolRegistry
    layeredRegistry: AgentPluginCatalog['layeredRegistry']
    pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
    pluginWarnings: string[]
  }
}): RuntimeCatalogSnapshotBridge {
  return {
    createSnapshot: () => createRuntimeCatalogSnapshot({
      makeId: () => makeId('catalog'),
      ...input.getCatalogState(),
    }),
  }
}

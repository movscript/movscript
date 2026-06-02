import type { AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentPluginCatalog } from '../../../../catalog/loading/core/loader.js'
import type { AgentCapabilitiesResponse } from '../../../../state/shared/types.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import {
  createRuntimeCatalogSnapshot,
  type AgentRuntimeCatalogSnapshot,
} from '../core/runtimeCatalogSnapshot.js'
import { makeId } from '../../../../shared/runtime/runtimeIdentity.js'

export interface RuntimeCatalogSnapshotBridge {
  createSnapshot: () => AgentRuntimeCatalogSnapshot
}

export function createRuntimeCatalogSnapshotBridge(input: {
  getCatalogState: () => {
    activeAgentManifest: AgentManifest
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

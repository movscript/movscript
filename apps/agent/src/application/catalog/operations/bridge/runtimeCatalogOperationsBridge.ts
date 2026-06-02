import type { AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentPluginCatalog } from '../../../../catalog/loading/core/loader.js'
import type { CatalogRegistry } from '../../../../catalog/registry/shared/types.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { JSONValue } from '../../../../shared/protocol/types.js'
import type { AgentCapabilitiesResponse, AgentRun } from '../../../../state/shared/types.js'
import type { RuntimeCatalogSnapshotRegistry } from '../../snapshot/core/runtimeCatalogSnapshot.js'
import type { RuntimeCatalogSnapshotBridge } from '../../snapshot/bridge/runtimeCatalogSnapshotBridge.js'
import {
  getRuntimeActiveAgentManifest,
  inspectRuntimeAgentCatalog,
  listRuntimeConfigFileCatalog,
  listRuntimePackCatalog,
  listRuntimeRegisteredTools,
  listRuntimeSkillCatalog,
  updateRuntimeActiveSkills,
} from '../read/runtimeCatalogRead.js'
import { applyRuntimeAgentCatalogReload } from '../reload/runtimeCatalogReload.js'
import { resolveRuntimeCapabilities, type RuntimeCapabilitiesInput } from '../capabilities/runtimeCapabilities.js'

interface RuntimeCatalogOperationsState {
  activeAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: CatalogRegistry
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings: string[]
}

export interface RuntimeCatalogOperationsBridge {
  getCapabilities: (input?: RuntimeCapabilitiesInput) => Promise<AgentCapabilitiesResponse>
  listRegisteredTools: () => ReturnType<ToolRegistry['list']>
  listSkillCatalog: () => ReturnType<typeof listRuntimeSkillCatalog>
  listPackCatalog: () => ReturnType<typeof listRuntimePackCatalog>
  listConfigFileCatalog: () => ReturnType<typeof listRuntimeConfigFileCatalog>
  getActiveAgentManifest: () => AgentManifest
  reloadAgentCatalog: () => JSONValue
  inspectAgentCatalog: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  updateActiveSkills: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
}

export function createRuntimeCatalogOperationsBridge(input: {
  mcpClient: Parameters<typeof resolveRuntimeCapabilities>[0]['mcpClient']
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  catalogSnapshotBridge: RuntimeCatalogSnapshotBridge
  load?: () => AgentPluginCatalog
  getState: () => RuntimeCatalogOperationsState
  commitReload: (state: RuntimeCatalogOperationsState) => void
  updateState?: AgentCapabilitiesResponse['updates']
  capabilitiesResolver?: typeof resolveRuntimeCapabilities
  reloadRequest?: typeof applyRuntimeAgentCatalogReload
}): RuntimeCatalogOperationsBridge {
  const capabilitiesResolver = input.capabilitiesResolver ?? resolveRuntimeCapabilities
  const reloadRequest = input.reloadRequest ?? applyRuntimeAgentCatalogReload
  return {
    getCapabilities: (request = {}) => {
      const state = input.getState()
      return capabilitiesResolver({
        mcpClient: input.mcpClient,
        activeAgentManifest: state.activeAgentManifest,
        toolRegistry: state.toolRegistry,
        pluginCatalogInfo: state.pluginCatalogInfo,
        pluginWarnings: state.pluginWarnings,
        updateState: input.updateState,
        request,
      })
    },
    listRegisteredTools: () => listRuntimeRegisteredTools(input.getState().toolRegistry),
    listSkillCatalog: () => {
      const state = input.getState()
      return listRuntimeSkillCatalog(state.layeredRegistry, state.activeAgentManifest)
    },
    listPackCatalog: () => listRuntimePackCatalog(input.getState().layeredRegistry),
    listConfigFileCatalog: () => listRuntimeConfigFileCatalog(input.getState().layeredRegistry),
    getActiveAgentManifest: () => getRuntimeActiveAgentManifest(input.getState().activeAgentManifest),
    reloadAgentCatalog: () => {
      const state = input.getState()
      return reloadRequest({
        load: input.load,
        current: {
          catalogVersion: state.pluginCatalogInfo?.metadata?.catalogVersion as string | null | undefined ?? null,
          skillCount: state.layeredRegistry.skills.size,
          toolCount: state.layeredRegistry.tools.size,
        },
        commit: (reload) => {
          const catalog = reload.catalog
          input.commitReload({
            activeAgentManifest: catalog.manifest,
            toolRegistry: catalog.registry,
            layeredRegistry: catalog.layeredRegistry,
            pluginCatalogInfo: reload.pluginCatalogInfo,
            pluginWarnings: catalog.warnings,
          })
          input.catalogSnapshots.replaceCurrent(input.catalogSnapshotBridge.createSnapshot())
        },
      })
    },
    inspectAgentCatalog: (run, request = {}) => inspectRuntimeAgentCatalog({
      catalogSnapshots: input.catalogSnapshots,
      run,
      request,
    }),
    updateActiveSkills: (run, request = {}) => updateRuntimeActiveSkills({
      catalogSnapshots: input.catalogSnapshots,
      run,
      request,
    }),
  }
}

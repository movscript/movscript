import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentPluginCatalog } from '../catalog/loader.js'
import type { CatalogRegistry } from '../catalog/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { JSONValue } from '../types.js'
import type { AgentCapabilitiesResponse, AgentRun } from '../state/types.js'
import type { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import type { RuntimeCatalogSnapshotBridge } from './runtimeCatalogSnapshotBridge.js'
import {
  getRuntimeDefaultAgentManifest,
  inspectRuntimeAgentCatalog,
  listRuntimeProfileCatalog,
  listRuntimeRegisteredTools,
  listRuntimeSkillCatalog,
  updateRuntimeActiveSkills,
} from './runtimeCatalogRead.js'
import { applyRuntimeAgentCatalogReload } from './runtimeCatalogReload.js'
import { resolveRuntimeCapabilities, type RuntimeCapabilitiesInput } from './runtimeCapabilities.js'

interface RuntimeCatalogOperationsState {
  defaultAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: CatalogRegistry
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings: string[]
}

export interface RuntimeCatalogOperationsBridge {
  getCapabilities: (input?: RuntimeCapabilitiesInput) => Promise<AgentCapabilitiesResponse>
  listRegisteredTools: () => ReturnType<ToolRegistry['list']>
  listSkillCatalog: () => ReturnType<typeof listRuntimeSkillCatalog>
  listProfileCatalog: () => ReturnType<typeof listRuntimeProfileCatalog>
  getDefaultAgentManifest: () => AgentManifest
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
        defaultAgentManifest: state.defaultAgentManifest,
        toolRegistry: state.toolRegistry,
        pluginCatalogInfo: state.pluginCatalogInfo,
        pluginWarnings: state.pluginWarnings,
        updateState: input.updateState,
        request,
      })
    },
    listRegisteredTools: () => listRuntimeRegisteredTools(input.getState().toolRegistry),
    listSkillCatalog: () => listRuntimeSkillCatalog(input.getState().layeredRegistry),
    listProfileCatalog: () => listRuntimeProfileCatalog(input.getState().layeredRegistry),
    getDefaultAgentManifest: () => getRuntimeDefaultAgentManifest(input.getState().defaultAgentManifest),
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
            defaultAgentManifest: catalog.manifest,
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

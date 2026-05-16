import type { AgentManifest } from '../catalog/agentManifest.js'
import { inspectAgentCatalogView } from '../catalog/catalogInspectView.js'
import type { CatalogRegistry, SkillDefinition } from '../catalog/types.js'
import { activeSkillIdsFromRun } from '../skills/activeSkillView.js'
import type { AgentRun } from '../state/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { JSONValue } from '../types.js'
import type { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'

export function listRuntimeRegisteredTools(toolRegistry: ToolRegistry): ReturnType<ToolRegistry['list']> {
  return toolRegistry.list()
}

export function listRuntimeSkillCatalog(layeredRegistry: CatalogRegistry): SkillDefinition[] {
  return Array.from(layeredRegistry.skills.values())
}

export function getRuntimeDefaultAgentManifest(defaultAgentManifest: AgentManifest): AgentManifest {
  return defaultAgentManifest
}

export function inspectRuntimeAgentCatalog(input: {
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  run: Pick<AgentRun, 'id' | 'agentManifest' | 'traceEvents'>
  request?: Record<string, JSONValue>
}): JSONValue {
  const snapshot = input.catalogSnapshots.getForRun(input.run.id)
  return inspectAgentCatalogView({
    snapshot,
    runManifest: input.run.agentManifest,
    activeSkillIds: activeSkillIdsFromRun(input.run),
    request: input.request,
  })
}

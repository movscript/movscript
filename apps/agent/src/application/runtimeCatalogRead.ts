import type { AgentManifest } from '../catalog/agentManifest.js'
import { inspectAgentCatalogView } from '../catalog/catalogInspectView.js'
import type { AgentProfile, CatalogRegistry, SkillDefinition } from '../catalog/types.js'
import { activeSkillIdsFromRun } from '../skills/activeSkillView.js'
import { activeSkillStateFromRun, applyActiveSkillStateUpdate, writeActiveSkillStateToRun } from '../skills/activeSkillState.js'
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

export function listRuntimeProfileCatalog(layeredRegistry: CatalogRegistry): AgentProfile[] {
  return Array.from(layeredRegistry.profiles.values())
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

export function updateRuntimeActiveSkills(input: {
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  run: AgentRun
  request?: Record<string, JSONValue>
  now?: () => string
}): JSONValue {
  const snapshot = input.catalogSnapshots.getForRun(input.run.id)
  const load = stringList(input.request?.load)
  const unload = stringList(input.request?.unload)
  const reason = typeof input.request?.reason === 'string' ? input.request.reason : undefined
  const allowConflicts = input.request?.allowConflicts === true
  const knownSkillIds = new Set(snapshot.layeredRegistry.skills.keys())
  const missingSkillIds = [...load, ...unload].filter((id) => !knownSkillIds.has(id))
  const validRequestedLoad = load.filter((id) => knownSkillIds.has(id))
  const validUnload = unload.filter((id) => knownSkillIds.has(id))
  const dependencyResolution = expandSkillDependencies({
    registry: snapshot.layeredRegistry,
    skillIds: validRequestedLoad,
    blockedSkillIds: new Set(validUnload),
  })
  const validLoad = Array.from(new Set([...validRequestedLoad, ...dependencyResolution.dependencySkillIds])).sort()
  const current = activeSkillStateFromRun(input.run)
  const next = applyActiveSkillStateUpdate({
    current,
    load: validLoad,
    unload: validUnload,
    ...(reason ? { reason } : {}),
    now: input.now?.() ?? new Date().toISOString(),
  })
  const conflicts = collectSkillConflicts(snapshot.layeredRegistry, next.loadedSkillIds)
  if (conflicts.length > 0 && !allowConflicts) {
    return {
      status: 'conflict',
      eventType: 'skill.state_requested',
      requiresUserInput: true,
      loadedSkillIds: current.loadedSkillIds,
      unloadedSkillIds: current.unloadedSkillIds,
      proposedLoadedSkillIds: next.loadedSkillIds,
      proposedUnloadedSkillIds: next.unloadedSkillIds,
      missingSkillIds,
      missingDependencyIds: dependencyResolution.missingDependencyIds,
      blockedDependencyIds: dependencyResolution.blockedDependencyIds,
      dependencySkillIds: dependencyResolution.dependencySkillIds,
      conflicts,
      message: 'Requested skills contain mutually exclusive skills. Ask the user which style or specialist to use before loading them.',
      ...(reason ? { reason } : {}),
    } as unknown as JSONValue
  }
  writeActiveSkillStateToRun(input.run, next)
  const activeSkillIds = activeSkillIdsFromRun(input.run)
  return {
    status: missingSkillIds.length > 0 ? 'partial' : 'updated',
    eventType: 'skill.state_requested',
    loadedSkillIds: next.loadedSkillIds,
    unloadedSkillIds: next.unloadedSkillIds,
    activeSkillIds,
    missingSkillIds,
    missingDependencyIds: dependencyResolution.missingDependencyIds,
    blockedDependencyIds: dependencyResolution.blockedDependencyIds,
    dependencySkillIds: dependencyResolution.dependencySkillIds,
    conflicts,
    ...(next.reason ? { reason: next.reason } : {}),
    ...(next.updatedAt ? { updatedAt: next.updatedAt } : {}),
  } as unknown as JSONValue
}

function expandSkillDependencies(input: {
  registry: CatalogRegistry
  skillIds: string[]
  blockedSkillIds: Set<string>
}): {
  dependencySkillIds: string[]
  missingDependencyIds: string[]
  blockedDependencyIds: string[]
} {
  const dependencies = new Set<string>()
  const missing = new Set<string>()
  const blocked = new Set<string>()
  const seen = new Set(input.skillIds)
  const queue = [...input.skillIds]
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id) continue
    const skill = input.registry.skills.get(id)
    for (const dependencyId of skill?.dependencies ?? []) {
      if (input.blockedSkillIds.has(dependencyId)) {
        blocked.add(dependencyId)
        continue
      }
      if (!input.registry.skills.has(dependencyId)) {
        missing.add(dependencyId)
        continue
      }
      if (seen.has(dependencyId)) continue
      seen.add(dependencyId)
      dependencies.add(dependencyId)
      queue.push(dependencyId)
    }
  }
  return {
    dependencySkillIds: Array.from(dependencies).sort(),
    missingDependencyIds: Array.from(missing).sort(),
    blockedDependencyIds: Array.from(blocked).sort(),
  }
}

function collectSkillConflicts(registry: CatalogRegistry, loadedSkillIds: string[]): Array<{ id: string; conflictId: string }> {
  const loaded = new Set(loadedSkillIds)
  const seenPairs = new Set<string>()
  const pairs: Array<{ id: string; conflictId: string }> = []
  for (const id of loadedSkillIds) {
    const skill = registry.skills.get(id)
    for (const conflictId of skill?.conflicts ?? []) {
      if (!loaded.has(conflictId)) continue
      const ordered = [id, conflictId].sort()
      const key = `${ordered[0]}\0${ordered[1]}`
      if (seenPairs.has(key)) continue
      seenPairs.add(key)
      pairs.push({ id: ordered[0], conflictId: ordered[1] })
    }
  }
  return pairs
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))).sort()
}

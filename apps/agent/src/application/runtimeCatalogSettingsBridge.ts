import type { AgentManifest, AgentToolApprovalMode, AgentToolGrant } from '../catalog/agentManifest.js'
import type { AgentPluginCatalog } from '../catalog/loader.js'
import type { AgentProfile, CatalogRegistry, SkillDefinition, ToolGrant } from '../catalog/types.js'
import type { AgentCatalogStateStore } from '../catalog/state.js'
import type { JSONValue } from '../types.js'
import type { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import type { RuntimeCatalogSnapshotBridge } from './runtimeCatalogSnapshotBridge.js'

interface RuntimeCatalogSettingsState {
  defaultAgentManifest: AgentManifest
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
}

export interface RuntimeCatalogSettingsBridge {
  setDefaultAgentProfile: (input?: { profileId?: unknown }) => AgentManifest
  setDefaultToolPolicy: (input?: { toolGrants?: unknown }) => AgentManifest
  setDefaultSkillPolicy: (input?: { skills?: unknown }) => CatalogRegistry
}

export function createRuntimeCatalogSettingsBridge(input: {
  getState: () => RuntimeCatalogSettingsState
  setDefaultAgentManifest: (manifest: AgentManifest) => void
  setLayeredRegistry: (registry: CatalogRegistry) => void
  catalogStateStore: AgentCatalogStateStore
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  catalogSnapshotBridge: RuntimeCatalogSnapshotBridge
  now: () => string
}): RuntimeCatalogSettingsBridge {
  return {
    setDefaultAgentProfile: (request = {}) => {
      const profileId = typeof request.profileId === 'string' ? request.profileId.trim() : ''
      if (!profileId) throw new Error('profileId is required')
      const state = input.getState()
      const profile = state.layeredRegistry.profiles.get(profileId)
      if (!profile) throw new Error(`profile ${profileId} not found`)
      const nextManifest = applyToolPolicyOverrides(manifestWithDefaultProfile(state.defaultAgentManifest, profile), [])
      input.setDefaultAgentManifest(nextManifest)
      const existing = input.catalogStateStore.load()
      input.catalogStateStore.save({
        version: 1,
        updatedAt: input.now(),
        metadata: {
          ...(existing.metadata ?? {}),
          defaultProfileId: profile.id,
          defaultToolGrants: [],
        },
      })
      input.catalogSnapshots.replaceCurrent(input.catalogSnapshotBridge.createSnapshot())
      return nextManifest
    },
    setDefaultToolPolicy: (request = {}) => {
      const state = input.getState()
      const profile = defaultManifestProfile(state.defaultAgentManifest, state.layeredRegistry)
      if (!profile) throw new Error('default profile not found')
      const overrides = normalizeToolPolicyOverrides(request.toolGrants, profile.toolGrants)
      const existing = input.catalogStateStore.load()
      input.catalogStateStore.save({
        version: 1,
        updatedAt: input.now(),
        metadata: {
          ...(existing.metadata ?? {}),
          defaultToolGrants: overrides as unknown as JSONValue,
        },
      })
      const nextManifest = applyToolPolicyOverrides(manifestWithDefaultProfile(state.defaultAgentManifest, profile), overrides)
      input.setDefaultAgentManifest(nextManifest)
      input.catalogSnapshots.replaceCurrent(input.catalogSnapshotBridge.createSnapshot())
      return nextManifest
    },
    setDefaultSkillPolicy: (request = {}) => {
      const state = input.getState()
      const overrides = normalizeSkillPolicyOverrides(request.skills, state.layeredRegistry.skills)
      const nextRegistry = applySkillPolicyOverrides(state.layeredRegistry, overrides)
      assertSkillPolicyCompatible(state.layeredRegistry.skills, nextRegistry.skills, overrides.map((override) => override.id))
      const existing = input.catalogStateStore.load()
      input.catalogStateStore.save({
        version: 1,
        updatedAt: input.now(),
        metadata: {
          ...(existing.metadata ?? {}),
          defaultSkillOverrides: overrides as unknown as JSONValue,
        },
      })
      input.setLayeredRegistry(nextRegistry)
      input.catalogSnapshots.replaceCurrent(input.catalogSnapshotBridge.createSnapshot())
      return nextRegistry
    },
  }
}

export function applyCatalogStateToLayeredRegistry(
  registry: CatalogRegistry,
  state: ReturnType<AgentCatalogStateStore['load']>,
): CatalogRegistry {
  return applySkillPolicyOverrides(registry, catalogStateSkillPolicyOverrides(state))
}

export function applyCatalogStateToDefaultManifest(
  manifest: AgentManifest,
  state: ReturnType<AgentCatalogStateStore['load']>,
  registry: AgentPluginCatalog['layeredRegistry'],
): AgentManifest {
  const profileId = typeof state.metadata?.defaultProfileId === 'string' ? state.metadata.defaultProfileId.trim() : ''
  const profile = profileId ? registry.profiles.get(profileId) : defaultManifestProfile(manifest, registry)
  const baseManifest = profile ? manifestWithDefaultProfile(manifest, profile) : manifest
  return applyToolPolicyOverrides(baseManifest, catalogStateToolPolicyOverrides(state))
}

function manifestWithDefaultProfile(manifest: AgentManifest, profile: AgentProfile): AgentManifest {
  return {
    ...manifest,
    id: profile.id,
    version: profile.version,
    name: profile.name,
    ...(profile.description ? { description: profile.description } : {}),
    tools: profile.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    ...(profile.model?.provider && profile.model.modelId
      ? {
        model: {
          provider: profile.model.provider,
          modelId: profile.model.modelId,
          ...(profile.model.platformModelId !== undefined ? { platformModelId: Number(profile.model.platformModelId) } : {}),
        },
      }
      : {}),
    metadata: {
      ...(manifest.metadata ?? {}),
      profileId: profile.id,
      profileVersion: profile.version,
    },
  }
}

function defaultManifestProfile(manifest: AgentManifest, registry: AgentPluginCatalog['layeredRegistry']): AgentProfile | undefined {
  const profileId = typeof manifest.metadata?.profileId === 'string' ? manifest.metadata.profileId.trim() : ''
  return (profileId ? registry.profiles.get(profileId) : undefined)
    ?? registry.profiles.get('movscript.profile.default')
    ?? (registry.profiles.values().next().value as AgentProfile | undefined)
}

function applyToolPolicyOverrides(manifest: AgentManifest, overrides: AgentToolGrant[]): AgentManifest {
  if (overrides.length === 0) {
    return {
      ...manifest,
      metadata: {
        ...(manifest.metadata ?? {}),
        defaultToolGrants: [],
      },
    }
  }
  const byName = new Map(manifest.tools.map((grant) => [grant.name, grant]))
  for (const override of overrides) {
    if (!byName.has(override.name)) continue
    byName.set(override.name, {
      name: override.name,
      mode: override.mode,
      ...(override.approval ? { approval: override.approval } : {}),
    })
  }
  return {
    ...manifest,
    tools: manifest.tools.map((grant) => byName.get(grant.name) ?? grant),
    metadata: {
      ...(manifest.metadata ?? {}),
      defaultToolGrants: overrides as unknown as JSONValue,
    },
  }
}

function catalogStateToolPolicyOverrides(state: ReturnType<AgentCatalogStateStore['load']>): AgentToolGrant[] {
  return normalizeStoredToolGrants(state.metadata?.defaultToolGrants)
}

function catalogStateSkillPolicyOverrides(state: ReturnType<AgentCatalogStateStore['load']>): Array<{ id: string; enabled: boolean }> {
  return normalizeStoredSkillOverrides(state.metadata?.defaultSkillOverrides)
}

function applySkillPolicyOverrides(registry: CatalogRegistry, overrides: Array<{ id: string; enabled: boolean }>): CatalogRegistry {
  if (overrides.length === 0) return registry
  const skills = new Map(registry.skills)
  for (const override of overrides) {
    const skill = skills.get(override.id)
    if (!skill) continue
    skills.set(override.id, { ...skill, enabled: override.enabled } as SkillDefinition)
  }
  return {
    ...registry,
    skills,
  }
}

function normalizeSkillPolicyOverrides(input: unknown, baseSkills: CatalogRegistry['skills']): Array<{ id: string; enabled: boolean }> {
  if (!Array.isArray(input)) throw new Error('skills must be an array')
  const normalized = new Map<string, { id: string; enabled: boolean }>()
  for (const item of input) {
    if (!isToolGrantRecord(item)) throw new Error('skill entries must be objects')
    const id = normalizeNonEmptyString(item.id)
    if (!id) throw new Error('skill id is required')
    const skill = baseSkills.get(id)
    if (!skill) throw new Error(`skill ${id} not found`)
    if (skill.loadMode === 'core' && item.enabled === false) throw new Error(`core skill ${id} cannot be disabled`)
    if (typeof item.enabled !== 'boolean') throw new Error(`skill ${id} enabled must be boolean`)
    if (skill.enabled === item.enabled) continue
    normalized.set(id, { id, enabled: item.enabled })
  }
  return Array.from(normalized.values())
}

function normalizeStoredSkillOverrides(input: unknown): Array<{ id: string; enabled: boolean }> {
  if (!Array.isArray(input)) return []
  const overrides: Array<{ id: string; enabled: boolean }> = []
  for (const item of input) {
    if (!isToolGrantRecord(item)) continue
    const id = normalizeNonEmptyString(item.id)
    if (!id || typeof item.enabled !== 'boolean') continue
    overrides.push({ id, enabled: item.enabled })
  }
  return overrides
}

function assertSkillPolicyCompatible(
  baseSkills: CatalogRegistry['skills'],
  nextSkills: CatalogRegistry['skills'],
  changedSkillIds: string[],
): void {
  const changed = new Set(changedSkillIds)
  for (const id of changed) {
    const nextSkill = nextSkills.get(id)
    if (!nextSkill) continue
    if (!nextSkill.enabled) {
      for (const skill of nextSkills.values()) {
        if (!skill.enabled || !(skill.dependencies ?? []).includes(id)) continue
        throw new Error(`skill ${skill.id} requires enabled dependency ${id}`)
      }
      continue
    }
    for (const dependencyId of nextSkill.dependencies ?? []) {
      const dependency = nextSkills.get(dependencyId)
      if (!dependency || !dependency.enabled) throw new Error(`skill ${nextSkill.id} requires enabled dependency ${dependencyId}`)
    }
    for (const conflictId of nextSkill.conflicts ?? []) {
      const conflict = nextSkills.get(conflictId)
      if (conflict?.enabled) throw new Error(`skill ${nextSkill.id} conflicts with enabled skill ${conflictId}`)
    }
    for (const skill of nextSkills.values()) {
      if (!skill.enabled || !(skill.conflicts ?? []).includes(id)) continue
      if (!baseSkills.get(id)?.enabled || changed.has(skill.id)) {
        throw new Error(`skill ${nextSkill.id} conflicts with enabled skill ${skill.id}`)
      }
    }
  }
}

function normalizeToolPolicyOverrides(input: unknown, baseGrants: ToolGrant[]): AgentToolGrant[] {
  if (!Array.isArray(input)) throw new Error('toolGrants must be an array')
  const baseByName = new Map(baseGrants.map((grant) => [grant.name, grant]))
  const normalized = new Map<string, AgentToolGrant>()
  for (const item of input) {
    if (!isToolGrantRecord(item)) throw new Error('toolGrants entries must be objects')
    const name = normalizeNonEmptyString(item.name)
    if (!name) throw new Error('tool grant name is required')
    const base = baseByName.get(name)
    if (!base) throw new Error(`tool ${name} is not granted by current default profile`)
    const mode = item.mode === 'deny' ? 'deny' : item.mode === 'allow' ? 'allow' : undefined
    if (!mode) throw new Error(`tool ${name} mode must be allow or deny`)
    const approval = normalizeApprovalMode(item.approval)
    if (item.approval !== undefined && !approval) throw new Error(`tool ${name} approval is invalid`)
    const effectiveApproval = approval ?? base.approval
    if (mode === 'allow' && approvalRank(effectiveApproval) < approvalRank(base.approval)) {
      throw new Error(`tool ${name} approval cannot be weaker than current default profile`)
    }
    if (mode === base.mode && normalizeApprovalMode(effectiveApproval) === normalizeApprovalMode(base.approval)) continue
    normalized.set(name, {
      name,
      mode,
      ...(effectiveApproval ? { approval: effectiveApproval } : {}),
    })
  }
  return Array.from(normalized.values())
}

function normalizeStoredToolGrants(input: unknown): AgentToolGrant[] {
  if (!Array.isArray(input)) return []
  const grants: AgentToolGrant[] = []
  for (const item of input) {
    if (!isToolGrantRecord(item)) continue
    const name = normalizeNonEmptyString(item.name)
    const mode = item.mode === 'deny' ? 'deny' : item.mode === 'allow' ? 'allow' : undefined
    if (!name || !mode) continue
    const approval = normalizeApprovalMode(item.approval)
    grants.push({ name, mode, ...(approval ? { approval } : {}) })
  }
  return grants
}

function normalizeApprovalMode(value: unknown): AgentToolApprovalMode | undefined {
  return value === 'always' || value === 'on_write' || value === 'never' ? value : undefined
}

function approvalRank(value: unknown): number {
  if (value === 'always') return 2
  if (value === 'on_write') return 1
  return 0
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isToolGrantRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

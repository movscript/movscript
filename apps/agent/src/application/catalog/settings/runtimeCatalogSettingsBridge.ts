import type { AgentManifest, AgentToolApprovalMode, AgentToolGrant } from '../../../catalog/manifest/agentManifest.js'
import type { AgentPluginCatalog } from '../../../catalog/loading/core/loader.js'
import type { AgentConfigFile, CatalogRegistry, SkillDefinition, ToolGrant } from '../../../catalog/registry/shared/types.js'
import type { AgentCatalogStateStore } from '../../../catalog/registry/state/catalogState.js'
import type { JSONValue } from '../../../shared/protocol/types.js'
import type { RuntimeCatalogSnapshotRegistry } from '../snapshot/core/runtimeCatalogSnapshot.js'
import type { RuntimeCatalogSnapshotBridge } from '../snapshot/bridge/runtimeCatalogSnapshotBridge.js'
import { stricterApproval } from '../../../configFiles/merge/configFileMerge.js'

interface RuntimeCatalogSettingsState {
  activeAgentManifest: AgentManifest
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
}

export interface RuntimeCatalogSettingsBridge {
  setActiveAgentConfigFile: (input?: { configFileId?: unknown }) => AgentManifest
  saveAgentConfigFile: (input?: { configFile?: unknown; activate?: unknown }) => { configFile: AgentConfigFile; configFiles: AgentConfigFile[]; activeAgentManifest: AgentManifest }
  deleteAgentConfigFile: (input?: { configFileId?: unknown }) => { configFiles: AgentConfigFile[]; activeAgentManifest: AgentManifest }
  saveConfigFileToolPermissions: (input?: { configFileId?: unknown; toolGrants?: unknown }) => AgentManifest
  saveSkillInstructions: (input?: { skills?: unknown }) => CatalogRegistry
}

type SkillInstructionOverride = {
  id: string
  instructionTemplate?: string
}

export function createRuntimeCatalogSettingsBridge(input: {
  getState: () => RuntimeCatalogSettingsState
  setActiveAgentManifest: (manifest: AgentManifest) => void
  setLayeredRegistry: (registry: CatalogRegistry) => void
  catalogStateStore: AgentCatalogStateStore
  catalogSnapshots: RuntimeCatalogSnapshotRegistry
  catalogSnapshotBridge: RuntimeCatalogSnapshotBridge
  now: () => string
}): RuntimeCatalogSettingsBridge {
  return {
    setActiveAgentConfigFile: (request = {}) => {
      const configFileId = typeof request.configFileId === 'string' ? request.configFileId.trim() : ''
      if (!configFileId) throw new Error('configFileId is required')
      const state = input.getState()
      const configFile = state.layeredRegistry.configFiles.get(configFileId)
      if (!configFile) throw new Error(`config file ${configFileId} not found`)
      const existing = input.catalogStateStore.load()
      const nextManifest = manifestWithActiveConfigFile(state.activeAgentManifest, configFile, state.layeredRegistry)
      input.setActiveAgentManifest(nextManifest)
      input.catalogStateStore.save({
        version: 1,
        updatedAt: input.now(),
        metadata: omitLegacyToolPermissionOverrides({
          ...(existing.metadata ?? {}),
          activeConfigFileId: configFile.id,
        }),
      })
      input.catalogSnapshots.replaceCurrent(input.catalogSnapshotBridge.createSnapshot())
      return nextManifest
    },
    saveAgentConfigFile: (request = {}) => {
      const state = input.getState()
      const existing = input.catalogStateStore.load()
      const configFile = normalizeManagedConfigFile(request.configFile)
      assertConfigFileReferences(configFile, state.layeredRegistry)
      assertConfigFileSkillSelectionCompatible(configFile, state.layeredRegistry.skills)
      const managedConfigFiles = upsertManagedConfigFile(catalogStateManagedConfigFiles(existing), configFile)
      const nextRegistry = applyManagedConfigFiles(state.layeredRegistry, managedConfigFiles)
      const shouldActivate = request.activate === true
      const currentConfigFile = activeManifestConfigFile(state.activeAgentManifest, nextRegistry)
      const nextBaseConfigFile = shouldActivate ? configFile : currentConfigFile
      const nextManifest = nextBaseConfigFile
        ? manifestWithActiveConfigFile(state.activeAgentManifest, nextBaseConfigFile, nextRegistry)
        : state.activeAgentManifest
      input.catalogStateStore.save({
        version: 1,
        updatedAt: input.now(),
        metadata: omitLegacyToolPermissionOverrides({
          ...(existing.metadata ?? {}),
          managedConfigFiles: managedConfigFiles as unknown as JSONValue,
          ...(shouldActivate ? { activeConfigFileId: configFile.id } : {}),
        }),
      })
      input.setLayeredRegistry(nextRegistry)
      input.setActiveAgentManifest(nextManifest)
      input.catalogSnapshots.replaceCurrent(input.catalogSnapshotBridge.createSnapshot())
      return { configFile, configFiles: Array.from(nextRegistry.configFiles.values()), activeAgentManifest: nextManifest }
    },
    deleteAgentConfigFile: (request = {}) => {
      const configFileId = typeof request.configFileId === 'string' ? request.configFileId.trim() : ''
      if (!configFileId) throw new Error('configFileId is required')
      const state = input.getState()
      const existing = input.catalogStateStore.load()
      const managedConfigFiles = catalogStateManagedConfigFiles(existing)
      if (!managedConfigFiles.some((configFile) => configFile.id === configFileId)) {
        throw new Error(`managed config file ${configFileId} not found`)
      }
      const currentConfigFile = activeManifestConfigFile(state.activeAgentManifest, state.layeredRegistry)
      if (currentConfigFile?.id === configFileId) throw new Error(`cannot delete active config file ${configFileId}`)
      const nextManagedConfigFiles = managedConfigFiles.filter((configFile) => configFile.id !== configFileId)
      const nextRegistry = applyManagedConfigFiles(removeConfigFile(state.layeredRegistry, configFileId), nextManagedConfigFiles)
      input.catalogStateStore.save({
        version: 1,
        updatedAt: input.now(),
        metadata: omitLegacyToolPermissionOverrides({
          ...(existing.metadata ?? {}),
          managedConfigFiles: nextManagedConfigFiles as unknown as JSONValue,
        }),
      })
      input.setLayeredRegistry(nextRegistry)
      input.catalogSnapshots.replaceCurrent(input.catalogSnapshotBridge.createSnapshot())
      return { configFiles: Array.from(nextRegistry.configFiles.values()), activeAgentManifest: state.activeAgentManifest }
    },
    saveConfigFileToolPermissions: (request = {}) => {
      const state = input.getState()
      const existing = input.catalogStateStore.load()
      const managedConfigFiles = catalogStateManagedConfigFiles(existing)
      const configFileId = typeof request.configFileId === 'string' ? request.configFileId.trim() : ''
      if (!configFileId) throw new Error('configFileId is required')
      const configFile = managedConfigFiles.find((item) => item.id === configFileId)
      if (!configFile) throw new Error(`config file ${configFileId} not found`)
      const nextConfigFile = configFileWithToolPermissionUpdates(configFile, request.toolGrants, state.layeredRegistry)
      const nextManagedConfigFiles = upsertManagedConfigFile(managedConfigFiles, nextConfigFile)
      const nextRegistry = applyManagedConfigFiles(state.layeredRegistry, nextManagedConfigFiles)
      const currentConfigFile = activeManifestConfigFile(state.activeAgentManifest, nextRegistry)
      const nextManifest = currentConfigFile
        ? manifestWithActiveConfigFile(state.activeAgentManifest, currentConfigFile, nextRegistry)
        : state.activeAgentManifest
      input.catalogStateStore.save({
        version: 1,
        updatedAt: input.now(),
        metadata: omitLegacyToolPermissionOverrides({
          ...(existing.metadata ?? {}),
          managedConfigFiles: nextManagedConfigFiles as unknown as JSONValue,
        }),
      })
      input.setLayeredRegistry(nextRegistry)
      input.setActiveAgentManifest(nextManifest)
      input.catalogSnapshots.replaceCurrent(input.catalogSnapshotBridge.createSnapshot())
      return nextManifest
    },
    saveSkillInstructions: (request = {}) => {
      const state = input.getState()
      const overrides = normalizeSkillInstructionOverrides(request.skills, state.layeredRegistry.skills)
      const nextRegistry = applySkillInstructionOverrides(state.layeredRegistry, overrides)
      const existing = input.catalogStateStore.load()
      input.catalogStateStore.save({
        version: 1,
        updatedAt: input.now(),
        metadata: {
          ...(existing.metadata ?? {}),
          skillInstructionOverrides: overrides as unknown as JSONValue,
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
  return applySkillInstructionOverrides(
    applyManagedConfigFiles(registry, catalogStateManagedConfigFiles(state)),
    catalogStateSkillInstructionOverrides(state),
  )
}

export function applyCatalogStateToActiveManifest(
  manifest: AgentManifest,
  state: ReturnType<AgentCatalogStateStore['load']>,
  registry: AgentPluginCatalog['layeredRegistry'],
): AgentManifest {
  const configFileId = typeof state.metadata?.activeConfigFileId === 'string' ? state.metadata.activeConfigFileId.trim() : ''
  const configFile = configFileId ? registry.configFiles.get(configFileId) : activeManifestConfigFile(manifest, registry)
  return configFile ? manifestWithActiveConfigFile(manifest, configFile, registry) : manifest
}

function manifestWithActiveConfigFile(manifest: AgentManifest, configFile: AgentConfigFile, registry: CatalogRegistry): AgentManifest {
  return {
    ...manifest,
    id: configFile.id,
    version: configFile.version,
    name: configFile.name,
    ...(configFile.description ? { description: configFile.description } : {}),
    tools: configFile.toolGrants.map((grant) => manifestToolGrantWithApprovalDefaults(grant, configFile, registry)),
    ...(configFile.model?.provider && configFile.model.modelId
      ? {
        model: {
          provider: configFile.model.provider,
          modelId: configFile.model.modelId,
          ...(configFile.model.platformModelId !== undefined ? { platformModelId: Number(configFile.model.platformModelId) } : {}),
        },
      }
      : {}),
    metadata: {
      ...(manifest.metadata ?? {}),
      configFileId: configFile.id,
      configFileVersion: configFile.version,
    },
  }
}

function manifestToolGrantWithApprovalDefaults(grant: ToolGrant, configFile: AgentConfigFile, registry: CatalogRegistry): AgentToolGrant {
  const tool = registry.tools.get(grant.name)
  const defaultApproval = (tool ? configFile.approvalDefaults?.[tool.risk] : undefined) ?? configFile.approvalDefaults?.default
  const approval = stricterApproval(grant.approval, defaultApproval)
  return {
    name: grant.name,
    mode: grant.mode,
    ...(approval ? { approval } : {}),
  }
}

function activeManifestConfigFile(manifest: AgentManifest, registry: AgentPluginCatalog['layeredRegistry']): AgentConfigFile | undefined {
  const configFileId = typeof manifest.metadata?.configFileId === 'string' ? manifest.metadata.configFileId.trim() : ''
  return (configFileId ? registry.configFiles.get(configFileId) : undefined)
    ?? registry.configFiles.get('movscript.config_file.base')
    ?? (registry.configFiles.values().next().value as AgentConfigFile | undefined)
}

function applyManagedConfigFiles(registry: CatalogRegistry, managedConfigFiles: AgentConfigFile[]): CatalogRegistry {
  if (managedConfigFiles.length === 0) return registry
  const configFiles = new Map(registry.configFiles)
  for (const configFile of managedConfigFiles) configFiles.set(configFile.id, configFile)
  return { ...registry, configFiles }
}

function removeConfigFile(registry: CatalogRegistry, configFileId: string): CatalogRegistry {
  const configFiles = new Map(registry.configFiles)
  configFiles.delete(configFileId)
  return { ...registry, configFiles }
}

function catalogStateSkillInstructionOverrides(state: ReturnType<AgentCatalogStateStore['load']>): SkillInstructionOverride[] {
  return normalizeStoredSkillInstructionOverrides(state.metadata?.skillInstructionOverrides)
}

function catalogStateManagedConfigFiles(state: ReturnType<AgentCatalogStateStore['load']>): AgentConfigFile[] {
  return normalizeStoredManagedConfigFiles(state.metadata?.managedConfigFiles)
}

function applySkillInstructionOverrides(registry: CatalogRegistry, overrides: SkillInstructionOverride[]): CatalogRegistry {
  if (overrides.length === 0) return registry
  const skills = new Map(registry.skills)
  for (const override of overrides) {
    const skill = skills.get(override.id)
    if (!skill) continue
    skills.set(override.id, {
      ...skill,
      ...(typeof override.instructionTemplate === 'string' ? { instructionTemplate: override.instructionTemplate } : {}),
    } as SkillDefinition)
  }
  return {
    ...registry,
    skills,
  }
}

function normalizeManagedConfigFile(input: unknown): AgentConfigFile {
  if (!isToolGrantRecord(input)) throw new Error('configFile must be an object')
  if (input.schema !== 'movscript.agent.config_file.v1') throw new Error('configFile schema must be movscript.agent.config_file.v1')
  const id = normalizeNonEmptyString(input.id)
  if (!id) throw new Error('configFile id is required')
  const name = normalizeNonEmptyString(input.name)
  if (!name) throw new Error('configFile name is required')
  const version = normalizeNonEmptyString(input.version) ?? '1.0.0'
  return {
    schema: 'movscript.agent.config_file.v1',
    id,
    version,
    name,
    ...(normalizeNonEmptyString(input.description) ? { description: normalizeNonEmptyString(input.description) } : {}),
    enabledPackIds: normalizeStringArray(input.enabledPackIds),
    skillIds: normalizeStringArray(input.skillIds),
    ...(isToolGrantRecord(input.approvalDefaults) ? { approvalDefaults: normalizeConfigFileApprovalDefaults(input.approvalDefaults) } : {}),
    toolGrants: normalizeConfigFileToolGrants(input.toolGrants),
    ...(isToolGrantRecord(input.model) ? { model: normalizeConfigFileModel(input.model) } : {}),
    ...(isToolGrantRecord(input.limits) ? { limits: normalizeConfigFileLimits(input.limits) } : {}),
    ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
  }
}

function normalizeStoredManagedConfigFiles(input: unknown): AgentConfigFile[] {
  if (!Array.isArray(input)) return []
  const configFiles = new Map<string, AgentConfigFile>()
  for (const item of input) {
    try {
      const configFile = normalizeManagedConfigFile(item)
      configFiles.set(configFile.id, configFile)
    } catch {
      continue
    }
  }
  return Array.from(configFiles.values())
}

function upsertManagedConfigFile(configFiles: AgentConfigFile[], next: AgentConfigFile): AgentConfigFile[] {
  const byId = new Map(configFiles.map((configFile) => [configFile.id, configFile]))
  byId.set(next.id, next)
  return Array.from(byId.values())
}

function normalizeConfigFileToolGrants(input: unknown): ToolGrant[] {
  if (!Array.isArray(input)) return []
  const grants = new Map<string, ToolGrant>()
  for (const item of input) {
    if (!isToolGrantRecord(item)) continue
    const name = normalizeNonEmptyString(item.name)
    const mode = item.mode === 'deny' ? 'deny' : item.mode === 'allow' ? 'allow' : undefined
    if (!name || !mode) continue
    const approval = normalizeApprovalMode(item.approval)
    grants.set(name, { name, mode, ...(approval ? { approval } : {}) })
  }
  return Array.from(grants.values())
}

function configFileWithToolPermissionUpdates(configFile: AgentConfigFile, input: unknown, registry: CatalogRegistry): AgentConfigFile {
  const updates = normalizeToolPermissionUpdates(input, configFile, registry)
  if (updates.length === 0) return configFile
  const byName = new Map(configFile.toolGrants.map((grant) => [grant.name, grant]))
  for (const update of updates) {
    byName.set(update.name, {
      name: update.name,
      mode: update.mode,
      ...(update.approval ? { approval: update.approval } : {}),
    })
  }
  return {
    ...configFile,
    toolGrants: configFile.toolGrants.map((grant) => byName.get(grant.name) ?? grant),
  }
}

function normalizeConfigFileApprovalDefaults(input: Record<string, unknown>): AgentConfigFile['approvalDefaults'] {
  const defaults: NonNullable<AgentConfigFile['approvalDefaults']> = {}
  for (const key of ['default', 'read', 'workspace', 'write', 'generate', 'destructive', 'ui'] as const) {
    const approval = normalizeApprovalMode(input[key])
    if (approval) defaults[key] = approval
  }
  return Object.keys(defaults).length > 0 ? defaults : undefined
}

function normalizeConfigFileModel(input: Record<string, unknown>): AgentConfigFile['model'] {
  const provider = input.provider === 'anthropic' || input.provider === 'openai' || input.provider === 'azure' || input.provider === 'custom'
    ? input.provider
    : undefined
  const modelId = normalizeNonEmptyString(input.modelId)
  if (!provider || !modelId) return undefined
  return {
    provider,
    modelId,
    ...(normalizeNonEmptyString(input.platformModelId) ? { platformModelId: normalizeNonEmptyString(input.platformModelId) } : {}),
    ...(Array.isArray(input.routes) ? { routes: input.routes } : {}),
  }
}

function normalizeConfigFileLimits(input: Record<string, unknown>): AgentConfigFile['limits'] {
  const limits: NonNullable<AgentConfigFile['limits']> = {}
  for (const key of [
    'maxToolCalls',
    'maxIterations',
    'maxActiveTriggeredSkills',
    'systemPromptCharLimit',
    'contextWindowCharLimit',
    'maxRetrievedContextChars',
    'maxReferenceCharsPerRun',
    'maxReferenceChunksPerRun',
    'maxHistoryMessages',
    'maxThreadSummaryChars',
  ] as const) {
    const value = input[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) limits[key] = Math.floor(value)
  }
  if (input.executionMode === 'compact' || input.executionMode === 'standard' || input.executionMode === 'deep') limits.executionMode = input.executionMode
  if (typeof input.allowForcedToolCalls === 'boolean') limits.allowForcedToolCalls = input.allowForcedToolCalls
  return Object.keys(limits).length > 0 ? limits : undefined
}

function assertConfigFileReferences(configFile: AgentConfigFile, registry: CatalogRegistry): void {
  for (const packId of configFile.enabledPackIds) {
    if (!registry.packs.has(packId)) throw new Error(`config file ${configFile.id} references missing pack ${packId}`)
  }
  for (const skillId of configFile.skillIds) {
    if (!registry.skills.has(skillId)) throw new Error(`config file ${configFile.id} references missing skill ${skillId}`)
  }
  for (const grant of configFile.toolGrants) {
    if (!registry.tools.has(grant.name)) throw new Error(`config file ${configFile.id} references missing tool ${grant.name}`)
  }
}

function assertConfigFileSkillSelectionCompatible(configFile: AgentConfigFile, skills: CatalogRegistry['skills']): void {
  const skillIds = new Set(configFile.skillIds)
  for (const skillId of configFile.skillIds) {
    const skill = skills.get(skillId)
    if (!skill) continue
    for (const dependencyId of skill.dependencies ?? []) {
      if (!skillIds.has(dependencyId)) throw new Error(`config file ${configFile.id} config file skill ${skillId} requires config file skill ${dependencyId}`)
    }
    for (const conflictId of skill.conflicts ?? []) {
      if (skillIds.has(conflictId)) throw new Error(`config file ${configFile.id} config file skill ${skillId} conflicts with config file skill ${conflictId}`)
    }
  }
}

function normalizeSkillInstructionOverrides(input: unknown, baseSkills: CatalogRegistry['skills']): SkillInstructionOverride[] {
  if (!Array.isArray(input)) throw new Error('skills must be an array')
  const normalized = new Map<string, SkillInstructionOverride>()
  for (const item of input) {
    if (!isToolGrantRecord(item)) throw new Error('skill entries must be objects')
    const id = normalizeNonEmptyString(item.id)
    if (!id) throw new Error('skill id is required')
    const skill = baseSkills.get(id)
    if (!skill) throw new Error(`skill ${id} not found`)
    if (item.enabled !== undefined) throw new Error(`skill ${id} enabled belongs to config file skillIds`)
    if (item.instructionTemplate !== undefined && typeof item.instructionTemplate !== 'string') throw new Error(`skill ${id} instructionTemplate must be string`)
    const instructionTemplate = typeof item.instructionTemplate === 'string' ? item.instructionTemplate.trim() : undefined
    if (item.instructionTemplate !== undefined && !instructionTemplate) throw new Error(`skill ${id} instructionTemplate is required`)
    const override: SkillInstructionOverride = { id }
    if (instructionTemplate !== undefined) override.instructionTemplate = instructionTemplate
    if (override.instructionTemplate === undefined) continue
    normalized.set(id, override)
  }
  return Array.from(normalized.values())
}

function normalizeStoredSkillInstructionOverrides(input: unknown): SkillInstructionOverride[] {
  if (!Array.isArray(input)) return []
  const overrides: SkillInstructionOverride[] = []
  for (const item of input) {
    if (!isToolGrantRecord(item)) continue
    const id = normalizeNonEmptyString(item.id)
    if (!id) continue
    const override: SkillInstructionOverride = { id }
    const instructionTemplate = normalizeNonEmptyString(item.instructionTemplate)
    if (instructionTemplate) override.instructionTemplate = instructionTemplate
    if (override.instructionTemplate !== undefined) overrides.push(override)
  }
  return overrides
}

function normalizeToolPermissionUpdates(input: unknown, configFile: AgentConfigFile, registry: CatalogRegistry): AgentToolGrant[] {
  if (!Array.isArray(input)) throw new Error('toolGrants must be an array')
  const baseGrants = configFile.toolGrants.map((grant) => manifestToolGrantWithApprovalDefaults(grant, configFile, registry))
  const baseByName = new Map(baseGrants.map((grant) => [grant.name, grant]))
  const normalized = new Map<string, AgentToolGrant>()
  for (const item of input) {
    if (!isToolGrantRecord(item)) throw new Error('toolGrants entries must be objects')
    const name = normalizeNonEmptyString(item.name)
    if (!name) throw new Error('tool grant name is required')
    const base = baseByName.get(name)
    if (!base) throw new Error(`tool ${name} is not granted by config file ${configFile.id}`)
    const mode = item.mode === 'deny' ? 'deny' : item.mode === 'allow' ? 'allow' : undefined
    if (!mode) throw new Error(`tool ${name} mode must be allow or deny`)
    const approval = normalizeApprovalMode(item.approval)
    if (item.approval !== undefined && !approval) throw new Error(`tool ${name} approval is invalid`)
    const effectiveApproval = approval ?? base.approval
    if (mode === 'allow' && approvalRank(effectiveApproval) < approvalRank(base.approval)) {
      throw new Error(`tool ${name} approval cannot be weaker than config file ${configFile.id}`)
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

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))]
    : []
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isToolGrantRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  if (!isToolGrantRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function omitLegacyToolPermissionOverrides(metadata: Record<string, JSONValue>): Record<string, JSONValue> {
  const { toolPermissionOverridesByConfigFile: _legacy, ...rest } = metadata
  return rest
}

function isToolGrantRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import {
  publicAgentBackendModelId,
  type AgentBackendPublicModel,
} from './modelCatalog.js'
import {
  hasSensitiveTextSecret,
  hasSensitiveURLSecret,
  stripSensitiveURLSecrets,
} from './sensitiveData.js'

export type AgentSettingsSnapshotJSONValue =
  | null
  | string
  | number
  | boolean
  | AgentSettingsSnapshotJSONValue[]
  | { [key: string]: AgentSettingsSnapshotJSONValue }

export type ProviderModelAPIKind = 'openai_responses' | 'openai_chat_completions' | 'anthropic_messages'
export type ProviderToolGrantMode = 'allow' | 'deny'
export type ProviderToolApprovalMode = 'never' | 'always' | 'on_write'
export type AgentRunExecutionMode = 'standard' | 'compact' | 'deep'
export type ProviderModelRouteSource =
  | 'configured'
  | 'chat-config-fallback'
  | 'planner-config'
  | 'disabled'
  | 'unconfigured'
export type ProviderModelConfigSource = 'file' | 'none'
export type ProviderModelCapability = 'reasoning' | 'text' | 'planning' | 'multimodal'

export interface ProviderToolApprovalDefaults {
  default?: ProviderToolApprovalMode
  read?: ProviderToolApprovalMode
  workspace?: ProviderToolApprovalMode
  write?: ProviderToolApprovalMode
  generate?: ProviderToolApprovalMode
  destructive?: ProviderToolApprovalMode
  ui?: ProviderToolApprovalMode
}

export interface ProviderConfigFileLimits {
  maxToolCalls?: number
  maxIterations?: number
  executionMode?: AgentRunExecutionMode
  allowForcedToolCalls?: boolean
  maxActiveTriggeredSkills?: number
  systemPromptCharLimit?: number
  contextWindowCharLimit?: number
  maxRetrievedContextChars?: number
  maxReferenceCharsPerRun?: number
  maxReferenceChunksPerRun?: number
  maxHistoryMessages?: number
  maxThreadSummaryChars?: number
}

export interface ProviderManifest {
  schema: 'movscript.agent.current'
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  tools: Array<{
    name: string
    mode: ProviderToolGrantMode
    approval?: ProviderToolApprovalMode
  }>
  skills?: Array<{
    id: string
    enabled?: boolean
  }>
  model?: {
    provider?: string
    modelId?: string
    platformModelId?: number
  }
  metadata?: Record<string, AgentSettingsSnapshotJSONValue>
}

export interface ProviderCatalogSkill {
  id: string
  name: string
  description: string
  version?: string
  enabled: boolean
  priority?: number
  instruction: string
  instructionTemplate?: string
  loadMode?: 'core' | 'on_demand' | 'manual'
  source?: 'builtin' | 'local' | 'plugin' | 'team' | 'mcp'
  activationScope?: 'turn' | 'run' | 'thread'
  tags?: string[]
  aliases?: string[]
  useWhen?: string[]
  triggers?: AgentSettingsSnapshotJSONValue[]
  dependencies?: string[]
  conflicts?: string[]
  toolGrants?: string[]
  schemaRefs?: string[]
  tokenEstimate?: number
  contextBudget?: {
    maxChars?: number
    reserveRatio?: number
    strategy?: 'fixed' | 'proportional' | 'opportunistic'
  }
  outputContract?: string
  toolHints?: string[]
  metadata?: Record<string, AgentSettingsSnapshotJSONValue>
}

export interface ProviderCatalogConfigFile {
  schema: 'movscript.agent.config_file.v1'
  id: string
  version: string
  name: string
  description?: string
  enabledPackIds: string[]
  skillIds: string[]
  approvalDefaults?: ProviderToolApprovalDefaults
  toolGrants: Array<{
    name: string
    mode: ProviderToolGrantMode
    approval?: ProviderToolApprovalMode
  }>
  model?: {
    provider: string
    modelId: string
    platformModelId?: string
    routes?: unknown[]
  }
  limits?: ProviderConfigFileLimits
  metadata?: Record<string, AgentSettingsSnapshotJSONValue>
}

export interface ProviderModelCredentialStatusPublic {
  required: boolean
  configured: boolean
  sourceEnv: string[]
  acceptedEnv: string[]
}

export interface ProviderModelCapabilityRoutePublic {
  capability: ProviderModelCapability
  configured: boolean
  provider?: 'backend-model-config'
  modelConfigId?: number
  model?: string
  source: ProviderModelRouteSource
}

export interface ProviderModelConfigPublic {
  configured: boolean
  provider: 'backend-model-config'
  modelConfigId?: number
  model: string
  apiKind: ProviderModelAPIKind
  baseURL?: string
  apiKeyConfigured: boolean
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: ProviderModelConfigSource
  credentialStatus: ProviderModelCredentialStatusPublic
  capabilities?: ProviderModelCapabilityRoutePublic[]
}

export type AgentSettingsPublicModel = AgentBackendPublicModel

export type ToolGrantWorkspace = ProviderManifest['tools'][number]
export type SkillConfigWorkspace = { id: string; enabled: boolean }
export type ConfigFileToolPermissionOverrides = { configFileId: string; toolGrants: ToolGrantWorkspace[] }
export const AGENT_SETTINGS_SNAPSHOT_SCHEMA = 'movscript.agent.settings.snapshot.v1'
export const AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION = 1
export const AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL = 'https://movscript.dev/schemas/agent-settings-snapshot-v1.schema.json'
export type AgentSettingsSnapshotReferenceIssue = {
  path: string
  message: string
}

export type AgentSettingsSnapshot = {
  schema: typeof AGENT_SETTINGS_SNAPSHOT_SCHEMA
  schemaVersion: typeof AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION
  schemaUrl: typeof AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL
  exportedAt: string
  model?: {
    model: string
    platformModelId?: string
    apiKind?: ProviderModelAPIKind
    baseURL?: string
    useForChat?: boolean
    useForPlanner?: boolean
  }
  activeConfigFileId?: string
  configFiles?: ProviderCatalogConfigFile[]
  providerSessionLimits?: ProviderCatalogConfigFile['limits']
  /** Compatibility input for older exported settings snapshots. New exports use providerSessionLimits. */
  runtimeLimits?: ProviderCatalogConfigFile['limits']
  skillConfig?: SkillConfigWorkspace[]
  toolPermissionOverrides?: ConfigFileToolPermissionOverrides[]
}

export function buildSettingsSnapshot(input: {
  config: ProviderModelConfigPublic | null
  configFileId: string
  configFiles: ProviderCatalogConfigFile[]
  skillConfig: SkillConfigWorkspace[]
  toolPermissionOverrides: ConfigFileToolPermissionOverrides[]
}): AgentSettingsSnapshot {
  const model = buildSnapshotModel(input.config)
  const providerSessionLimits = input.configFiles.find((configFile) => configFile.id === input.configFileId)?.limits
  return {
    schema: AGENT_SETTINGS_SNAPSHOT_SCHEMA,
    schemaVersion: AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
    schemaUrl: AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
    exportedAt: new Date().toISOString(),
    ...(model ? { model } : {}),
    ...(input.configFileId ? { activeConfigFileId: input.configFileId } : {}),
    ...(input.configFiles.length > 0 ? { configFiles: input.configFiles.map(cloneSnapshotConfigFile) } : {}),
    ...(providerSessionLimits ? { providerSessionLimits: { ...providerSessionLimits } } : {}),
    skillConfig: input.skillConfig.map((skill) => ({
      id: skill.id,
      enabled: skill.enabled,
    })),
    ...(input.toolPermissionOverrides.length > 0 ? { toolPermissionOverrides: input.toolPermissionOverrides.map(cloneSnapshotToolPermissionOverrides) } : {}),
  }
}

function buildSnapshotModel(config: ProviderModelConfigPublic | null): AgentSettingsSnapshot['model'] | undefined {
  if (!config?.configured) return undefined
  if (hasSensitiveTextSecret(config.model)) return undefined
  return {
    model: config.model,
    ...(typeof config.modelConfigId === 'number' ? { platformModelId: String(config.modelConfigId) } : {}),
    ...(config.apiKind ? { apiKind: config.apiKind } : {}),
    ...(config.baseURL ? { baseURL: stripSensitiveURLSecrets(config.baseURL) } : {}),
    useForChat: config.useForChat,
    useForPlanner: config.useForPlanner,
  }
}

export function parseSettingsSnapshot(text: string): AgentSettingsSnapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('agent settings snapshot JSON is invalid')
  }
  if (!isRecord(parsed)) throw new Error('agent settings snapshot must be a JSON object')
  if (parsed.schema !== AGENT_SETTINGS_SNAPSHOT_SCHEMA) throw new Error('unsupported agent settings snapshot schema')
  assertAllowedKeys(parsed, 'agent settings snapshot', ['schema', 'schemaVersion', 'schemaUrl', 'exportedAt', 'model', 'activeConfigFileId', 'configFiles', 'providerSessionLimits', 'runtimeLimits', 'skillConfig', 'toolPermissionOverrides'])
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION) throw new Error('unsupported agent settings snapshot schemaVersion')
  if (parsed.schemaUrl !== undefined && parsed.schemaUrl !== AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL) throw new Error('unsupported agent settings snapshot schemaUrl')
  const snapshot: AgentSettingsSnapshot = {
    schema: AGENT_SETTINGS_SNAPSHOT_SCHEMA,
    schemaVersion: AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
    schemaUrl: AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
    exportedAt: parseOptionalDateString(parsed.exportedAt, 'agent settings snapshot exportedAt') ?? new Date().toISOString(),
  }
  if (parsed.model !== undefined) {
    if (!isRecord(parsed.model)) throw new Error('agent settings snapshot model must be an object')
    snapshot.model = parseSnapshotModel(parsed.model)
  }
  const activeConfigFileId = parseOptionalNonEmptyString(parsed.activeConfigFileId, 'agent settings snapshot activeConfigFileId')
  if (activeConfigFileId) snapshot.activeConfigFileId = activeConfigFileId
  if (parsed.configFiles !== undefined) snapshot.configFiles = parseSnapshotConfigFiles(parsed.configFiles)
  if (parsed.providerSessionLimits !== undefined) {
    snapshot.providerSessionLimits = parseSnapshotLimits(parsed.providerSessionLimits, 'agent settings snapshot providerSessionLimits')
  }
  if (parsed.runtimeLimits !== undefined) {
    const runtimeLimits = parseSnapshotLimits(parsed.runtimeLimits, 'agent settings snapshot runtimeLimits')
    snapshot.runtimeLimits = runtimeLimits
    if (!snapshot.providerSessionLimits) snapshot.providerSessionLimits = runtimeLimits
  }
  if (parsed.skillConfig !== undefined) snapshot.skillConfig = parseSnapshotSkillConfig(parsed.skillConfig)
  if (parsed.toolPermissionOverrides !== undefined) snapshot.toolPermissionOverrides = parseSnapshotToolPermissionOverrides(parsed.toolPermissionOverrides)
  return snapshot
}

export function buildConfigFileExportText(configFile: ProviderCatalogConfigFile): string {
  return JSON.stringify(cloneSnapshotConfigFile(configFile), null, 2)
}

export function parseConfigFileExport(text: string): ProviderCatalogConfigFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('agent config file JSON is invalid')
  }
  const [configFile] = parseSnapshotConfigFiles([parsed])
  if (!configFile) throw new Error('agent config file is missing')
  return configFile
}

export function validateSettingsSnapshotReferences(
  snapshot: AgentSettingsSnapshot,
  input: {
    textModels?: AgentSettingsPublicModel[]
    configFiles: ProviderCatalogConfigFile[]
    currentConfigFile: ProviderCatalogConfigFile | null
    skills: ProviderCatalogSkill[]
  },
): AgentSettingsSnapshotReferenceIssue[] {
  const issues: AgentSettingsSnapshotReferenceIssue[] = []
  if (snapshot.model) {
    issues.push(...validateSnapshotModelReference(snapshot.model, input.textModels))
  }

  const importedConfigFiles = snapshot.configFiles ?? []
  const configFileById = new Map([
    ...input.configFiles.map((configFile) => [configFile.id, configFile] as const),
    ...importedConfigFiles.map((configFile) => [configFile.id, configFile] as const),
  ])
  const targetConfigFile = snapshot.activeConfigFileId ? configFileById.get(snapshot.activeConfigFileId) ?? null : input.currentConfigFile
  if (snapshot.activeConfigFileId && !targetConfigFile) {
    issues.push({
      path: 'activeConfigFileId',
      message: `config file ${snapshot.activeConfigFileId} not found`,
    })
  }
  if (importedConfigFiles.length > 0) {
    issues.push(...validateSnapshotConfigFileReferences(importedConfigFiles, input.skills))
  }

  if (snapshot.skillConfig) {
    issues.push(...validateSnapshotSkillConfigReferences(snapshot.skillConfig, input.skills, targetConfigFile))
  }

  if (snapshot.toolPermissionOverrides) {
    for (const [index, overrides] of snapshot.toolPermissionOverrides.entries()) {
      const configFile = configFileById.get(overrides.configFileId) ?? null
      if (!configFile) {
        issues.push({
          path: `toolPermissionOverrides.${index + 1}.configFileId`,
          message: `tool permission overrides reference missing config file ${overrides.configFileId}`,
        })
      } else {
        issues.push(...validateSnapshotToolPermissionReferences(overrides.toolGrants, configFile, `toolPermissionOverrides.${index + 1}.toolGrants`))
      }
    }
  }

  return issues
}

function cloneSnapshotConfigFile(configFile: ProviderCatalogConfigFile): ProviderCatalogConfigFile {
  return {
    schema: 'movscript.agent.config_file.v1',
    id: configFile.id,
    version: configFile.version,
    name: configFile.name,
    ...(configFile.description ? { description: configFile.description } : {}),
    enabledPackIds: [...configFile.enabledPackIds],
    skillIds: [...configFile.skillIds],
    ...(configFile.approvalDefaults ? { approvalDefaults: { ...configFile.approvalDefaults } } : {}),
    toolGrants: configFile.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    ...(configFile.model ? { model: cloneSnapshotConfigFileModel(configFile.model) } : {}),
    ...(configFile.limits ? { limits: { ...configFile.limits } } : {}),
    ...(configFile.metadata ? { metadata: JSON.parse(JSON.stringify(configFile.metadata)) as ProviderCatalogConfigFile['metadata'] } : {}),
  }
}

function cloneSnapshotToolPermissionOverrides(overrides: ConfigFileToolPermissionOverrides): ConfigFileToolPermissionOverrides {
  return {
    configFileId: overrides.configFileId,
    toolGrants: overrides.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
  }
}

function cloneSnapshotConfigFileModel(model: NonNullable<ProviderCatalogConfigFile['model']>): NonNullable<ProviderCatalogConfigFile['model']> {
  return {
    provider: model.provider,
    modelId: model.modelId,
    ...(model.platformModelId ? { platformModelId: model.platformModelId } : {}),
    ...(Array.isArray(model.routes) ? { routes: JSON.parse(JSON.stringify(model.routes)) as unknown[] } : {}),
  }
}

function validateSnapshotModelReference(
  model: NonNullable<AgentSettingsSnapshot['model']>,
  textModels: AgentSettingsPublicModel[] | undefined,
): AgentSettingsSnapshotReferenceIssue[] {
  if (!model.model.startsWith('model_config:') && !model.platformModelId) return []
  if (!textModels) {
    return [{
      path: 'model.model',
      message: 'model catalog is not available',
    }]
  }
  const byPublicId = textModels.some((item) => publicAgentBackendModelId(item) === model.model)
  const platformModelId = model.platformModelId ? Number(model.platformModelId) : NaN
  const byPlatformModelId = Number.isFinite(platformModelId)
    ? textModels.some((item) => item.id === platformModelId)
    : false
  const modelConfigIdMatch = /^model_config:(\d+)$/.exec(model.model)
  const byModelConfigModel = modelConfigIdMatch
    ? textModels.some((item) => item.id === Number(modelConfigIdMatch[1]))
    : false
  if (byPublicId || byPlatformModelId || byModelConfigModel) return []
  return [{
    path: 'model.model',
    message: `model ${model.model} not found`,
  }]
}

function parseSnapshotModel(input: Record<string, unknown>): NonNullable<AgentSettingsSnapshot['model']> {
  assertAllowedKeys(input, 'agent settings snapshot model', ['model', 'platformModelId', 'apiKind', 'baseURL', 'useForChat', 'useForPlanner'])
  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : ''
  if (!model) throw new Error('agent settings snapshot model.model is required')
  const apiKind = parseSnapshotAPIKind(input.apiKind)
  if (hasSensitiveTextSecret(model)) {
    throw new Error('agent settings snapshot model.model must not include API keys, bearer tokens, or secret URL credentials')
  }
  const platformModelId = parseOptionalNonEmptyString(input.platformModelId, 'agent settings snapshot model.platformModelId')
  const baseURL = parseOptionalNonEmptyString(input.baseURL, 'agent settings snapshot model.baseURL')
  if (hasSensitiveURLSecret(baseURL)) {
    throw new Error('agent settings snapshot model.baseURL must not include secret URL credentials')
  }
  if (input.useForChat !== undefined && typeof input.useForChat !== 'boolean') {
    throw new Error('agent settings snapshot model.useForChat must be boolean')
  }
  if (input.useForPlanner !== undefined && typeof input.useForPlanner !== 'boolean') {
    throw new Error('agent settings snapshot model.useForPlanner must be boolean')
  }
  if (input.useForChat === false && input.useForPlanner === false) {
    throw new Error('agent settings snapshot model must enable at least one route')
  }
  return {
    model,
    ...(platformModelId ? { platformModelId } : {}),
    ...(apiKind ? { apiKind } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(typeof input.useForChat === 'boolean' ? { useForChat: input.useForChat } : {}),
    ...(typeof input.useForPlanner === 'boolean' ? { useForPlanner: input.useForPlanner } : {}),
  }
}

function parseSnapshotAPIKind(input: unknown): ProviderModelAPIKind | undefined {
  if (input === undefined) return undefined
  if (input === 'openai_responses' || input === 'openai_chat_completions' || input === 'anthropic_messages') return input
  throw new Error('agent settings snapshot model.apiKind is invalid')
}

function parseSnapshotSkillConfig(input: unknown): SkillConfigWorkspace[] {
  if (!Array.isArray(input)) throw new Error('agent settings snapshot skillConfig must be an array')
  const seenIds = new Set<string>()
  return input.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent settings snapshot skillConfig ${index + 1} must be an object`)
    assertAllowedKeys(item, `agent settings snapshot skillConfig ${index + 1}`, ['id', 'enabled'])
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : ''
    if (!id) throw new Error(`agent settings snapshot skillConfig ${index + 1} id is required`)
    if (seenIds.has(id)) throw new Error(`agent settings snapshot skillConfig ${index + 1} id is duplicated`)
    seenIds.add(id)
    if (typeof item.enabled !== 'boolean') throw new Error(`agent settings snapshot skillConfig ${index + 1} enabled must be boolean`)
    return { id, enabled: item.enabled }
  })
}

function parseSnapshotToolPermissionOverrides(input: unknown): ConfigFileToolPermissionOverrides[] {
  if (!Array.isArray(input)) throw new Error('agent settings snapshot toolPermissionOverrides must be an array')
  const seenConfigFileIds = new Set<string>()
  return input.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent settings snapshot toolPermissionOverrides ${index + 1} must be an object`)
    assertAllowedKeys(item, `agent settings snapshot toolPermissionOverrides ${index + 1}`, ['configFileId', 'toolGrants'])
    const configFileId = parseRequiredNonEmptyString(item.configFileId, `agent settings snapshot toolPermissionOverrides ${index + 1} configFileId`)
    if (seenConfigFileIds.has(configFileId)) throw new Error(`agent settings snapshot toolPermissionOverrides ${index + 1} configFileId is duplicated`)
    seenConfigFileIds.add(configFileId)
    return {
      configFileId,
      toolGrants: parseSnapshotToolPermissionGrants(item.toolGrants, `agent settings snapshot toolPermissionOverrides ${index + 1} toolGrants`),
    }
  })
}

function parseSnapshotToolPermissionGrants(input: unknown, label: string): ToolGrantWorkspace[] {
  if (!Array.isArray(input)) throw new Error(`${label} must be an array`)
  const seenNames = new Set<string>()
  return input.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${label} ${index + 1} must be an object`)
    assertAllowedKeys(item, `${label} ${index + 1}`, ['name', 'mode', 'approval'])
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : ''
    if (!name) throw new Error(`${label} ${index + 1} name is required`)
    if (seenNames.has(name)) throw new Error(`${label} ${index + 1} name is duplicated`)
    seenNames.add(name)
    if (item.mode !== 'allow' && item.mode !== 'deny') throw new Error(`${label} ${index + 1} mode is invalid`)
    if (item.approval !== undefined && item.approval !== 'never' && item.approval !== 'always' && item.approval !== 'on_write') {
      throw new Error(`${label} ${index + 1} approval is invalid`)
    }
    return {
      name,
      mode: item.mode,
      ...(item.approval ? { approval: item.approval } : {}),
    }
  })
}

function parseSnapshotConfigFiles(input: unknown): ProviderCatalogConfigFile[] {
  if (!Array.isArray(input)) throw new Error('agent settings snapshot configFiles must be an array')
  const seenIds = new Set<string>()
  return input.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent settings snapshot configFiles ${index + 1} must be an object`)
    assertAllowedKeys(item, `agent settings snapshot configFiles ${index + 1}`, ['schema', 'id', 'version', 'name', 'description', 'enabledPackIds', 'skillIds', 'approvalDefaults', 'toolGrants', 'model', 'limits', 'metadata'])
    if (item.schema !== 'movscript.agent.config_file.v1') throw new Error(`agent settings snapshot configFiles ${index + 1} schema is invalid`)
    const id = parseRequiredNonEmptyString(item.id, `agent settings snapshot configFiles ${index + 1} id`)
    if (seenIds.has(id)) throw new Error(`agent settings snapshot configFiles ${index + 1} id is duplicated`)
    seenIds.add(id)
    return {
      schema: 'movscript.agent.config_file.v1',
      id,
      version: parseRequiredNonEmptyString(item.version, `agent settings snapshot configFiles ${index + 1} version`),
      name: parseRequiredNonEmptyString(item.name, `agent settings snapshot configFiles ${index + 1} name`),
      ...(item.description !== undefined ? { description: parseOptionalString(item.description, `agent settings snapshot configFiles ${index + 1} description`) } : {}),
      enabledPackIds: parseSnapshotStringList(item.enabledPackIds, `agent settings snapshot configFiles ${index + 1} enabledPackIds`),
      skillIds: parseSnapshotStringList(item.skillIds, `agent settings snapshot configFiles ${index + 1} skillIds`),
      ...(item.approvalDefaults !== undefined ? { approvalDefaults: parseSnapshotApprovalDefaults(item.approvalDefaults, `agent settings snapshot configFiles ${index + 1} approvalDefaults`) } : {}),
      toolGrants: parseSnapshotConfigFileToolGrants(item.toolGrants, index + 1),
      ...(item.model !== undefined ? { model: parseSnapshotConfigFileModel(item.model, index + 1) } : {}),
      ...(item.limits !== undefined ? { limits: parseSnapshotConfigFileLimits(item.limits, index + 1) } : {}),
      ...(item.metadata !== undefined ? { metadata: parseSnapshotConfigFileMetadata(item.metadata, index + 1) } : {}),
    }
  })
}

function parseSnapshotConfigFileToolGrants(input: unknown, configFileIndex: number): ProviderCatalogConfigFile['toolGrants'] {
  if (!Array.isArray(input)) throw new Error(`agent settings snapshot configFiles ${configFileIndex} toolGrants must be an array`)
  const seenNames = new Set<string>()
  return input.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent settings snapshot configFiles ${configFileIndex} toolGrants ${index + 1} must be an object`)
    assertAllowedKeys(item, `agent settings snapshot configFiles ${configFileIndex} toolGrants ${index + 1}`, ['name', 'mode', 'approval'])
    const name = parseRequiredNonEmptyString(item.name, `agent settings snapshot configFiles ${configFileIndex} toolGrants ${index + 1} name`)
    if (seenNames.has(name)) throw new Error(`agent settings snapshot configFiles ${configFileIndex} toolGrants ${index + 1} name is duplicated`)
    seenNames.add(name)
    if (item.mode !== 'allow' && item.mode !== 'deny') throw new Error(`agent settings snapshot configFiles ${configFileIndex} toolGrants ${index + 1} mode is invalid`)
    if (item.approval !== undefined && item.approval !== 'never' && item.approval !== 'always' && item.approval !== 'on_write') {
      throw new Error(`agent settings snapshot configFiles ${configFileIndex} toolGrants ${index + 1} approval is invalid`)
    }
    return {
      name,
      mode: item.mode,
      ...(item.approval ? { approval: item.approval } : {}),
    }
  })
}

function parseSnapshotApprovalDefaults(input: unknown, label: string): NonNullable<ProviderCatalogConfigFile['approvalDefaults']> {
  if (!isRecord(input)) throw new Error(`${label} must be an object`)
  assertAllowedKeys(input, label, ['default', 'read', 'workspace', 'write', 'generate', 'destructive', 'ui'])
  const defaults: NonNullable<ProviderCatalogConfigFile['approvalDefaults']> = {}
  for (const key of ['default', 'read', 'workspace', 'write', 'generate', 'destructive', 'ui'] as const) {
    const value = input[key]
    if (value === undefined) continue
    if (value !== 'never' && value !== 'always' && value !== 'on_write') throw new Error(`${label}.${key} is invalid`)
    defaults[key] = value
  }
  return defaults
}

function parseSnapshotConfigFileModel(input: unknown, configFileIndex: number): NonNullable<ProviderCatalogConfigFile['model']> {
  if (!isRecord(input)) throw new Error(`agent settings snapshot configFiles ${configFileIndex} model must be an object`)
  assertAllowedKeys(input, `agent settings snapshot configFiles ${configFileIndex} model`, ['provider', 'modelId', 'platformModelId', 'routes'])
  return {
    provider: parseRequiredNonEmptyString(input.provider, `agent settings snapshot configFiles ${configFileIndex} model.provider`),
    modelId: parseRequiredNonEmptyString(input.modelId, `agent settings snapshot configFiles ${configFileIndex} model.modelId`),
    ...(input.platformModelId !== undefined ? { platformModelId: parseRequiredNonEmptyString(input.platformModelId, `agent settings snapshot configFiles ${configFileIndex} model.platformModelId`) } : {}),
    ...(input.routes !== undefined ? { routes: parseSnapshotJSONArray(input.routes, `agent settings snapshot configFiles ${configFileIndex} model.routes`) } : {}),
  }
}

function parseSnapshotConfigFileLimits(input: unknown, configFileIndex: number): NonNullable<ProviderCatalogConfigFile['limits']> {
  return parseSnapshotLimits(input, `agent settings snapshot configFiles ${configFileIndex} limits`)
}

function parseSnapshotLimits(input: unknown, label: string): NonNullable<ProviderCatalogConfigFile['limits']> {
  if (!isRecord(input)) throw new Error(`${label} must be an object`)
  const limits: NonNullable<ProviderCatalogConfigFile['limits']> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!key.trim()) throw new Error(`${label} keys must be non-empty`)
    if (key === 'executionMode') {
      if (value !== 'compact' && value !== 'standard' && value !== 'deep') throw new Error(`${label}.${key} is invalid`)
      limits.executionMode = value
      continue
    }
    if (key === 'allowForcedToolCalls') {
      if (typeof value !== 'boolean') throw new Error(`${label}.${key} must be boolean`)
      limits.allowForcedToolCalls = value
      continue
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`${label}.${key} must be a non-negative number`)
    }
    ;(limits as Record<string, number>)[key] = value
  }
  return limits
}

function parseSnapshotConfigFileMetadata(input: unknown, configFileIndex: number): ProviderCatalogConfigFile['metadata'] {
  if (!isRecord(input)) throw new Error(`agent settings snapshot configFiles ${configFileIndex} metadata must be an object`)
  if (!isJSONValue(input)) throw new Error(`agent settings snapshot configFiles ${configFileIndex} metadata must be JSON-compatible`)
  return JSON.parse(JSON.stringify(input)) as ProviderCatalogConfigFile['metadata']
}

function parseSnapshotStringList(input: unknown, label: string): string[] {
  if (!Array.isArray(input)) throw new Error(`${label} must be an array`)
  const seen = new Set<string>()
  return input.map((item, index) => {
    const value = parseRequiredNonEmptyString(item, `${label} ${index + 1}`)
    if (seen.has(value)) throw new Error(`${label} ${index + 1} is duplicated`)
    seen.add(value)
    return value
  })
}

function parseSnapshotJSONArray(input: unknown, label: string): unknown[] {
  if (!Array.isArray(input)) throw new Error(`${label} must be an array`)
  if (!isJSONValue(input)) throw new Error(`${label} must be JSON-compatible`)
  return JSON.parse(JSON.stringify(input)) as unknown[]
}

function validateSnapshotConfigFileReferences(
  configFiles: ProviderCatalogConfigFile[],
  skills: ProviderCatalogSkill[],
): AgentSettingsSnapshotReferenceIssue[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))
  const issues: AgentSettingsSnapshotReferenceIssue[] = []
  for (const [configFileIndex, configFile] of configFiles.entries()) {
    for (const [skillIndex, skillId] of configFile.skillIds.entries()) {
      if (!skillById.has(skillId)) {
        issues.push({
          path: `configFiles.${configFileIndex + 1}.skillIds.${skillIndex + 1}`,
          message: `config file ${configFile.id} references missing skill ${skillId}`,
        })
      }
    }
  }
  return issues
}

function validateSnapshotSkillConfigReferences(
  defaults: SkillConfigWorkspace[],
  skills: ProviderCatalogSkill[],
  configFile: ProviderCatalogConfigFile | null,
): AgentSettingsSnapshotReferenceIssue[] {
  const issues = new Map<string, AgentSettingsSnapshotReferenceIssue>()
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))
  const configSkillIds = new Set(configFile?.skillIds ?? [])
  const enabledById = new Map(skills.map((skill) => [skill.id, skill.loadMode === 'core' || configSkillIds.has(skill.id)]))
  const changedIds = new Set<string>()

  for (const [index, workspace] of defaults.entries()) {
    const skill = skillById.get(workspace.id)
    if (!skill) {
      setReferenceIssue(issues, `skillConfig.${workspace.id}.missing`, `skillConfig.${index + 1}.id`, `skill ${workspace.id} not found`)
      continue
    }
    if (skill.loadMode === 'core' && workspace.enabled === false) {
      setReferenceIssue(issues, `skillConfig.${workspace.id}.core`, `skillConfig.${index + 1}.enabled`, `core skill ${workspace.id} cannot be disabled`)
      continue
    }
    if (enabledById.get(workspace.id) !== workspace.enabled) changedIds.add(workspace.id)
    enabledById.set(workspace.id, workspace.enabled)
  }

  for (const id of changedIds) {
    const skill = skillById.get(id)
    if (!skill) continue
    const enabled = enabledById.get(id) !== false
    if (!enabled) {
      for (const candidate of skills) {
        if (enabledById.get(candidate.id) === false || !(candidate.dependencies ?? []).includes(id)) continue
        setReferenceIssue(issues, `skillConfig.${candidate.id}.dependency.${id}`, 'skillConfig', `skill ${candidate.id} depends on disabled skill ${id}`)
      }
      continue
    }
    for (const dependencyId of skill.dependencies ?? []) {
      if (enabledById.get(dependencyId) === false || !skillById.has(dependencyId)) {
        setReferenceIssue(issues, `skillConfig.${skill.id}.dependency.${dependencyId}`, 'skillConfig', `skill ${skill.id} depends on unavailable skill ${dependencyId}`)
      }
    }
    for (const conflictId of skill.conflicts ?? []) {
      if (enabledById.get(conflictId) === false) continue
      setReferenceIssue(issues, `skillConfig.${skill.id}.conflict.${conflictId}`, 'skillConfig', `skill ${skill.id} conflicts with enabled skill ${conflictId}`)
    }
    for (const candidate of skills) {
      if (candidate.id === skill.id || enabledById.get(candidate.id) === false || !(candidate.conflicts ?? []).includes(skill.id)) continue
      setReferenceIssue(issues, `skillConfig.${skill.id}.conflict.${candidate.id}`, 'skillConfig', `skill ${skill.id} conflicts with enabled skill ${candidate.id}`)
    }
  }

  return Array.from(issues.values())
}

function validateSnapshotToolPermissionReferences(
  permissions: ToolGrantWorkspace[],
  configFile: ProviderCatalogConfigFile,
  pathPrefix: string,
): AgentSettingsSnapshotReferenceIssue[] {
  const baseByName = new Map(configFile.toolGrants.map((grant) => [grant.name, grant]))
  const issues: AgentSettingsSnapshotReferenceIssue[] = []
  for (const [index, grant] of permissions.entries()) {
    const base = baseByName.get(grant.name)
    if (!base) {
      issues.push({
        path: `${pathPrefix}.${index + 1}.name`,
        message: `tool ${grant.name} is not granted by config file ${configFile.id}`,
      })
      continue
    }
    const effectiveApproval = grant.approval ?? base.approval
    if (grant.mode === 'allow' && approvalRank(effectiveApproval) < approvalRank(base.approval)) {
      issues.push({
        path: `${pathPrefix}.${index + 1}.approval`,
        message: `tool ${grant.name} approval cannot be weaker than config file ${configFile.id}`,
      })
    }
  }
  return issues
}

function setReferenceIssue(
  issues: Map<string, AgentSettingsSnapshotReferenceIssue>,
  key: string,
  path: string,
  message: string,
) {
  if (!issues.has(key)) issues.set(key, { path, message })
}

function approvalRank(value: unknown): number {
  if (value === 'always') return 2
  if (value === 'on_write') return 1
  return 0
}

function parseOptionalPositiveInteger(input: unknown, label: string): number | undefined {
  if (input === undefined) return undefined
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return input
}

function parseOptionalNonEmptyString(input: unknown, label: string): string | undefined {
  if (input === undefined) return undefined
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return input.trim()
}

function parseRequiredNonEmptyString(input: unknown, label: string): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return input.trim()
}

function parseOptionalDateString(input: unknown, label: string): string | undefined {
  const value = parseOptionalNonEmptyString(input, label)
  if (value === undefined) return undefined
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid date string`)
  }
  return value
}

function parseOptionalString(input: unknown, label: string): string | undefined {
  if (input === undefined) return undefined
  if (typeof input !== 'string') {
    throw new Error(`${label} must be a string`)
  }
  return input
}

function assertAllowedKeys(input: Record<string, unknown>, label: string, allowedKeys: string[]) {
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`${label}.${key} is not supported`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJSONValue(value: unknown): boolean {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJSONValue)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

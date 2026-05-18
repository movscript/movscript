import type { AgentCatalogProfile, AgentCatalogSkill, AgentManifest, RuntimeModelConfigPublic } from './localAgentClient'
import { hasSensitiveTextSecret, hasSensitiveURLSecret, stripSensitiveURLSecrets } from './agentTraceDebugData'
import { publicModelId } from './modelDisplay'
import type { AgentRunPreset, AgentSettings } from '@/store/agentStore'
import type { PublicModel } from '@/types'

export type RuntimeModelAPIKind = NonNullable<RuntimeModelConfigPublic['apiKind']>
export type ToolGrantDraft = AgentManifest['tools'][number]
export type SkillPolicyDraft = { id: string; enabled: boolean }
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
  modelConfig?: {
    model: string
    modelConfigId?: number
    apiKind?: RuntimeModelAPIKind
    baseURL?: string
    useForChat?: boolean
    useForPlanner?: boolean
  }
  defaultProfileId?: string
  skillPolicy?: SkillPolicyDraft[]
  toolPolicy?: ToolGrantDraft[]
  activeRunPresetId?: string
  runPresets?: AgentRunPreset[]
}

export function buildSettingsSnapshot(input: {
  config: RuntimeModelConfigPublic | null
  profileId: string
  skillPolicy: SkillPolicyDraft[]
  toolPolicy: ToolGrantDraft[]
  activeRunPresetId: string
  runPresets: AgentRunPreset[]
}): AgentSettingsSnapshot {
  const modelConfig = buildSnapshotModelConfig(input.config)
  return {
    schema: AGENT_SETTINGS_SNAPSHOT_SCHEMA,
    schemaVersion: AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
    schemaUrl: AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
    exportedAt: new Date().toISOString(),
    ...(modelConfig ? { modelConfig } : {}),
    ...(input.profileId ? { defaultProfileId: input.profileId } : {}),
    skillPolicy: input.skillPolicy.map((skill) => ({ id: skill.id, enabled: skill.enabled })),
    toolPolicy: input.toolPolicy.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    activeRunPresetId: input.activeRunPresetId,
    runPresets: input.runPresets.map((preset) => ({ ...preset })),
  }
}

function buildSnapshotModelConfig(config: RuntimeModelConfigPublic | null): AgentSettingsSnapshot['modelConfig'] | undefined {
  if (!config?.configured) return undefined
  const apiKind = config.apiKind ?? 'backend_chat_completions'
  if (apiKind !== 'backend_chat_completions' && hasSensitiveTextSecret(config.model)) return undefined
  return {
    model: config.model,
    ...(typeof config.modelConfigId === 'number' ? { modelConfigId: config.modelConfigId } : {}),
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
  assertAllowedKeys(parsed, 'agent settings snapshot', ['schema', 'schemaVersion', 'schemaUrl', 'exportedAt', 'modelConfig', 'defaultProfileId', 'skillPolicy', 'toolPolicy', 'activeRunPresetId', 'runPresets'])
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION) throw new Error('unsupported agent settings snapshot schemaVersion')
  if (parsed.schemaUrl !== undefined && parsed.schemaUrl !== AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL) throw new Error('unsupported agent settings snapshot schemaUrl')
  const snapshot: AgentSettingsSnapshot = {
    schema: AGENT_SETTINGS_SNAPSHOT_SCHEMA,
    schemaVersion: AGENT_SETTINGS_SNAPSHOT_SCHEMA_VERSION,
    schemaUrl: AGENT_SETTINGS_SNAPSHOT_SCHEMA_URL,
    exportedAt: parseOptionalDateString(parsed.exportedAt, 'agent settings snapshot exportedAt') ?? new Date().toISOString(),
  }
  if (parsed.modelConfig !== undefined) {
    if (!isRecord(parsed.modelConfig)) throw new Error('agent settings snapshot modelConfig must be an object')
    snapshot.modelConfig = parseSnapshotModelConfig(parsed.modelConfig)
  }
  const defaultProfileId = parseOptionalNonEmptyString(parsed.defaultProfileId, 'agent settings snapshot defaultProfileId')
  if (defaultProfileId) snapshot.defaultProfileId = defaultProfileId
  if (parsed.skillPolicy !== undefined) snapshot.skillPolicy = parseSnapshotSkillPolicy(parsed.skillPolicy)
  if (parsed.toolPolicy !== undefined) snapshot.toolPolicy = parseSnapshotToolPolicy(parsed.toolPolicy)
  const activeRunPresetId = parseOptionalNonEmptyString(parsed.activeRunPresetId, 'agent settings snapshot activeRunPresetId')
  if (activeRunPresetId) snapshot.activeRunPresetId = activeRunPresetId
  if (parsed.runPresets !== undefined) snapshot.runPresets = parseSnapshotRunPresets(parsed.runPresets)
  return snapshot
}

export function resolveSnapshotRunPresetImport(
  snapshot: AgentSettingsSnapshot,
  settings: AgentSettings,
): Partial<Pick<AgentSettings, 'runPresets' | 'activeRunPresetId' | 'permissionMode' | 'autoPlan' | 'planMaxWorkers' | 'planMaxTaskAttempts' | 'planWorkerTimeoutMs'>> | null {
  const runPresets = snapshot.runPresets ?? settings.runPresets
  const requestedActiveRunPresetId = snapshot.activeRunPresetId ?? settings.activeRunPresetId
  const active = runPresets.find((preset) => preset.id === requestedActiveRunPresetId) ?? runPresets[0]
  if (!active) return null
  return {
    ...(snapshot.runPresets ? { runPresets } : {}),
    activeRunPresetId: active.id,
    permissionMode: active.permissionMode,
    autoPlan: active.autoPlan,
    planMaxWorkers: active.planMaxWorkers,
    planMaxTaskAttempts: active.planMaxTaskAttempts,
    planWorkerTimeoutMs: active.planWorkerTimeoutMs,
  }
}

export function validateSettingsSnapshotReferences(
  snapshot: AgentSettingsSnapshot,
  input: {
    textModels?: PublicModel[]
    profiles: AgentCatalogProfile[]
    currentProfile: AgentCatalogProfile | null
    skills: AgentCatalogSkill[]
  },
): AgentSettingsSnapshotReferenceIssue[] {
  const issues: AgentSettingsSnapshotReferenceIssue[] = []
  if (snapshot.modelConfig) {
    issues.push(...validateSnapshotModelReference(snapshot.modelConfig, input.textModels))
  }

  const profileById = new Map(input.profiles.map((profile) => [profile.id, profile]))
  const targetProfile = snapshot.defaultProfileId ? profileById.get(snapshot.defaultProfileId) ?? null : input.currentProfile
  if (snapshot.defaultProfileId && !targetProfile) {
    issues.push({
      path: 'defaultProfileId',
      message: `profile ${snapshot.defaultProfileId} not found`,
    })
  }

  if (snapshot.skillPolicy) {
    issues.push(...validateSnapshotSkillReferences(snapshot.skillPolicy, input.skills))
  }

  if (snapshot.toolPolicy) {
    if (!targetProfile) {
      issues.push({
        path: 'toolPolicy',
        message: 'tool policy requires an available default profile',
      })
    } else {
      issues.push(...validateSnapshotToolReferences(snapshot.toolPolicy, targetProfile))
    }
  }

  return issues
}

function validateSnapshotModelReference(
  modelConfig: NonNullable<AgentSettingsSnapshot['modelConfig']>,
  textModels: PublicModel[] | undefined,
): AgentSettingsSnapshotReferenceIssue[] {
  const apiKind = modelConfig.apiKind ?? 'backend_chat_completions'
  if (apiKind !== 'backend_chat_completions') return []
  if (!textModels) {
    return [{
      path: 'modelConfig.model',
      message: 'backend model catalog is not available',
    }]
  }
  const byPublicId = textModels.some((model) => publicModelId(model) === modelConfig.model)
  const byConfigId = typeof modelConfig.modelConfigId === 'number'
    ? textModels.some((model) => model.id === modelConfig.modelConfigId)
    : false
  const modelConfigIdMatch = /^model_config:(\d+)$/.exec(modelConfig.model)
  const byModelConfigModel = modelConfigIdMatch
    ? textModels.some((model) => model.id === Number(modelConfigIdMatch[1]))
    : false
  if (byPublicId || byConfigId || byModelConfigModel) return []
  return [{
    path: 'modelConfig.model',
    message: `backend model ${modelConfig.model} not found`,
  }]
}

function parseSnapshotModelConfig(input: Record<string, unknown>): NonNullable<AgentSettingsSnapshot['modelConfig']> {
  assertAllowedKeys(input, 'agent settings snapshot modelConfig', ['model', 'modelConfigId', 'apiKind', 'baseURL', 'useForChat', 'useForPlanner'])
  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : ''
  if (!model) throw new Error('agent settings snapshot modelConfig.model is required')
  const apiKind = parseSnapshotAPIKind(input.apiKind)
  if (apiKind && apiKind !== 'backend_chat_completions' && hasSensitiveTextSecret(model)) {
    throw new Error('agent settings snapshot modelConfig.model must not include API keys, bearer tokens, or secret URL credentials')
  }
  const modelConfigId = parseOptionalPositiveInteger(input.modelConfigId, 'agent settings snapshot modelConfig.modelConfigId')
  const baseURL = parseOptionalNonEmptyString(input.baseURL, 'agent settings snapshot modelConfig.baseURL')
  if (hasSensitiveURLSecret(baseURL)) {
    throw new Error('agent settings snapshot modelConfig.baseURL must not include secret URL credentials')
  }
  if (input.useForChat !== undefined && typeof input.useForChat !== 'boolean') {
    throw new Error('agent settings snapshot modelConfig.useForChat must be boolean')
  }
  if (input.useForPlanner !== undefined && typeof input.useForPlanner !== 'boolean') {
    throw new Error('agent settings snapshot modelConfig.useForPlanner must be boolean')
  }
  if (input.useForChat === false && input.useForPlanner === false) {
    throw new Error('agent settings snapshot modelConfig must enable at least one route')
  }
  return {
    model,
    ...(modelConfigId ? { modelConfigId } : {}),
    ...(apiKind ? { apiKind } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(typeof input.useForChat === 'boolean' ? { useForChat: input.useForChat } : {}),
    ...(typeof input.useForPlanner === 'boolean' ? { useForPlanner: input.useForPlanner } : {}),
  }
}

function parseSnapshotAPIKind(input: unknown): RuntimeModelAPIKind | undefined {
  if (input === undefined) return undefined
  if (input === 'backend_chat_completions' || input === 'openai_responses' || input === 'openai_chat_completions' || input === 'anthropic_messages') return input
  throw new Error('agent settings snapshot modelConfig.apiKind is invalid')
}

function parseSnapshotSkillPolicy(input: unknown): SkillPolicyDraft[] {
  if (!Array.isArray(input)) throw new Error('agent settings snapshot skillPolicy must be an array')
  const seenIds = new Set<string>()
  return input.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent settings snapshot skillPolicy ${index + 1} must be an object`)
    assertAllowedKeys(item, `agent settings snapshot skillPolicy ${index + 1}`, ['id', 'enabled'])
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : ''
    if (!id) throw new Error(`agent settings snapshot skillPolicy ${index + 1} id is required`)
    if (seenIds.has(id)) throw new Error(`agent settings snapshot skillPolicy ${index + 1} id is duplicated`)
    seenIds.add(id)
    if (typeof item.enabled !== 'boolean') throw new Error(`agent settings snapshot skillPolicy ${index + 1} enabled must be boolean`)
    return { id, enabled: item.enabled }
  })
}

function parseSnapshotToolPolicy(input: unknown): ToolGrantDraft[] {
  if (!Array.isArray(input)) throw new Error('agent settings snapshot toolPolicy must be an array')
  const seenNames = new Set<string>()
  return input.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent settings snapshot toolPolicy ${index + 1} must be an object`)
    assertAllowedKeys(item, `agent settings snapshot toolPolicy ${index + 1}`, ['name', 'mode', 'approval'])
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : ''
    if (!name) throw new Error(`agent settings snapshot toolPolicy ${index + 1} name is required`)
    if (seenNames.has(name)) throw new Error(`agent settings snapshot toolPolicy ${index + 1} name is duplicated`)
    seenNames.add(name)
    if (item.mode !== 'allow' && item.mode !== 'deny') throw new Error(`agent settings snapshot toolPolicy ${index + 1} mode is invalid`)
    if (item.approval !== undefined && item.approval !== 'never' && item.approval !== 'always' && item.approval !== 'on_write') {
      throw new Error(`agent settings snapshot toolPolicy ${index + 1} approval is invalid`)
    }
    return {
      name,
      mode: item.mode,
      ...(item.approval ? { approval: item.approval } : {}),
    }
  })
}

function validateSnapshotSkillReferences(
  policy: SkillPolicyDraft[],
  skills: AgentCatalogSkill[],
): AgentSettingsSnapshotReferenceIssue[] {
  const issues = new Map<string, AgentSettingsSnapshotReferenceIssue>()
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))
  const enabledById = new Map(skills.map((skill) => [skill.id, skill.enabled !== false]))
  const changedIds = new Set<string>()

  for (const [index, draft] of policy.entries()) {
    const skill = skillById.get(draft.id)
    if (!skill) {
      setReferenceIssue(issues, `skillPolicy.${draft.id}.missing`, `skillPolicy.${index + 1}.id`, `skill ${draft.id} not found`)
      continue
    }
    if (skill.loadMode === 'core' && draft.enabled === false) {
      setReferenceIssue(issues, `skillPolicy.${draft.id}.core`, `skillPolicy.${index + 1}.enabled`, `core skill ${draft.id} cannot be disabled`)
      continue
    }
    if (enabledById.get(draft.id) !== draft.enabled) changedIds.add(draft.id)
    enabledById.set(draft.id, draft.enabled)
  }

  for (const id of changedIds) {
    const skill = skillById.get(id)
    if (!skill) continue
    const enabled = enabledById.get(id) !== false
    if (!enabled) {
      for (const candidate of skills) {
        if (enabledById.get(candidate.id) === false || !(candidate.dependencies ?? []).includes(id)) continue
        setReferenceIssue(issues, `skillPolicy.${candidate.id}.dependency.${id}`, 'skillPolicy', `skill ${candidate.id} depends on disabled skill ${id}`)
      }
      continue
    }
    for (const dependencyId of skill.dependencies ?? []) {
      if (enabledById.get(dependencyId) === false || !skillById.has(dependencyId)) {
        setReferenceIssue(issues, `skillPolicy.${skill.id}.dependency.${dependencyId}`, 'skillPolicy', `skill ${skill.id} depends on unavailable skill ${dependencyId}`)
      }
    }
    for (const conflictId of skill.conflicts ?? []) {
      if (enabledById.get(conflictId) === false) continue
      setReferenceIssue(issues, `skillPolicy.${skill.id}.conflict.${conflictId}`, 'skillPolicy', `skill ${skill.id} conflicts with enabled skill ${conflictId}`)
    }
    for (const candidate of skills) {
      if (candidate.id === skill.id || enabledById.get(candidate.id) === false || !(candidate.conflicts ?? []).includes(skill.id)) continue
      setReferenceIssue(issues, `skillPolicy.${skill.id}.conflict.${candidate.id}`, 'skillPolicy', `skill ${skill.id} conflicts with enabled skill ${candidate.id}`)
    }
  }

  return Array.from(issues.values())
}

function validateSnapshotToolReferences(
  policy: ToolGrantDraft[],
  profile: AgentCatalogProfile,
): AgentSettingsSnapshotReferenceIssue[] {
  const baseByName = new Map(profile.toolGrants.map((grant) => [grant.name, grant]))
  const issues: AgentSettingsSnapshotReferenceIssue[] = []
  for (const [index, grant] of policy.entries()) {
    const base = baseByName.get(grant.name)
    if (!base) {
      issues.push({
        path: `toolPolicy.${index + 1}.name`,
        message: `tool ${grant.name} is not granted by profile ${profile.id}`,
      })
      continue
    }
    const effectiveApproval = grant.approval ?? base.approval
    if (grant.mode === 'allow' && approvalRank(effectiveApproval) < approvalRank(base.approval)) {
      issues.push({
        path: `toolPolicy.${index + 1}.approval`,
        message: `tool ${grant.name} approval cannot be weaker than profile ${profile.id}`,
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

function parseSnapshotRunPresets(input: unknown): AgentRunPreset[] {
  if (!Array.isArray(input)) throw new Error('agent settings snapshot runPresets must be an array')
  const seenIds = new Set<string>()
  return input.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent settings snapshot runPresets ${index + 1} must be an object`)
    assertAllowedKeys(item, `agent settings snapshot runPresets ${index + 1}`, ['id', 'name', 'description', 'permissionMode', 'autoPlan', 'maxToolCalls', 'maxIterations', 'planMaxWorkers', 'planMaxTaskAttempts', 'planWorkerTimeoutMs'])
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : ''
    if (!id) throw new Error(`agent settings snapshot runPresets ${index + 1} id is required`)
    if (seenIds.has(id)) throw new Error(`agent settings snapshot runPresets ${index + 1} id is duplicated`)
    seenIds.add(id)
    if (item.permissionMode !== 'ask' && item.permissionMode !== 'suggest' && item.permissionMode !== 'auto') throw new Error(`agent settings snapshot runPresets ${index + 1} permissionMode is invalid`)
    if (item.autoPlan !== undefined && typeof item.autoPlan !== 'boolean') throw new Error(`agent settings snapshot runPresets ${index + 1} autoPlan must be boolean`)
    return {
      id,
      name: parseOptionalNonEmptyString(item.name, `agent settings snapshot runPresets ${index + 1} name`) ?? id,
      description: parseOptionalString(item.description, `agent settings snapshot runPresets ${index + 1} description`) ?? '',
      permissionMode: item.permissionMode,
      autoPlan: item.autoPlan !== false,
      maxToolCalls: parseSnapshotIntegerRange(item.maxToolCalls, `agent settings snapshot runPresets ${index + 1} maxToolCalls`, 1, 200),
      maxIterations: parseSnapshotIntegerRange(item.maxIterations, `agent settings snapshot runPresets ${index + 1} maxIterations`, 1, 200),
      planMaxWorkers: parseSnapshotIntegerOption(item.planMaxWorkers, `agent settings snapshot runPresets ${index + 1} planMaxWorkers`, [1, 2, 3, 4]),
      planMaxTaskAttempts: parseSnapshotIntegerOption(item.planMaxTaskAttempts, `agent settings snapshot runPresets ${index + 1} planMaxTaskAttempts`, [1, 2, 3]),
      planWorkerTimeoutMs: parseSnapshotIntegerOption(item.planWorkerTimeoutMs, `agent settings snapshot runPresets ${index + 1} planWorkerTimeoutMs`, [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000]),
    }
  })
}

function parseSnapshotIntegerRange(input: unknown, label: string, min: number, max: number): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < min || input > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`)
  }
  return input
}

function parseSnapshotIntegerOption(input: unknown, label: string, options: number[]): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || !options.includes(input)) {
    throw new Error(`${label} must be one of ${options.join(', ')}`)
  }
  return input
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

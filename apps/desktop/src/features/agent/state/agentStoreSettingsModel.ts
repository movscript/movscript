import { isRecord } from '@/shared/domain/jsonValue'
import { MOVA_PROVIDER_ID } from '@/shared/infrastructure/providerConfigStore'
import type {
  ProviderCatalogConfigFile,
  ProviderToolApprovalMode,
  ProviderToolGrantMode,
} from '@movscript/agent-protocol'

export interface AgentSettings {
  activeProviderProfileConfigId: AgentSettingsProviderProfileConfigId
  modelIdByProviderProfile: Record<string, string>
  modelId: string | null
  collaborationMode: 'default' | 'plan'
  goalModeEnabled: boolean
  includeProjectContext: boolean
  includeRecentResources: boolean
  planMaxWorkers: number
  planMaxTaskAttempts: number
  planWorkerTimeoutMs: number
  toolPermissionsFilterPresets: AgentToolPermissionsFilterPreset[]
  auditTrail: AgentSettingsAuditEntry[]
  lastImportBackup: AgentSettingsImportBackup | null
  lastConfigFileBackup: AgentSettingsConfigFileBackup | null
}

export type AgentSettingsProviderProfileConfigId = string

export type AgentToolPermissionsFilterPresetFilter = 'all' | 'available' | 'blocked' | 'config_file_granted' | 'requires_approval' | 'write_risk'

export interface AgentToolPermissionsFilterPreset {
  id: string
  name: string
  search: string
  filter: AgentToolPermissionsFilterPresetFilter
}

export interface AgentSettingsAuditEntry {
  id: string
  action: string
  target: 'model' | 'config_file' | 'installed_capabilities' | 'skills' | 'tools' | 'snapshot'
  summary: string
  createdAt: string
}

export interface AgentSettingsImportBackup {
  text: string
  createdAt: string
}

export interface AgentSettingsConfigFileBackup {
  configFile: ProviderCatalogConfigFile
  toolPermissionOverrides?: ProviderCatalogConfigFile['toolGrants']
  activeConfigFileId: string | null
  createdAt: string
}

export function createAgentSettingsAuditId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  activeProviderProfileConfigId: MOVA_PROVIDER_ID,
  modelIdByProviderProfile: {},
  modelId: null,
  collaborationMode: 'default',
  goalModeEnabled: false,
  includeProjectContext: true,
  includeRecentResources: true,
  planMaxWorkers: 2,
  planMaxTaskAttempts: 2,
  planWorkerTimeoutMs: 15 * 60_000,
  toolPermissionsFilterPresets: [],
  auditTrail: [],
  lastImportBackup: null,
  lastConfigFileBackup: null,
}

const MAX_AGENT_SETTINGS_IMPORT_BACKUP_BYTES = 1024 * 1024
const MAX_AGENT_TOOL_PERMISSIONS_FILTER_PRESETS = 12

type PersistedAgentSettings = Partial<AgentSettings>

export function normalizeAgentSettings(settings?: PersistedAgentSettings | null): AgentSettings {
  return normalizeAgentSettingsWithOptions(settings)
}

export function normalizeAgentSettingsWithOptions(
  settings?: PersistedAgentSettings | null,
  options: { resetDraftModeSettings?: boolean } = {},
): AgentSettings {
  const merged = {
    ...DEFAULT_AGENT_SETTINGS,
    ...settings,
    activeProviderProfileConfigId: settings?.activeProviderProfileConfigId
      ?? DEFAULT_AGENT_SETTINGS.activeProviderProfileConfigId,
  }
  const workerOptions = [1, 2, 3, 4]
  const attemptOptions = [1, 2, 3]
  const timeoutOptions = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000]
  const activeProviderProfileConfigId = normalizeAgentSettingsProviderProfileConfigId(merged.activeProviderProfileConfigId)
  const modelIdByProviderProfile = normalizeModelIdByProviderProfile(merged.modelIdByProviderProfile)
  const legacyModelId = normalizePersistedModelId(merged.modelId)
  if (legacyModelId && !modelIdByProviderProfile[activeProviderProfileConfigId]) {
    modelIdByProviderProfile[activeProviderProfileConfigId] = legacyModelId
  }
  return {
    ...merged,
    activeProviderProfileConfigId,
    modelIdByProviderProfile,
    modelId: null,
    collaborationMode: options.resetDraftModeSettings
      ? DEFAULT_AGENT_SETTINGS.collaborationMode
      : merged.collaborationMode === 'plan' ? 'plan' : DEFAULT_AGENT_SETTINGS.collaborationMode,
    goalModeEnabled: options.resetDraftModeSettings
      ? DEFAULT_AGENT_SETTINGS.goalModeEnabled
      : typeof merged.goalModeEnabled === 'boolean' ? merged.goalModeEnabled : DEFAULT_AGENT_SETTINGS.goalModeEnabled,
    includeProjectContext: typeof merged.includeProjectContext === 'boolean' ? merged.includeProjectContext : DEFAULT_AGENT_SETTINGS.includeProjectContext,
    includeRecentResources: typeof merged.includeRecentResources === 'boolean' ? merged.includeRecentResources : DEFAULT_AGENT_SETTINGS.includeRecentResources,
    toolPermissionsFilterPresets: normalizeToolPermissionsFilterPresets(merged.toolPermissionsFilterPresets),
    auditTrail: normalizeSettingsAuditTrail(merged.auditTrail),
    lastImportBackup: normalizeSettingsImportBackup(merged.lastImportBackup),
    lastConfigFileBackup: normalizeSettingsConfigFileBackup(merged.lastConfigFileBackup),
    planMaxWorkers: workerOptions.includes(Number(merged.planMaxWorkers))
      ? Number(merged.planMaxWorkers)
      : DEFAULT_AGENT_SETTINGS.planMaxWorkers,
    planMaxTaskAttempts: attemptOptions.includes(Number(merged.planMaxTaskAttempts))
      ? Number(merged.planMaxTaskAttempts)
      : DEFAULT_AGENT_SETTINGS.planMaxTaskAttempts,
    planWorkerTimeoutMs: timeoutOptions.includes(Number(merged.planWorkerTimeoutMs))
      ? Number(merged.planWorkerTimeoutMs)
      : DEFAULT_AGENT_SETTINGS.planWorkerTimeoutMs,
  }
}

export function agentSettingsModelIdForProvider(
  settings: Pick<AgentSettings, 'modelIdByProviderProfile' | 'modelId'>,
  providerProfileConfigId: string,
): string | null {
  const providerKey = normalizeAgentSettingsProviderProfileConfigId(providerProfileConfigId)
  return normalizePersistedModelId(settings.modelIdByProviderProfile?.[providerKey])
}

export function agentSettingsModelSelectionPatch(
  settings: Pick<AgentSettings, 'modelIdByProviderProfile'>,
  providerProfileConfigId: string,
  modelId: string | null,
): Pick<AgentSettings, 'modelIdByProviderProfile' | 'modelId'> {
  const providerKey = normalizeAgentSettingsProviderProfileConfigId(providerProfileConfigId)
  const next = { ...(settings.modelIdByProviderProfile ?? {}) }
  const normalizedModelId = normalizePersistedModelId(modelId)
  if (normalizedModelId) {
    next[providerKey] = normalizedModelId
  } else {
    delete next[providerKey]
  }
  return { modelIdByProviderProfile: next, modelId: null }
}

function normalizeAgentSettingsProviderProfileConfigId(value: unknown): AgentSettingsProviderProfileConfigId {
  return normalizeOptionalAgentSettingsProviderProfileConfigId(value) ?? MOVA_PROVIDER_ID
}

function normalizeOptionalAgentSettingsProviderProfileConfigId(value: unknown): AgentSettingsProviderProfileConfigId | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(key) ? key : null
}

function normalizeModelIdByProviderProfile(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const out: Record<string, string> = {}
  for (const [rawKey, rawModelId] of Object.entries(value)) {
    const key = normalizeOptionalAgentSettingsProviderProfileConfigId(rawKey)
    if (!key) continue
    const modelId = normalizePersistedModelId(rawModelId)
    if (!modelId) continue
    out[key] = modelId
  }
  return out
}


function normalizeToolPermissionsFilterPresets(value: unknown): AgentToolPermissionsFilterPreset[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const presets: AgentToolPermissionsFilterPreset[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : ''
    if (!id || seen.has(id)) continue
    const filter = normalizeToolPermissionsFilterPresetFilter(item.filter)
    if (!filter) continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : ''
    const search = typeof item.search === 'string' ? item.search.trim().slice(0, 120) : ''
    presets.push({
      id,
      name: name || filter,
      search,
      filter,
    })
    seen.add(id)
    if (presets.length >= MAX_AGENT_TOOL_PERMISSIONS_FILTER_PRESETS) break
  }
  return presets
}

function normalizeToolPermissionsFilterPresetFilter(value: unknown): AgentToolPermissionsFilterPresetFilter | null {
  if (
    value === 'all'
    || value === 'available'
    || value === 'blocked'
    || value === 'config_file_granted'
    || value === 'requires_approval'
    || value === 'write_risk'
  ) {
    return value
  }
  return null
}

function normalizeSettingsImportBackup(value: unknown): AgentSettingsImportBackup | null {
  if (!isRecord(value)) return null
  const text = typeof value.text === 'string' ? value.text : ''
  if (!text.trim() || settingsBackupByteLength(text) > MAX_AGENT_SETTINGS_IMPORT_BACKUP_BYTES) return null
  return {
    text,
    createdAt: parseAuditTimestamp(value.createdAt),
  }
}

function normalizeSettingsConfigFileBackup(value: unknown): AgentSettingsConfigFileBackup | null {
  if (!isRecord(value)) return null
  const configFile = normalizeSettingsBackupConfigFile(value.configFile)
  if (!configFile) return null
  return {
    configFile,
    ...(Array.isArray(value.toolPermissionOverrides) ? { toolPermissionOverrides: normalizeSettingsBackupToolGrants(value.toolPermissionOverrides) } : {}),
    activeConfigFileId: typeof value.activeConfigFileId === 'string' && value.activeConfigFileId.trim() ? value.activeConfigFileId.trim() : null,
    createdAt: parseAuditTimestamp(value.createdAt),
  }
}

function normalizeSettingsBackupConfigFile(value: unknown): ProviderCatalogConfigFile | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : ''
  const version = typeof value.version === 'string' && value.version.trim() ? value.version.trim() : '1.0.0'
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : ''
  if (!id || !name) return null
  const configFile: ProviderCatalogConfigFile = {
    schema: 'movscript.agent.config_file.v1',
    id,
    version,
    name,
    enabledPackIds: normalizeStringList(value.enabledPackIds),
    skillIds: normalizeStringList(value.skillIds),
    toolGrants: normalizeSettingsBackupToolGrants(value.toolGrants),
  }
  if (typeof value.description === 'string' && value.description.trim()) configFile.description = value.description.trim()
  if (isRecord(value.approvalDefaults)) configFile.approvalDefaults = value.approvalDefaults as ProviderCatalogConfigFile['approvalDefaults']
  if (isRecord(value.model)) configFile.model = value.model as ProviderCatalogConfigFile['model']
  if (isRecord(value.limits)) configFile.limits = normalizeSettingsBackupConfigFileLimits(value.limits)
  if (isRecord(value.metadata)) configFile.metadata = value.metadata as ProviderCatalogConfigFile['metadata']
  return configFile
}

function normalizeSettingsBackupToolGrants(value: unknown): ProviderCatalogConfigFile['toolGrants'] {
  if (!Array.isArray(value)) return []
  const grants: ProviderCatalogConfigFile['toolGrants'] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : ''
    if (!name || seen.has(name)) continue
    const mode = normalizeToolGrantMode(item.mode)
    if (!mode) continue
    const grant: ProviderCatalogConfigFile['toolGrants'][number] = { name, mode }
    const approval = normalizeToolApprovalMode(item.approval)
    if (approval) grant.approval = approval
    grants.push(grant)
    seen.add(name)
  }
  return grants
}

function normalizeToolGrantMode(value: unknown): ProviderToolGrantMode | null {
  return value === 'allow' || value === 'deny' ? value : null
}

function normalizeToolApprovalMode(value: unknown): ProviderToolApprovalMode | null {
  return value === 'never' || value === 'always' || value === 'on_write' ? value : null
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)))
}

function normalizeSettingsBackupConfigFileLimits(value: Record<string, unknown>): NonNullable<ProviderCatalogConfigFile['limits']> {
  const limits: NonNullable<ProviderCatalogConfigFile['limits']> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'executionMode') {
      if (item === 'compact' || item === 'standard' || item === 'deep') limits.executionMode = item
      continue
    }
    if (key === 'allowForcedToolCalls') {
      if (typeof item === 'boolean') limits.allowForcedToolCalls = item
      continue
    }
    const numeric = Number(item)
    if (Number.isFinite(numeric)) {
      const numericLimits = limits as Record<string, number>
      numericLimits[key] = numeric
    }
  }
  return limits
}

function settingsBackupByteLength(value: string): number {
  return new Blob([value]).size
}

function normalizeSettingsAuditTrail(value: unknown): AgentSettingsAuditEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id ? entry.id : createAgentSettingsAuditId(),
      action: typeof entry.action === 'string' && entry.action.trim() ? entry.action.trim() : 'settings_changed',
      target: normalizeSettingsAuditTarget(entry.target),
      summary: typeof entry.summary === 'string' ? entry.summary.slice(0, 240) : '',
      createdAt: parseAuditTimestamp(entry.createdAt),
    }))
    .filter((entry) => entry.summary.trim())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 25)
}

function normalizeSettingsAuditTarget(value: unknown): AgentSettingsAuditEntry['target'] {
  if (value === 'model' || value === 'config_file' || value === 'installed_capabilities' || value === 'skills' || value === 'tools' || value === 'snapshot') return value
  return 'snapshot'
}

function parseAuditTimestamp(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString()
  return new Date().toISOString()
}

export function appendSettingsAuditEntry(
  auditTrail: AgentSettingsAuditEntry[],
  entry: AgentSettingsAuditEntry,
): AgentSettingsAuditEntry[] {
  const normalized = normalizeSettingsAuditTrail([entry])[0]
  if (!normalized) return normalizeSettingsAuditTrail(auditTrail)
  const current = normalizeSettingsAuditTrail(auditTrail)
  const latest = current[0]
  if (
    latest &&
    latest.action === normalized.action &&
    latest.target === normalized.target &&
    latest.summary === normalized.summary &&
    Math.abs(Date.parse(normalized.createdAt) - Date.parse(latest.createdAt)) <= 10_000
  ) {
    return [{ ...latest, createdAt: normalized.createdAt }, ...current.slice(1)]
  }
  return normalizeSettingsAuditTrail([normalized, ...current])
}

function normalizePersistedModelId(input: unknown): string | null {
  if (input === null || input === undefined) return null
  return typeof input === 'string' && input.trim() ? input.trim() : null
}

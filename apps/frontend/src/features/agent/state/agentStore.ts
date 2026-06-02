import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { isRecord } from '@/shared/domain/jsonValue'
import { createInstrumentedAgentStateStorage } from '@/features/agent/state/agentPerformanceStore'
import type {
  AgentAttachment as ProtocolAgentAttachment,
  AgentChatMessage,
  AgentChatMessageMeta,
  AgentContextDiagnostic,
  AgentContextDiagnosticTool,
  AgentConversation,
  AgentConversationDraft,
  AgentGenerationInputPreflightError,
  AgentGenerationInputRequirement,
  AgentGenerationInputRequirements,
  AgentGenerationJob,
  AgentGenerationParamAudit,
  AgentGenerationParamPreflightError,
  AgentGenerationSubmittedInputs,
  AgentGenerationValidationError,
  AgentRunActivity,
  AgentRunActivityApproval,
  AgentRunActivityEvent,
  AgentRunActivityInputRequest,
  AgentRunActivityStep,
  AgentRuntimeInputRef,
  AgentRuntimeMessageRef,
  AgentCatalogConfigFile,
  AgentToolApprovalMode,
  AgentToolGrantMode,
} from '@movscript/protocol'

export type ChatMessage = AgentChatMessage
export type Conversation = AgentConversation
export type ConversationDraft = AgentConversationDraft

export interface AgentSettings {
  modelId: number | null
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
  configFile: AgentCatalogConfigFile
  toolPermissionOverrides?: AgentCatalogConfigFile['toolGrants']
  activeConfigFileId: string | null
  createdAt: string
}

export type AgentAttachment = ProtocolAgentAttachment
export type ChatMessageMeta = AgentChatMessageMeta
export type ChatRuntimeMessageRef = AgentRuntimeMessageRef
export type ChatRuntimeInputRef = AgentRuntimeInputRef
export type ChatContextDiagnostic = AgentContextDiagnostic
export type ChatContextDiagnosticTool = AgentContextDiagnosticTool
export type ChatGenerationJob = AgentGenerationJob
export type ChatGenerationParamAudit = AgentGenerationParamAudit
export type ChatGenerationInputRequirement = AgentGenerationInputRequirement
export type ChatGenerationInputRequirements = AgentGenerationInputRequirements
export type ChatGenerationSubmittedInputs = AgentGenerationSubmittedInputs
export type ChatGenerationParamPreflightError = AgentGenerationParamPreflightError
export type ChatGenerationInputPreflightError = AgentGenerationInputPreflightError
export type ChatGenerationValidationError = AgentGenerationValidationError
export type ChatRunActivity = AgentRunActivity
export type ChatRunActivityApproval = AgentRunActivityApproval
export type ChatRunActivityInputRequest = AgentRunActivityInputRequest
export type ChatRunActivityStep = AgentRunActivityStep
export type ChatRunActivityEvent = AgentRunActivityEvent

interface AgentStore {
  // Legacy model fallback
  settings: AgentSettings
  updateSettings: (s: Partial<AgentSettings>) => void
  recordSettingsAudit: (entry: Omit<AgentSettingsAuditEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void
  clearSettingsAudit: () => void

}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  modelId: null,
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

const LEGACY_AGENT_STORAGE_KEYS = ['agent-store-v3', 'agent-session-store-v1']
const agentStoreStorage = createInstrumentedAgentStateStorage('agent_store')
const agentStorePartialize = createAgentStorePartialize()

if (typeof window !== 'undefined') {
  for (const key of LEGACY_AGENT_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore storage access failures; the panel store itself remains in-memory.
    }
  }
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_AGENT_SETTINGS,

      updateSettings: (s) => set((state) => ({ settings: normalizeAgentSettings({ ...state.settings, ...s }) })),
      recordSettingsAudit: (entry) => set((state) => ({
        settings: normalizeAgentSettings({
          ...state.settings,
          auditTrail: appendSettingsAuditEntry(state.settings.auditTrail, {
            id: genId(),
            action: entry.action,
            target: entry.target,
            summary: entry.summary,
            createdAt: entry.createdAt ?? new Date().toISOString(),
          }),
        }),
      })),
      clearSettingsAudit: () => set((state) => ({
        settings: normalizeAgentSettings({ ...state.settings, auditTrail: [] }),
      })),
    }),
    {
      name: 'agent-store-v4',
      storage: createAgentStorePersistStorage(),
      partialize: agentStorePartialize,
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AgentStore> | undefined
        return {
          ...currentState,
          settings: normalizeAgentSettings(persisted?.settings),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.settings = normalizeAgentSettings(state.settings)
      },
    }
  ),
)

type AgentStorePersistedState = Pick<AgentStore, 'settings'>

function createAgentStorePartialize(): (state: AgentStore) => AgentStorePersistedState {
  let previousSettings: AgentSettings | undefined
  let previousResult: AgentStorePersistedState | undefined
  return (state) => {
    if (previousResult && previousSettings === state.settings) {
      return previousResult
    }
    previousSettings = state.settings
    previousResult = {
      settings: state.settings,
    }
    return previousResult
  }
}

function createAgentStorePersistStorage(): PersistStorage<AgentStorePersistedState> {
  let lastState: AgentStorePersistedState | undefined
  let lastVersion: number | undefined
  let lastSerialized: string | undefined
  return {
    getItem: (name) => {
      const raw = agentStoreStorage.getItem(name)
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as StorageValue<AgentStorePersistedState>
        lastState = parsed.state
        lastVersion = parsed.version
        lastSerialized = raw
        return parsed
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      if (lastState === value.state && lastVersion === value.version) return
      const serialized = JSON.stringify(value)
      if (serialized === lastSerialized) {
        lastState = value.state
        lastVersion = value.version
        return
      }
      lastState = value.state
      lastVersion = value.version
      lastSerialized = serialized
      agentStoreStorage.setItem(name, serialized)
    },
    removeItem: (name) => {
      lastState = undefined
      lastVersion = undefined
      lastSerialized = undefined
      agentStoreStorage.removeItem(name)
    },
  }
}

export function normalizeAgentSettings(settings?: Partial<AgentSettings> | null): AgentSettings {
  const merged = { ...DEFAULT_AGENT_SETTINGS, ...settings }
  const workerOptions = [1, 2, 3, 4]
  const attemptOptions = [1, 2, 3]
  const timeoutOptions = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000]
  return {
    ...merged,
    modelId: normalizePersistedModelId(merged.modelId),
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

function normalizeSettingsBackupConfigFile(value: unknown): AgentCatalogConfigFile | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : ''
  const version = typeof value.version === 'string' && value.version.trim() ? value.version.trim() : '1.0.0'
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : ''
  if (!id || !name) return null
  const configFile: AgentCatalogConfigFile = {
    schema: 'movscript.agent.config_file.v1',
    id,
    version,
    name,
    enabledPackIds: normalizeStringList(value.enabledPackIds),
    skillIds: normalizeStringList(value.skillIds),
    toolGrants: normalizeSettingsBackupToolGrants(value.toolGrants),
  }
  if (typeof value.description === 'string' && value.description.trim()) configFile.description = value.description.trim()
  if (isRecord(value.approvalDefaults)) configFile.approvalDefaults = value.approvalDefaults as AgentCatalogConfigFile['approvalDefaults']
  if (isRecord(value.model)) configFile.model = value.model as AgentCatalogConfigFile['model']
  if (isRecord(value.limits)) configFile.limits = normalizeSettingsBackupConfigFileLimits(value.limits)
  if (isRecord(value.metadata)) configFile.metadata = value.metadata as AgentCatalogConfigFile['metadata']
  return configFile
}

function normalizeSettingsBackupToolGrants(value: unknown): AgentCatalogConfigFile['toolGrants'] {
  if (!Array.isArray(value)) return []
  const grants: AgentCatalogConfigFile['toolGrants'] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : ''
    if (!name || seen.has(name)) continue
    const mode = normalizeToolGrantMode(item.mode)
    if (!mode) continue
    const grant: AgentCatalogConfigFile['toolGrants'][number] = { name, mode }
    const approval = normalizeToolApprovalMode(item.approval)
    if (approval) grant.approval = approval
    grants.push(grant)
    seen.add(name)
  }
  return grants
}

function normalizeToolGrantMode(value: unknown): AgentToolGrantMode | null {
  return value === 'allow' || value === 'deny' ? value : null
}

function normalizeToolApprovalMode(value: unknown): AgentToolApprovalMode | null {
  return value === 'never' || value === 'always' || value === 'on_write' ? value : null
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)))
}

function normalizeSettingsBackupConfigFileLimits(value: Record<string, unknown>): NonNullable<AgentCatalogConfigFile['limits']> {
  const limits: NonNullable<AgentCatalogConfigFile['limits']> = {}
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
      id: typeof entry.id === 'string' && entry.id ? entry.id : genId(),
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

function normalizePersistedModelId(input: unknown): number | null {
  if (input === null || input === undefined) return null
  const numeric = Number(input)
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}

import type { AgentSettingsSnapshot, ToolGrantWorkspace } from '@movscript/core/agent'
import type { ProviderCatalogConfigFile, ProviderCatalogInspectResponse } from '@/shared/infrastructure/providerSessionClient'
import type { AgentSettingsConfigFileBackup } from '@/features/agent/state/agentStore'
import type { buildProviderModelConfigFromSnapshotModel } from '@/features/agent/application/agentSettingsProviderModel'

export const CONFIG_FILE_LIMIT_KEYS = [
  'maxToolCalls',
  'maxIterations',
  'contextWindowCharLimit',
  'systemPromptCharLimit',
  'maxRetrievedContextChars',
  'maxHistoryMessages',
  'maxThreadSummaryChars',
  'maxActiveTriggeredSkills',
  'maxReferenceCharsPerRun',
  'maxReferenceChunksPerRun',
] as const

export const CONFIG_FILE_APPROVAL_DEFAULT_KEYS = ['default', 'read', 'workspace', 'write', 'generate', 'destructive', 'ui'] as const
export const CONFIG_FILE_APPROVAL_DEFAULT_OPTIONS = ['inherit', 'never', 'on_write', 'always'] as const

export type ConfigFileLimitKey = (typeof CONFIG_FILE_LIMIT_KEYS)[number]
export type ConfigFileApprovalDefaultKey = (typeof CONFIG_FILE_APPROVAL_DEFAULT_KEYS)[number]
export type ConfigFileApprovalDefaultWorkspaceValue = (typeof CONFIG_FILE_APPROVAL_DEFAULT_OPTIONS)[number]
export type ConfigFileDiffSection = { added: string[]; removed: string[]; changed?: string[] }
export type ConfigFileDiff = {
  packs: ConfigFileDiffSection
  skills: ConfigFileDiffSection
  tools: ConfigFileDiffSection
  approvalDefaults: ConfigFileDiffSection
  limits: ConfigFileDiffSection
}

export type ToolPermissionsDiffItem = {
  name: string
  change: 'added' | 'removed' | 'changed'
  beforeMode?: ToolGrantWorkspace['mode']
  afterMode?: ToolGrantWorkspace['mode']
  beforeApproval?: ToolGrantWorkspace['approval']
  afterApproval?: ToolGrantWorkspace['approval']
}

export type SettingsSnapshotImportScope = 'model' | 'configFile' | 'limits' | 'skills' | 'tools'
export type SettingsSnapshotImportPresetId = 'all' | 'model-routing' | 'skills-tools' | 'limits'
export type SettingsSnapshotImpactItem = {
  id: SettingsSnapshotImportScope
  scope: 'config' | 'local' | 'skipped'
  labelKey: string
  detailKey: string
  detailValues?: Record<string, string | number>
}
export type SettingsSnapshotConfigFileWrite = {
  configFile: ProviderCatalogConfigFile
  activate: boolean
}
export type SettingsSnapshotConfigFileWritePlan = {
  writesProviderCatalog: boolean
  writes: SettingsSnapshotConfigFileWrite[]
  activeConfigFileId?: string
}
export type SettingsSnapshotWritePlan = SettingsSnapshotConfigFileWritePlan & {
  providerModelConfig: ReturnType<typeof buildProviderModelConfigFromSnapshotModel> | null
  requiresProviderSession: boolean
}
export type ConfigFileRollbackRestorePlan = {
  configFile: ProviderCatalogConfigFile
  activate: boolean
  nextBackup: AgentSettingsConfigFileBackup | null
  selectedConfigFileId: string
}
export type ConfigFileSavePlan = {
  configFile: ProviderCatalogConfigFile
  activate: boolean
  rollbackBackup: AgentSettingsConfigFileBackup | null
  selectedConfigFileId: string
}
export type ConfigFileDeletePlan = {
  configFileId: string
  rollbackBackup: AgentSettingsConfigFileBackup | null
  selectedConfigFileId: string
}
export type ConfigFileActivatePlan = {
  configFileId: string
  rollbackBackup: AgentSettingsConfigFileBackup | null
  selectedConfigFileId: string
}
export type ProviderConfigFileCommitPlan =
  | ({ operation: 'save' } & ConfigFileSavePlan)
  | ({ operation: 'delete' } & ConfigFileDeletePlan)
  | ({ operation: 'activate' } & ConfigFileActivatePlan)
  | ({ operation: 'restore' } & ConfigFileRollbackRestorePlan)
export type ProviderConfigFileCommitResult = {
  selectedConfigFileId: string
  backup: AgentSettingsConfigFileBackup | null
}
export type ProviderConfigFileCommitClient = {
  ensureRunning: () => Promise<unknown>
  saveProviderConfigFile: (input: { configFile: ProviderCatalogConfigFile; activate: boolean }) => Promise<unknown>
  saveActiveProviderConfigFile: (input: { configFileId: string }) => Promise<unknown>
  deleteProviderConfigFile: (input: { configFileId: string }) => Promise<unknown>
}
export type SettingsSnapshotWriteCommitClient = ProviderConfigFileCommitClient & {
  saveProviderModelConfig: (input: NonNullable<SettingsSnapshotWritePlan['providerModelConfig']>) => Promise<unknown>
}
export type SettingsSnapshotImportRequirements = {
  needsCatalog: boolean
  needsCapabilities: boolean
  needsModelCatalog: boolean
}

export const SETTINGS_SNAPSHOT_IMPORT_SCOPES: SettingsSnapshotImportScope[] = ['model', 'configFile', 'limits', 'skills', 'tools']
export const SETTINGS_SNAPSHOT_IMPORT_PRESETS: Array<{ id: SettingsSnapshotImportPresetId; scopes: SettingsSnapshotImportScope[] }> = [
  { id: 'all', scopes: SETTINGS_SNAPSHOT_IMPORT_SCOPES },
  { id: 'model-routing', scopes: ['model'] },
  { id: 'skills-tools', scopes: ['skills', 'tools'] },
  { id: 'limits', scopes: ['limits'] },
]
export const SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS: Record<SettingsSnapshotImportScope, string> = {
  model: 'agents.settings.settingsSnapshotImpact.model',
  configFile: 'agents.settings.settingsSnapshotImpact.configFile',
  limits: 'agents.settings.settingsSnapshotImpact.limits',
  skills: 'agents.settings.settingsSnapshotImpact.skills',
  tools: 'agents.settings.settingsSnapshotImpact.tools',
}

export type AgentSettingsTranslate = (key: string, values?: Record<string, string | number>) => string

export type SettingsSnapshotWritePlanInput = {
  snapshot: AgentSettingsSnapshot
  catalog?: ProviderCatalogInspectResponse
  currentConfigFile: ProviderCatalogConfigFile | null
  t: AgentSettingsTranslate
}

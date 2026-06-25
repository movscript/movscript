import {
  type ToolGrantWorkspace,
} from '@movscript/core/agent'
import type { ProviderCatalogConfigFile } from '@movscript/agent-protocol'
import type { AgentSettingsConfigFileBackup } from '@/features/agent/state/agentStore'
import {
  type ConfigFileActivatePlan,
  type ConfigFileDeletePlan,
  type ConfigFileRollbackRestorePlan,
  type ConfigFileSavePlan,
  type ProviderConfigFileCommitClient,
  type ProviderConfigFileCommitPlan,
  type ProviderConfigFileCommitResult,
  type SettingsSnapshotWriteCommitClient,
  type SettingsSnapshotWritePlan,
} from '@/features/agent/application/agentSettingsConfigFileTypes'

export function buildConfigFileRollbackBackup(input: {
  configFile: ProviderCatalogConfigFile
  activeConfigFileId: string | null
}): AgentSettingsConfigFileBackup {
  return {
    configFile: input.configFile,
    toolPermissionOverrides: [],
    activeConfigFileId: input.activeConfigFileId,
    createdAt: new Date().toISOString(),
  }
}

export function buildConfigFileRollbackBackupFromConfigFile(
  configFile: ProviderCatalogConfigFile | null,
  activeConfigFileId: string | null,
): AgentSettingsConfigFileBackup | null {
  if (!configFile) return null
  return buildConfigFileRollbackBackup({
    configFile: duplicateSnapshotConfigFile(configFile),
    activeConfigFileId,
  })
}

export function buildConfigFileRollbackRestorePlan(input: {
  backup: AgentSettingsConfigFileBackup | null | undefined
  configFiles: ProviderCatalogConfigFile[]
  selectedConfigFile: ProviderCatalogConfigFile | null
  currentConfigFile: ProviderCatalogConfigFile | null
}): ConfigFileRollbackRestorePlan | null {
  const backup = input.backup
  if (!backup) return null
  const currentVersion = input.configFiles.find((configFile) => configFile.id === backup.configFile.id)
    ?? input.selectedConfigFile
    ?? input.currentConfigFile
  return {
    configFile: backup.configFile,
    activate: backup.activeConfigFileId === backup.configFile.id,
    nextBackup: currentVersion
      ? buildConfigFileRollbackBackupFromConfigFile(currentVersion, input.currentConfigFile?.id ?? null)
      : null,
    selectedConfigFileId: backup.configFile.id,
  }
}

export function duplicateSnapshotConfigFile(configFile: ProviderCatalogConfigFile): ProviderCatalogConfigFile {
  return {
    ...configFile,
    enabledPackIds: [...configFile.enabledPackIds],
    skillIds: [...configFile.skillIds],
    ...(configFile.approvalDefaults ? { approvalDefaults: { ...configFile.approvalDefaults } } : {}),
    toolGrants: configFile.toolGrants.map((grant) => ({ ...grant })),
    ...(configFile.model ? { model: { ...configFile.model, ...(Array.isArray(configFile.model.routes) ? { routes: [...configFile.model.routes] } : {}) } } : {}),
    ...(configFile.limits ? { limits: { ...configFile.limits } } : {}),
    ...(configFile.metadata ? { metadata: { ...configFile.metadata } } : {}),
  }
}

export function isManagedConfigFile(configFile: ProviderCatalogConfigFile | null | undefined): boolean {
  return configFile?.metadata?.managed === true
}

export function markConfigFileManaged(configFile: ProviderCatalogConfigFile): ProviderCatalogConfigFile {
  return {
    ...configFile,
    metadata: { ...(configFile.metadata ?? {}), managed: true },
  }
}

export function buildConfigFileWithSkillIds(
  configFile: ProviderCatalogConfigFile,
  skillIds: string[],
): ProviderCatalogConfigFile {
  return {
    ...configFile,
    skillIds,
    metadata: { ...(configFile.metadata ?? {}), managed: true },
  }
}

export function buildConfigFileWithDetails(input: {
  configFile: ProviderCatalogConfigFile
  name: string
  description: string
  limits: ProviderCatalogConfigFile['limits']
  approvalDefaults: ProviderCatalogConfigFile['approvalDefaults']
}): ProviderCatalogConfigFile {
  const nextConfigFile: ProviderCatalogConfigFile = {
    ...input.configFile,
    name: input.name,
    metadata: { ...(input.configFile.metadata ?? {}), managed: true },
  }
  if (input.description) {
    nextConfigFile.description = input.description
  } else {
    delete nextConfigFile.description
  }
  if (input.limits && Object.keys(input.limits).length > 0) {
    nextConfigFile.limits = input.limits
  } else {
    delete nextConfigFile.limits
  }
  if (input.approvalDefaults && Object.keys(input.approvalDefaults).length > 0) {
    nextConfigFile.approvalDefaults = input.approvalDefaults
  } else {
    delete nextConfigFile.approvalDefaults
  }
  return nextConfigFile
}

export function buildConfigFileWithToolGrants(
  configFile: ProviderCatalogConfigFile,
  toolGrants: ToolGrantWorkspace[],
): ProviderCatalogConfigFile {
  return {
    ...configFile,
    toolGrants: toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    metadata: { ...(configFile.metadata ?? {}), managed: true },
  }
}

export function buildDuplicateConfigFileSavePlan(input: {
  sourceConfigFile: ProviderCatalogConfigFile | null
  currentConfigFile: ProviderCatalogConfigFile | null
  configFiles: ProviderCatalogConfigFile[]
  copySuffix: string
}): ConfigFileSavePlan | null {
  if (!input.sourceConfigFile) return null
  const configFile = duplicateConfigFileForManagement(input.sourceConfigFile, input.configFiles, input.copySuffix)
  return {
    configFile,
    activate: true,
    rollbackBackup: buildConfigFileRollbackBackupFromConfigFile(input.currentConfigFile, input.currentConfigFile?.id ?? null),
    selectedConfigFileId: configFile.id,
  }
}

export function buildBlankConfigFileSavePlan(input: {
  currentConfigFile: ProviderCatalogConfigFile | null
  configFiles: ProviderCatalogConfigFile[]
  name: string
}): ConfigFileSavePlan {
  const configFile = createBlankConfigFileForManagement(input.configFiles, input.name)
  return {
    configFile,
    activate: true,
    rollbackBackup: buildConfigFileRollbackBackupFromConfigFile(input.currentConfigFile, input.currentConfigFile?.id ?? null),
    selectedConfigFileId: configFile.id,
  }
}

export function buildImportedConfigFileSavePlan(input: {
  configFile: ProviderCatalogConfigFile
  currentConfigFile: ProviderCatalogConfigFile | null
}): ConfigFileSavePlan {
  return {
    configFile: input.configFile,
    activate: true,
    rollbackBackup: buildConfigFileRollbackBackupFromConfigFile(input.currentConfigFile, input.currentConfigFile?.id ?? null),
    selectedConfigFileId: input.configFile.id,
  }
}

export function buildConfigFileDetailsSavePlan(input: {
  selectedConfigFile: ProviderCatalogConfigFile
  currentConfigFile: ProviderCatalogConfigFile | null
  name: string
  description: string
  limits: ProviderCatalogConfigFile['limits']
  approvalDefaults: ProviderCatalogConfigFile['approvalDefaults']
}): ConfigFileSavePlan {
  const configFile = buildConfigFileWithDetails({
    configFile: input.selectedConfigFile,
    name: input.name,
    description: input.description,
    limits: input.limits,
    approvalDefaults: input.approvalDefaults,
  })
  return {
    configFile,
    activate: input.selectedConfigFile.id === input.currentConfigFile?.id,
    rollbackBackup: buildConfigFileRollbackBackupFromConfigFile(input.selectedConfigFile, input.currentConfigFile?.id ?? null),
    selectedConfigFileId: configFile.id,
  }
}

export function buildSkillConfigFileSavePlan(input: {
  selectedConfigFile: ProviderCatalogConfigFile
  currentConfigFile: ProviderCatalogConfigFile | null
  skillIds: string[]
  hasSelectionChange: boolean
}): ConfigFileSavePlan | null {
  if (!input.hasSelectionChange) return null
  const configFile = buildConfigFileWithSkillIds(input.selectedConfigFile, input.skillIds)
  return {
    configFile,
    activate: input.selectedConfigFile.id === input.currentConfigFile?.id,
    rollbackBackup: buildConfigFileRollbackBackupFromConfigFile(input.selectedConfigFile, input.currentConfigFile?.id ?? null),
    selectedConfigFileId: configFile.id,
  }
}

export function buildToolPermissionsConfigFileSavePlan(input: {
  selectedConfigFile: ProviderCatalogConfigFile
  currentConfigFile: ProviderCatalogConfigFile | null
  toolGrants: ToolGrantWorkspace[]
}): ConfigFileSavePlan {
  const configFile = buildConfigFileWithToolGrants(input.selectedConfigFile, input.toolGrants)
  return {
    configFile,
    activate: input.selectedConfigFile.id === input.currentConfigFile?.id,
    rollbackBackup: buildConfigFileRollbackBackupFromConfigFile(input.selectedConfigFile, input.currentConfigFile?.id ?? null),
    selectedConfigFileId: configFile.id,
  }
}

export function buildDeleteConfigFilePlan(input: {
  selectedConfigFile: ProviderCatalogConfigFile
  currentConfigFile: ProviderCatalogConfigFile | null
}): ConfigFileDeletePlan {
  return {
    configFileId: input.selectedConfigFile.id,
    rollbackBackup: buildConfigFileRollbackBackupFromConfigFile(input.selectedConfigFile, input.currentConfigFile?.id ?? null),
    selectedConfigFileId: input.currentConfigFile?.id ?? '',
  }
}

export function buildActivateConfigFilePlan(input: {
  configFileId: string
  currentConfigFile: ProviderCatalogConfigFile | null
}): ConfigFileActivatePlan {
  return {
    configFileId: input.configFileId,
    rollbackBackup: buildConfigFileRollbackBackupFromConfigFile(input.currentConfigFile, input.currentConfigFile?.id ?? null),
    selectedConfigFileId: input.configFileId,
  }
}

export async function commitProviderConfigFilePlan(input: {
  client: ProviderConfigFileCommitClient
  plan: ProviderConfigFileCommitPlan
  refetchCatalog: () => Promise<unknown>
  refetchCapabilities?: () => Promise<unknown>
}): Promise<ProviderConfigFileCommitResult> {
  if (input.plan.operation === 'save' || input.plan.operation === 'restore') {
    await input.client.saveProviderConfigFile({
      configFile: input.plan.configFile,
      activate: input.plan.activate,
    })
  } else if (input.plan.operation === 'delete') {
    await input.client.deleteProviderConfigFile({ configFileId: input.plan.configFileId })
  } else {
    await input.client.saveActiveProviderConfigFile({ configFileId: input.plan.configFileId })
  }
  await Promise.all([
    input.refetchCatalog(),
    ...(input.refetchCapabilities ? [input.refetchCapabilities()] : []),
  ])
  return {
    selectedConfigFileId: input.plan.selectedConfigFileId,
    backup: input.plan.operation === 'restore' ? input.plan.nextBackup : input.plan.rollbackBackup,
  }
}

export async function commitSettingsSnapshotWritePlan(input: {
  client: SettingsSnapshotWriteCommitClient
  plan: SettingsSnapshotWritePlan
  refetchCatalog: () => Promise<unknown>
  refetchCapabilities: () => Promise<unknown>
}): Promise<void> {
  if (input.plan.requiresProviderSession) await input.client.ensureRunning()
  for (const write of input.plan.writes) {
    await input.client.saveProviderConfigFile({
      configFile: write.configFile,
      activate: write.activate,
    })
  }
  if (input.plan.activeConfigFileId) {
    await input.client.saveActiveProviderConfigFile({ configFileId: input.plan.activeConfigFileId })
  }

  const refetches = [
    ...(input.plan.writesProviderCatalog ? [input.refetchCatalog(), input.refetchCapabilities()] : []),
  ]
  await Promise.all(refetches)
}

export function duplicateConfigFileForManagement(configFile: ProviderCatalogConfigFile, existing: ProviderCatalogConfigFile[], copySuffix: string): ProviderCatalogConfigFile {
  const existingIds = new Set(existing.map((item) => item.id))
  const baseId = `${configFile.id}.copy`.replace(/[^a-zA-Z0-9._-]/g, '_')
  let id = baseId
  let index = 2
  while (existingIds.has(id)) {
    id = `${baseId}.${index}`
    index += 1
  }
  return {
    ...configFile,
    id,
    name: `${configFile.name} ${copySuffix}`.trim(),
    version: '1.0.0',
    enabledPackIds: [...configFile.enabledPackIds],
    skillIds: [...configFile.skillIds],
    ...(configFile.approvalDefaults ? { approvalDefaults: { ...configFile.approvalDefaults } } : {}),
    toolGrants: configFile.toolGrants.map((grant) => ({ ...grant })),
    ...(configFile.model ? { model: { ...configFile.model } } : {}),
    ...(configFile.limits ? { limits: { ...configFile.limits } } : {}),
    ...(configFile.metadata ? { metadata: { ...configFile.metadata, managed: true } } : { metadata: { managed: true } }),
  }
}

export function createBlankConfigFileForManagement(existing: ProviderCatalogConfigFile[], name: string): ProviderCatalogConfigFile {
  const existingIds = new Set(existing.map((item) => item.id))
  const baseId = 'config_file.custom'
  let id = baseId
  let index = 2
  while (existingIds.has(id)) {
    id = `${baseId}.${index}`
    index += 1
  }
  return {
    schema: 'movscript.agent.config_file.v1',
    id,
    version: '1.0.0',
    name,
    enabledPackIds: [],
    skillIds: [],
    toolGrants: [],
    metadata: { managed: true },
  }
}

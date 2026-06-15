import {
  type ToolGrantWorkspace,
} from '@movscript/core/agent'
import type { ProviderCatalogConfigFile } from '@/shared/infrastructure/providerSessionClient'
import type { AgentSettingsConfigFileBackup } from '@/features/agent/state/agentStore'
import {
  CONFIG_FILE_APPROVAL_DEFAULT_KEYS,
  CONFIG_FILE_LIMIT_KEYS,
  type AgentSettingsTranslate,
  type ConfigFileActivatePlan,
  type ConfigFileApprovalDefaultKey,
  type ConfigFileDeletePlan,
  type ConfigFileDiff,
  type ConfigFileDiffSection,
  type ConfigFileLimitKey,
  type ConfigFileRollbackRestorePlan,
  type ConfigFileSavePlan,
  type ProviderConfigFileCommitClient,
  type ProviderConfigFileCommitPlan,
  type ProviderConfigFileCommitResult,
  type SettingsSnapshotWriteCommitClient,
  type SettingsSnapshotWritePlan,
  type ToolPermissionsDiffItem,
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
  await input.client.ensureRunning()
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
  refetchProviderModelConfig: () => Promise<unknown>
  refetchCatalog: () => Promise<unknown>
  refetchCapabilities: () => Promise<unknown>
}): Promise<void> {
  if (input.plan.requiresProviderSession) await input.client.ensureRunning()
  if (input.plan.providerModelConfig) await input.client.saveProviderModelConfig(input.plan.providerModelConfig)
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
    ...(input.plan.providerModelConfig ? [input.refetchProviderModelConfig()] : []),
    ...(input.plan.writesProviderCatalog ? [input.refetchCatalog(), input.refetchCapabilities()] : []),
  ]
  await Promise.all(refetches)
}

export function buildConfigFileDiff(
  current: ProviderCatalogConfigFile,
  next: ProviderCatalogConfigFile,
  t: AgentSettingsTranslate,
): ConfigFileDiff {
  return {
    packs: diffStringLists(current.enabledPackIds, next.enabledPackIds),
    skills: diffStringLists(current.skillIds, next.skillIds),
    tools: diffToolGrants(current.toolGrants, next.toolGrants),
    approvalDefaults: diffConfigFileApprovalDefaults(current.approvalDefaults, next.approvalDefaults, t),
    limits: diffConfigFileLimits(current.limits, next.limits, t),
  }
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

export function diffStringLists(current: string[], next: string[]): ConfigFileDiffSection {
  const currentSet = new Set(current)
  const nextSet = new Set(next)
  return {
    added: next.filter((item) => !currentSet.has(item)),
    removed: current.filter((item) => !nextSet.has(item)),
  }
}

export function diffToolGrants(current: ProviderCatalogConfigFile['toolGrants'], next: ProviderCatalogConfigFile['toolGrants']): ConfigFileDiffSection {
  const currentByName = new Map(current.map((grant) => [grant.name, grant]))
  const nextByName = new Map(next.map((grant) => [grant.name, grant]))
  return {
    added: next.filter((grant) => !currentByName.has(grant.name)).map((grant) => grant.name),
    removed: current.filter((grant) => !nextByName.has(grant.name)).map((grant) => grant.name),
    changed: next
      .filter((grant) => {
        const previous = currentByName.get(grant.name)
        return previous && (previous.mode !== grant.mode || (previous.approval ?? 'never') !== (grant.approval ?? 'never'))
      })
      .map((grant) => grant.name),
  }
}

export function diffConfigFileApprovalDefaults(
  current: ProviderCatalogConfigFile['approvalDefaults'],
  next: ProviderCatalogConfigFile['approvalDefaults'],
  t: AgentSettingsTranslate,
): ConfigFileDiffSection {
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  for (const key of CONFIG_FILE_APPROVAL_DEFAULT_KEYS) {
    const currentValue = current?.[key]
    const nextValue = next?.[key]
    if (currentValue === nextValue) continue
    if (!currentValue && nextValue) added.push(configFileApprovalDefaultDiffLabel(key, nextValue, t))
    else if (currentValue && !nextValue) removed.push(configFileApprovalDefaultDiffLabel(key, currentValue, t))
    else changed.push(`${configFileApprovalDefaultFieldLabel(key, t)}: ${configFileApprovalValueLabel(currentValue, t)} -> ${configFileApprovalValueLabel(nextValue, t)}`)
  }
  return { added, removed, changed }
}

export function diffConfigFileLimits(
  current: ProviderCatalogConfigFile['limits'],
  next: ProviderCatalogConfigFile['limits'],
  t: AgentSettingsTranslate,
): ConfigFileDiffSection {
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  for (const key of CONFIG_FILE_LIMIT_KEYS) {
    const currentValue = configFileLimitValue(current, key)
    const nextValue = configFileLimitValue(next, key)
    if (currentValue === nextValue) continue
    if (currentValue === undefined && nextValue !== undefined) added.push(configFileLimitDiffLabel(key, nextValue, t))
    else if (currentValue !== undefined && nextValue === undefined) removed.push(configFileLimitDiffLabel(key, currentValue, t))
    else changed.push(`${configFileLimitFieldLabel(key, t)}: ${currentValue} -> ${nextValue}`)
  }
  return { added, removed, changed }
}

export function configFileLimitValue(limits: ProviderCatalogConfigFile['limits'], key: ConfigFileLimitKey): number | undefined {
  const value = limits?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined
}

export function configFileApprovalDefaultDiffLabel(
  key: ConfigFileApprovalDefaultKey,
  value: NonNullable<ProviderCatalogConfigFile['approvalDefaults']>[ConfigFileApprovalDefaultKey],
  t: AgentSettingsTranslate,
): string {
  return `${configFileApprovalDefaultFieldLabel(key, t)}:${configFileApprovalValueLabel(value, t)}`
}

export function configFileApprovalDefaultFieldLabel(key: ConfigFileApprovalDefaultKey, t: AgentSettingsTranslate): string {
  return t(`agents.settings.configFileApprovalDefaultFields.${key}`)
}

export function configFileApprovalValueLabel(value: string | undefined, t: AgentSettingsTranslate): string {
  if (!value) return t('agents.settings.configFileApprovalDefaultInherited')
  return t(`agents.settings.toolPermissionsApprovals.${value === 'on_write' ? 'onWrite' : value}`)
}

export function configFileLimitDiffLabel(key: ConfigFileLimitKey, value: number, t: AgentSettingsTranslate): string {
  return `${configFileLimitFieldLabel(key, t)}:${value}`
}

export function configFileLimitFieldLabel(key: ConfigFileLimitKey, t: AgentSettingsTranslate): string {
  return t(`agents.settings.configFileLimitFields.${key}`)
}

export function toolGrantSignature(grants: ToolGrantWorkspace[]): string {
  return JSON.stringify([...grants]
    .map((grant) => ({ name: grant.name, mode: grant.mode, approval: grant.approval ?? 'never' }))
    .sort((a, b) => a.name.localeCompare(b.name)))
}

export function buildToolPermissionsDiffItems(before: ToolGrantWorkspace[], after: ToolGrantWorkspace[]): ToolPermissionsDiffItem[] {
  const beforeByName = new Map(before.map((grant) => [grant.name, grant]))
  const afterByName = new Map(after.map((grant) => [grant.name, grant]))
  const names = [...new Set([...beforeByName.keys(), ...afterByName.keys()])].sort((a, b) => a.localeCompare(b))
  return names.flatMap((name): ToolPermissionsDiffItem[] => {
    const previous = beforeByName.get(name)
    const next = afterByName.get(name)
    if (!previous && next) {
      return [{
        name,
        change: 'added' as const,
        afterMode: next.mode,
        afterApproval: next.approval,
      }]
    }
    if (previous && !next) {
      return [{
        name,
        change: 'removed' as const,
        beforeMode: previous.mode,
        beforeApproval: previous.approval,
      }]
    }
    if (previous && next && (previous.mode !== next.mode || (previous.approval ?? 'never') !== (next.approval ?? 'never'))) {
      return [{
        name,
        change: 'changed' as const,
        beforeMode: previous.mode,
        afterMode: next.mode,
        beforeApproval: previous.approval,
        afterApproval: next.approval,
      }]
    }
    return []
  })
}

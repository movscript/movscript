import {
  buildSettingsSnapshot,
  validateSettingsSnapshotReferences,
  type AgentSettingsSnapshot,
  type AgentSettingsPublicModel,
  type AgentSettingsSnapshotReferenceIssue,
  type ConfigFileToolPermissionOverrides,
  type SkillConfigWorkspace,
  type ToolGrantWorkspace,
} from '@movscript/core/agent'
import type {
  ProviderCatalogConfigFile,
  ProviderCatalogInspectResponse,
  ProviderSessionCapabilitiesResponse,
} from '@movscript/core/agent/protocol'
import type { AgentSettingsConfigFileBackup } from '@/features/agent/state/agentStore'
import type { ToolPermissionsWorkspaceIssue } from '@/features/agent/application/agentSettingsReadiness'
import {
  buildConfigFileRollbackBackupFromConfigFile,
  buildConfigFileWithSkillIds,
  buildConfigFileWithToolGrants,
  markConfigFileManaged,
} from '@/features/agent/application/agentSettingsConfigFileManagement'
import {
  configFileApprovalDefaultSignature,
  configFileLimitSignature,
} from '@/features/agent/application/agentSettingsConfigFileWorkspaces'
import {
  SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS,
  type AgentSettingsTranslate,
  type SettingsSnapshotConfigFileWritePlan,
  type SettingsSnapshotImportRequirements,
  type SettingsSnapshotWritePlan,
} from '@/features/agent/application/agentSettingsConfigFileTypes'
import {
  snapshotConfigFileById,
  snapshotProviderSessionLimits,
  targetSnapshotConfigFile,
} from '@/features/agent/application/agentSettingsSnapshotImportSelection'

export * from '@/features/agent/application/agentSettingsConfigFileTypes'
export * from '@/features/agent/application/agentSettingsConfigFileManagement'
export * from '@/features/agent/application/agentSettingsConfigFileDiff'
export * from '@/features/agent/application/agentSettingsConfigFileExport'
export * from '@/features/agent/application/agentSettingsConfigFileWorkspaces'
export * from '@/features/agent/application/agentSettingsSnapshotImportSelection'

export function buildSettingsSnapshotToolPermissionOverrides(input: {
  currentConfigFileId: string
  currentToolGrantWorkspaces: ToolGrantWorkspace[]
}): ConfigFileToolPermissionOverrides[] {
  const overridesByConfigFile = new Map<string, ToolGrantWorkspace[]>()
  if (input.currentConfigFileId) {
    overridesByConfigFile.set(input.currentConfigFileId, input.currentToolGrantWorkspaces)
  }
  return [...overridesByConfigFile.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([configFileId, toolGrants]) => ({
      configFileId,
      toolGrants: toolGrants.map((grant) => ({
        name: grant.name,
        mode: grant.mode,
        ...(grant.approval ? { approval: grant.approval } : {}),
      })),
    }))
}

export function buildCurrentSettingsSnapshotText(input: {
  config: Parameters<typeof buildSettingsSnapshot>[0]['config']
  currentConfigFileId: string
  configFiles: ProviderCatalogConfigFile[]
  skillConfig: SkillConfigWorkspace[]
  toolPermissionConfigFileId: string
  currentToolGrantWorkspaces: ToolGrantWorkspace[]
}): string {
  return JSON.stringify(buildSettingsSnapshot({
    config: input.config,
    configFileId: input.currentConfigFileId,
    configFiles: input.configFiles,
    skillConfig: input.skillConfig,
    toolPermissionOverrides: buildSettingsSnapshotToolPermissionOverrides({
      currentConfigFileId: input.toolPermissionConfigFileId,
      currentToolGrantWorkspaces: input.currentToolGrantWorkspaces,
    }),
  }), null, 2)
}

export function currentProviderConfigFileId(inspect?: ProviderCatalogInspectResponse): string {
  const raw = inspect?.activeConfigFileId
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'movscript.config_file.base'
}

export function currentProviderConfigFile(
  inspect: ProviderCatalogInspectResponse | undefined,
  currentConfigFileId: string,
): ProviderCatalogConfigFile | null {
  const configFiles = inspect?.configFiles ?? []
  return configFiles.find((configFile) => configFile.id === currentConfigFileId) ?? configFiles[0] ?? null
}

export function selectedProviderConfigFile(input: {
  inspect?: ProviderCatalogInspectResponse
  selectedConfigFileId: string
  currentConfigFile: ProviderCatalogConfigFile | null
}): ProviderCatalogConfigFile | null {
  const configFiles = input.inspect?.configFiles ?? []
  return configFiles.find((configFile) => configFile.id === input.selectedConfigFileId) ?? input.currentConfigFile
}

export function hasConfigFileDetailsChanged(input: {
  configFile: ProviderCatalogConfigFile | null
  name: string
  description: string
  limits: ProviderCatalogConfigFile['limits']
  approvalDefaults: ProviderCatalogConfigFile['approvalDefaults']
}): boolean {
  return Boolean(
    input.configFile
    && (
      input.name !== input.configFile.name
      || input.description !== (input.configFile.description ?? '')
      || configFileLimitSignature(input.limits) !== configFileLimitSignature(input.configFile.limits)
      || configFileApprovalDefaultSignature(input.approvalDefaults) !== configFileApprovalDefaultSignature(input.configFile.approvalDefaults)
    ),
  )
}

export function settingsSnapshotImportRequirementsForSnapshot(snapshot: AgentSettingsSnapshot | null): SettingsSnapshotImportRequirements {
  const providerSessionLimits = snapshotProviderSessionLimits(snapshot)
  return {
    needsCatalog: Boolean(snapshot?.configFiles || providerSessionLimits || snapshot?.activeConfigFileId || snapshot?.skillConfig || snapshot?.toolPermissionOverrides),
    needsCapabilities: Boolean(snapshot?.toolPermissionOverrides),
    needsModelCatalog: snapshotModelNeedsCatalog(snapshot?.model),
  }
}

function snapshotModelNeedsCatalog(model: AgentSettingsSnapshot['model'] | undefined): boolean {
  return Boolean(model?.model && !model.modelEndpointBaseURL)
}

export function settingsSnapshotReferenceIssuesForImport(input: {
  snapshot: AgentSettingsSnapshot | null
  needsCatalog: boolean
  needsModelCatalog: boolean
  textModels?: AgentSettingsPublicModel[]
  catalog?: ProviderCatalogInspectResponse
  currentConfigFile: ProviderCatalogConfigFile | null
}): AgentSettingsSnapshotReferenceIssue[] {
  if (!input.snapshot) return []
  if (input.needsCatalog && !input.catalog) return []
  if (input.needsModelCatalog && !input.textModels) return []
  return validateSettingsSnapshotReferences(input.snapshot, {
    textModels: input.textModels,
    configFiles: input.catalog?.configFiles ?? [],
    currentConfigFile: input.currentConfigFile,
    skills: input.catalog?.skills ?? [],
  })
}

export function settingsSnapshotImportPreflightErrorForSnapshot(input: {
  snapshot: AgentSettingsSnapshot
  t: AgentSettingsTranslate
  textModels?: AgentSettingsPublicModel[]
  catalog?: ProviderCatalogInspectResponse
  currentConfigFile: ProviderCatalogConfigFile | null
  capabilities?: ProviderSessionCapabilitiesResponse
}): string | null {
  const providerSessionLimits = snapshotProviderSessionLimits(input.snapshot)
  const needsModelCatalog = snapshotModelNeedsCatalog(input.snapshot.model)
  const needsCatalog = Boolean(input.snapshot.configFiles || providerSessionLimits || input.snapshot.activeConfigFileId || input.snapshot.skillConfig || input.snapshot.toolPermissionOverrides)
  const needsCapabilities = Boolean(input.snapshot.toolPermissionOverrides)
  if (needsModelCatalog && !input.textModels) {
    return input.t('agents.settings.settingsSnapshotModelCatalogUnavailable')
  }
  if (needsCatalog && !input.catalog) {
    return input.t('agents.settings.settingsSnapshotCatalogUnavailable')
  }
  if (providerSessionLimits && !targetSnapshotConfigFile(input.snapshot, input.catalog, input.currentConfigFile)) {
    return input.t('agents.settings.settingsSnapshotLimitsTargetMissing')
  }
  if (input.snapshot.skillConfig && !targetSnapshotConfigFile(input.snapshot, input.catalog, input.currentConfigFile)) {
    return input.t('agents.settings.settingsSnapshotSkillsTargetMissing')
  }
  if (needsCapabilities && !input.capabilities) {
    return input.t('agents.settings.settingsSnapshotCapabilitiesUnavailable')
  }
  const referenceIssues = settingsSnapshotReferenceIssuesForImport({
    snapshot: input.snapshot,
    needsCatalog,
    needsModelCatalog,
    textModels: input.textModels,
    catalog: input.catalog,
    currentConfigFile: input.currentConfigFile,
  })
  if (referenceIssues.length > 0) return referenceIssues.map((issue) => issue.message).join('; ')
  const snapshotToolPermissionsIssues = (input.snapshot.toolPermissionOverrides ?? []).flatMap((overrides) => (
    buildToolPermissionsWorkspaceIssues({
      workspaces: overrides.toolGrants,
      currentConfigFile: snapshotConfigFileById(input.snapshot, overrides.configFileId, input.catalog, input.currentConfigFile),
      tools: input.capabilities?.resolvedTools,
    })
  ))
  if (snapshotToolPermissionsIssues.length > 0) {
    return input.t('agents.settings.settingsSnapshotToolPermissionsInvalid', { count: snapshotToolPermissionsIssues.length })
  }
  return null
}

export function settingsSnapshotImportPreflightError(input: {
  parsedSnapshot: AgentSettingsSnapshot | null
  validationError: string | null
  hasSelectedImportScope: boolean
  selectedSnapshot: AgentSettingsSnapshot | null
  t: AgentSettingsTranslate
  textModels?: AgentSettingsPublicModel[]
  catalog?: ProviderCatalogInspectResponse
  currentConfigFile: ProviderCatalogConfigFile | null
  capabilities?: ProviderSessionCapabilitiesResponse
}): string | null {
  if (!input.parsedSnapshot) return null
  if (input.validationError) return input.t('agents.settings.settingsSnapshotInvalid', { error: input.validationError })
  if (!input.hasSelectedImportScope || !input.selectedSnapshot) {
    return input.t('agents.settings.settingsSnapshotImportScopeEmpty')
  }
  return settingsSnapshotImportPreflightErrorForSnapshot({
    snapshot: input.selectedSnapshot,
    t: input.t,
    textModels: input.textModels,
    catalog: input.catalog,
    currentConfigFile: input.currentConfigFile,
    capabilities: input.capabilities,
  })
}

export function buildSettingsSnapshotConfigFileWritePlan(input: {
  snapshot: AgentSettingsSnapshot
  catalog?: ProviderCatalogInspectResponse
  currentConfigFile: ProviderCatalogConfigFile | null
  t: AgentSettingsTranslate
}): SettingsSnapshotConfigFileWritePlan {
  const providerSessionLimits = snapshotProviderSessionLimits(input.snapshot)
  const writesProviderCatalog = Boolean(
    input.snapshot.configFiles
    || providerSessionLimits
    || input.snapshot.activeConfigFileId
    || input.snapshot.skillConfig
    || input.snapshot.toolPermissionOverrides,
  )
  const configFileWrites = new Map<string, ProviderCatalogConfigFile>()
  const configFileWriteActivations = new Map<string, boolean>()

  function queueConfigFileWrite(configFile: ProviderCatalogConfigFile, activate: boolean) {
    configFileWrites.set(configFile.id, configFile)
    configFileWriteActivations.set(configFile.id, Boolean(configFileWriteActivations.get(configFile.id) || activate))
  }

  function targetConfigFileForSnapshot(errorMessage: string): ProviderCatalogConfigFile {
    const targetConfigFile = targetSnapshotConfigFile(input.snapshot, input.catalog, input.currentConfigFile)
    if (!targetConfigFile) throw new Error(errorMessage)
    return configFileWrites.get(targetConfigFile.id) ?? targetConfigFile
  }

  if (input.snapshot.configFiles) {
    for (const configFile of input.snapshot.configFiles) {
      queueConfigFileWrite(markConfigFileManaged(configFile), Boolean(input.snapshot.activeConfigFileId && configFile.id === input.snapshot.activeConfigFileId))
    }
  }

  if (providerSessionLimits) {
    const targetConfigFile = targetConfigFileForSnapshot(input.t('agents.settings.settingsSnapshotLimitsTargetMissing'))
    queueConfigFileWrite({
      ...targetConfigFile,
      limits: { ...providerSessionLimits },
      metadata: { ...(targetConfigFile.metadata ?? {}), managed: true },
    }, targetConfigFile.id === input.currentConfigFile?.id || targetConfigFile.id === input.snapshot.activeConfigFileId)
  }

  if (input.snapshot.skillConfig) {
    const targetConfigFile = targetConfigFileForSnapshot(input.t('agents.settings.settingsSnapshotSkillsTargetMissing'))
    queueConfigFileWrite(
      buildConfigFileWithSkillIds(targetConfigFile, input.snapshot.skillConfig.flatMap((workspace) => workspace.enabled ? [workspace.id] : [])),
      targetConfigFile.id === input.currentConfigFile?.id || targetConfigFile.id === input.snapshot.activeConfigFileId,
    )
  }

  if (input.snapshot.toolPermissionOverrides) {
    for (const overrides of input.snapshot.toolPermissionOverrides) {
      const targetConfigFile = snapshotConfigFileById(input.snapshot, overrides.configFileId, input.catalog, input.currentConfigFile)
      if (!targetConfigFile) throw new Error(`config file ${overrides.configFileId} not found`)
      queueConfigFileWrite(buildConfigFileWithToolGrants(targetConfigFile, overrides.toolGrants), targetConfigFile.id === input.currentConfigFile?.id || targetConfigFile.id === input.snapshot.activeConfigFileId)
    }
  }

  const writes = [...configFileWrites.values()].map((configFile) => ({
    configFile,
    activate: Boolean(configFileWriteActivations.get(configFile.id)),
  }))
  return {
    writesProviderCatalog,
    writes,
    ...(input.snapshot.activeConfigFileId && !configFileWrites.has(input.snapshot.activeConfigFileId) ? { activeConfigFileId: input.snapshot.activeConfigFileId } : {}),
  }
}

export function buildSettingsSnapshotWritePlan(input: {
  snapshot: AgentSettingsSnapshot
  catalog?: ProviderCatalogInspectResponse
  currentConfigFile: ProviderCatalogConfigFile | null
  t: AgentSettingsTranslate
}): SettingsSnapshotWritePlan {
  const configFilePlan = buildSettingsSnapshotConfigFileWritePlan(input)
  const modelSelection = input.snapshot.model?.model?.trim()
    ? {
        modelId: input.snapshot.model.model.trim(),
        useForChat: input.snapshot.model.useForChat !== false,
        useForPlanner: input.snapshot.model.useForPlanner !== false,
      }
    : null
  return {
    ...configFilePlan,
    modelSelection,
    requiresProviderSession: configFilePlan.writesProviderCatalog,
  }
}

export function buildToolPermissionsWorkspaceIssues(input: {
  workspaces: ToolGrantWorkspace[]
  currentConfigFile: ProviderCatalogConfigFile | null
  tools?: ProviderSessionCapabilitiesResponse['resolvedTools']
}): ToolPermissionsWorkspaceIssue[] {
  const configFileGranted = new Set((input.currentConfigFile?.toolGrants ?? []).map((grant) => grant.name))
  const discoveredByName = new Map((input.tools?.discovered ?? []).map((tool) => [tool.name, tool]))
  return input.workspaces.flatMap((workspace) => {
    if (!configFileGranted.has(workspace.name)) {
      return [{
        toolName: workspace.name,
        reasonKey: 'agents.settings.toolPermissionsWorkspaceIssueDetails.notConfigFileGranted',
      }]
    }
    const discovered = discoveredByName.get(workspace.name)
    if (discovered && !discovered.available && workspace.mode === 'allow') {
      return [{
        toolName: workspace.name,
        reasonKey: 'agents.settings.toolPermissionsWorkspaceIssueDetails.unavailableAllow',
        values: { reason: discovered.unavailableReason?.trim() || 'blocked' },
      }]
    }
    return []
  })
}

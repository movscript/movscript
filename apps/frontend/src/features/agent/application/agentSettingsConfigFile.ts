import {
  buildSettingsSnapshot,
  redactAgentTraceDebugText,
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
} from '@/shared/infrastructure/providerSessionClient'
import type { AgentSettingsConfigFileBackup } from '@/features/agent/state/agentStore'
import type { ToolPermissionsWorkspaceIssue } from '@/features/agent/application/agentSettingsReadiness'
import { buildProviderModelConfigFromSnapshotModel } from '@/features/agent/application/agentSettingsProviderModel'
import {
  buildConfigFileRollbackBackupFromConfigFile,
  buildConfigFileWithSkillIds,
  buildConfigFileWithToolGrants,
  duplicateSnapshotConfigFile,
  markConfigFileManaged,
} from '@/features/agent/application/agentSettingsConfigFileManagement'
import {
  configFileApprovalDefaultSignature,
  configFileLimitSignature,
} from '@/features/agent/application/agentSettingsConfigFileWorkspaces'
import {
  SETTINGS_SNAPSHOT_IMPORT_PRESETS,
  SETTINGS_SNAPSHOT_IMPORT_SCOPES,
  SETTINGS_SNAPSHOT_IMPORT_SCOPE_LABEL_KEYS,
  type AgentSettingsTranslate,
  type SettingsSnapshotConfigFileWritePlan,
  type SettingsSnapshotImpactItem,
  type SettingsSnapshotImportPresetId,
  type SettingsSnapshotImportRequirements,
  type SettingsSnapshotImportScope,
  type SettingsSnapshotWritePlan,
} from '@/features/agent/application/agentSettingsConfigFileTypes'

export * from '@/features/agent/application/agentSettingsConfigFileTypes'
export * from '@/features/agent/application/agentSettingsConfigFileManagement'
export * from '@/features/agent/application/agentSettingsConfigFileExport'
export * from '@/features/agent/application/agentSettingsConfigFileWorkspaces'

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
    needsModelCatalog: Boolean(snapshot?.model?.model.startsWith('model_config:') || snapshot?.model?.platformModelId),
  }
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
  const needsModelCatalog = Boolean(input.snapshot.model?.model.startsWith('model_config:') || input.snapshot.model?.platformModelId)
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
  const providerModelConfig = input.snapshot.model
    ? buildProviderModelConfigFromSnapshotModel(input.snapshot.model)
    : null
  return {
    ...configFilePlan,
    providerModelConfig,
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

export function targetSnapshotConfigFile(
  snapshot: AgentSettingsSnapshot,
  catalog: ProviderCatalogInspectResponse | undefined,
  fallbackConfigFile: ProviderCatalogConfigFile | null,
): ProviderCatalogConfigFile | null {
  if (!snapshot.activeConfigFileId) return fallbackConfigFile
  return snapshot.configFiles?.find((configFile) => configFile.id === snapshot.activeConfigFileId)
    ?? catalog?.configFiles.find((configFile) => configFile.id === snapshot.activeConfigFileId)
    ?? fallbackConfigFile
}

export function snapshotConfigFileById(
  snapshot: AgentSettingsSnapshot,
  configFileId: string,
  catalog: ProviderCatalogInspectResponse | undefined,
  fallbackConfigFile: ProviderCatalogConfigFile | null,
): ProviderCatalogConfigFile | null {
  return snapshot.configFiles?.find((configFile) => configFile.id === configFileId)
    ?? catalog?.configFiles.find((configFile) => configFile.id === configFileId)
    ?? (fallbackConfigFile?.id === configFileId ? fallbackConfigFile : null)
}

export function selectSettingsSnapshotForImport(
  snapshot: AgentSettingsSnapshot,
  selectedScopes: SettingsSnapshotImportScope[],
): AgentSettingsSnapshot {
  const selected = new Set(selectedScopes)
  return {
    schema: snapshot.schema,
    schemaVersion: snapshot.schemaVersion,
    schemaUrl: snapshot.schemaUrl,
    exportedAt: snapshot.exportedAt,
    ...(selected.has('model') && snapshot.model ? { model: { ...snapshot.model } } : {}),
    ...(selected.has('configFile') && snapshot.activeConfigFileId ? { activeConfigFileId: snapshot.activeConfigFileId } : {}),
    ...(selected.has('configFile') && snapshot.configFiles ? { configFiles: snapshot.configFiles.map((configFile) => duplicateSnapshotConfigFile(configFile)) } : {}),
    ...(selected.has('limits') && snapshotProviderSessionLimits(snapshot) ? { providerSessionLimits: { ...snapshotProviderSessionLimits(snapshot)! } } : {}),
    ...(selected.has('skills') && snapshot.skillConfig ? { skillConfig: snapshot.skillConfig.map((skill) => ({ ...skill })) } : {}),
    ...(selected.has('tools') && snapshot.toolPermissionOverrides ? { toolPermissionOverrides: snapshot.toolPermissionOverrides.map(cloneSnapshotToolPermissionOverrides) } : {}),
  }
}

export function hasSelectedSettingsSnapshotImportScope(
  snapshot: AgentSettingsSnapshot,
  selectedScopes: SettingsSnapshotImportScope[],
): boolean {
  return SETTINGS_SNAPSHOT_IMPORT_SCOPES.some((scope) => (
    selectedScopes.includes(scope) && settingsSnapshotImportScopeAvailable(snapshot, scope)
  ))
}

export function toggleSettingsSnapshotImportScopes(
  current: SettingsSnapshotImportScope[],
  scope: SettingsSnapshotImportScope,
  enabled: boolean,
): SettingsSnapshotImportScope[] {
  return enabled
    ? [...new Set([...current, scope])]
    : current.filter((item) => item !== scope)
}

export function settingsSnapshotImportPresetScopes(
  presetId: SettingsSnapshotImportPresetId,
  snapshot: AgentSettingsSnapshot | null,
): SettingsSnapshotImportScope[] | null {
  const preset = SETTINGS_SNAPSHOT_IMPORT_PRESETS.find((item) => item.id === presetId)
  if (!preset) return null
  return snapshot
    ? preset.scopes.filter((scope) => settingsSnapshotImportScopeAvailable(snapshot, scope))
    : [...preset.scopes]
}

export function settingsSnapshotImportScopeAvailable(snapshot: AgentSettingsSnapshot, scope: SettingsSnapshotImportScope): boolean {
  if (scope === 'model') return Boolean(snapshot.model)
  if (scope === 'configFile') return Boolean(snapshot.activeConfigFileId || snapshot.configFiles?.length)
  if (scope === 'limits') return Boolean(snapshotProviderSessionLimits(snapshot))
  if (scope === 'skills') return Boolean(snapshot.skillConfig)
  return Boolean(snapshot.toolPermissionOverrides)
}

export function cloneSnapshotToolPermissionOverrides(overrides: ConfigFileToolPermissionOverrides): ConfigFileToolPermissionOverrides {
  return {
    configFileId: overrides.configFileId,
    toolGrants: overrides.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
  }
}

export function snapshotProviderSessionLimits(snapshot: AgentSettingsSnapshot | null | undefined): NonNullable<AgentSettingsSnapshot['providerSessionLimits']> | undefined {
  if (!snapshot) return undefined
  if (snapshot.providerSessionLimits && Object.keys(snapshot.providerSessionLimits).length > 0) return cloneProviderSessionLimits(snapshot.providerSessionLimits)
  const target = targetSnapshotConfigFile(snapshot, undefined, snapshot.configFiles?.[0] ?? null)
  return target?.limits && Object.keys(target.limits).length > 0 ? cloneProviderSessionLimits(target.limits) : undefined
}

export function cloneProviderSessionLimits(limits: AgentSettingsSnapshot['providerSessionLimits']): NonNullable<AgentSettingsSnapshot['providerSessionLimits']> | undefined {
  if (!limits) return undefined
  const cloned: NonNullable<AgentSettingsSnapshot['providerSessionLimits']> = {}
  for (const [key, value] of Object.entries(limits)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      ;(cloned as Record<string, number>)[key] = value
      continue
    }
    if (key === 'executionMode' && (value === 'compact' || value === 'standard' || value === 'deep')) {
      cloned.executionMode = value
      continue
    }
    if (key === 'allowForcedToolCalls' && typeof value === 'boolean') {
      cloned.allowForcedToolCalls = value
    }
  }
  return Object.keys(cloned).length > 0 ? cloned : undefined
}

export function buildSettingsSnapshotImpactItems(snapshot: AgentSettingsSnapshot): SettingsSnapshotImpactItem[] {
  return [
    snapshot.model
      ? {
        id: 'model',
        scope: 'local',
        labelKey: 'agents.settings.settingsSnapshotImpact.model',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.model',
        detailValues: { model: redactAgentTraceDebugText(snapshot.model.model) },
      }
      : {
        id: 'model',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.model',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.modelSkipped',
      },
    snapshot.activeConfigFileId || snapshot.configFiles?.length
      ? {
        id: 'configFile',
        scope: 'config',
        labelKey: 'agents.settings.settingsSnapshotImpact.configFile',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.configFile',
        detailValues: { configFileId: snapshot.activeConfigFileId ?? '-', count: snapshot.configFiles?.length ?? 0 },
      }
      : {
        id: 'configFile',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.configFile',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.configFileSkipped',
      },
    snapshotProviderSessionLimits(snapshot)
      ? {
        id: 'limits',
        scope: 'config',
        labelKey: 'agents.settings.settingsSnapshotImpact.limits',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.limits',
        detailValues: { count: Object.keys(snapshotProviderSessionLimits(snapshot)!).length },
      }
      : {
        id: 'limits',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.limits',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.limitsSkipped',
      },
    snapshot.skillConfig
      ? {
        id: 'skills',
        scope: 'config',
        labelKey: 'agents.settings.settingsSnapshotImpact.skills',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.skills',
        detailValues: { count: snapshot.skillConfig.length },
      }
      : {
        id: 'skills',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.skills',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.skillsSkipped',
      },
    snapshot.toolPermissionOverrides
      ? {
        id: 'tools',
        scope: 'local',
        labelKey: 'agents.settings.settingsSnapshotImpact.tools',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.tools',
        detailValues: { count: settingsSnapshotToolPermissionOverrideGrantCount(snapshot.toolPermissionOverrides) },
      }
      : {
        id: 'tools',
        scope: 'skipped',
        labelKey: 'agents.settings.settingsSnapshotImpact.tools',
        detailKey: 'agents.settings.settingsSnapshotImpactDetails.toolsSkipped',
      },
  ]
}

export function settingsSnapshotToolPermissionOverrideGrantCount(overrides: ConfigFileToolPermissionOverrides[] | undefined): number {
  return (overrides ?? []).reduce((sum, item) => sum + item.toolGrants.length, 0)
}

import {
  redactAgentTraceDebugText,
  type AgentSettingsSnapshot,
  type ConfigFileToolPermissionOverrides,
} from '@movscript/core/agent'
import type { ProviderCatalogConfigFile, ProviderCatalogInspectResponse } from '@/shared/infrastructure/providerSessionClient'
import { duplicateSnapshotConfigFile } from '@/features/agent/application/agentSettingsConfigFileManagement'
import {
  SETTINGS_SNAPSHOT_IMPORT_PRESETS,
  SETTINGS_SNAPSHOT_IMPORT_SCOPES,
  type SettingsSnapshotImpactItem,
  type SettingsSnapshotImportPresetId,
  type SettingsSnapshotImportScope,
} from '@/features/agent/application/agentSettingsConfigFileTypes'

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

import type { ProviderCatalogConfigFile } from '@movscript/agent-protocol'
import {
  CONFIG_FILE_APPROVAL_DEFAULT_KEYS,
  CONFIG_FILE_LIMIT_KEYS,
  type ConfigFileApprovalDefaultKey,
  type ConfigFileApprovalDefaultWorkspaceValue,
  type ConfigFileLimitKey,
} from '@/features/agent/application/agentSettingsConfigFileTypes'

export function emptyConfigFileLimitWorkspaces(): Record<ConfigFileLimitKey, string> {
  return Object.fromEntries(CONFIG_FILE_LIMIT_KEYS.map((key) => [key, ''])) as Record<ConfigFileLimitKey, string>
}

export function emptyConfigFileApprovalDefaultWorkspaces(): Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue> {
  return Object.fromEntries(CONFIG_FILE_APPROVAL_DEFAULT_KEYS.map((key) => [key, 'inherit'])) as Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue>
}

export function configFileLimitWorkspacesFromConfigFile(configFile: ProviderCatalogConfigFile | null): Record<ConfigFileLimitKey, string> {
  const workspaces = emptyConfigFileLimitWorkspaces()
  for (const key of CONFIG_FILE_LIMIT_KEYS) {
    const value = configFile?.limits?.[key]
    workspaces[key] = typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
  }
  return workspaces
}

export function normalizeConfigFileLimitWorkspaces(workspaces: Record<ConfigFileLimitKey, string>): NonNullable<ProviderCatalogConfigFile['limits']> {
  const limits: NonNullable<ProviderCatalogConfigFile['limits']> = {}
  for (const key of CONFIG_FILE_LIMIT_KEYS) {
    const raw = workspaces[key].trim()
    if (!raw) continue
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 0) limits[key] = Math.floor(value)
  }
  return limits
}

export function configFileLimitSignature(limits: ProviderCatalogConfigFile['limits']): string {
  return JSON.stringify(Object.fromEntries(CONFIG_FILE_LIMIT_KEYS.flatMap((key) => (
    typeof limits?.[key] === 'number' && Number.isFinite(limits[key]) ? [[key, Math.floor(limits[key])]] : []
  ))))
}

export function configFileApprovalDefaultWorkspacesFromConfigFile(configFile: ProviderCatalogConfigFile | null): Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue> {
  const workspaces = emptyConfigFileApprovalDefaultWorkspaces()
  for (const key of CONFIG_FILE_APPROVAL_DEFAULT_KEYS) {
    const value = configFile?.approvalDefaults?.[key]
    workspaces[key] = value === 'never' || value === 'on_write' || value === 'always' ? value : 'inherit'
  }
  return workspaces
}

export function normalizeConfigFileApprovalDefaultWorkspaces(
  workspaces: Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue>,
): NonNullable<ProviderCatalogConfigFile['approvalDefaults']> {
  const config: NonNullable<ProviderCatalogConfigFile['approvalDefaults']> = {}
  for (const key of CONFIG_FILE_APPROVAL_DEFAULT_KEYS) {
    const approval = workspaces[key]
    if (approval !== 'inherit') config[key] = approval
  }
  return config
}

export function configFileApprovalDefaultSignature(config: ProviderCatalogConfigFile['approvalDefaults']): string {
  return JSON.stringify(Object.fromEntries(CONFIG_FILE_APPROVAL_DEFAULT_KEYS.flatMap((key) => {
    const approval = config?.[key]
    return approval === 'never' || approval === 'on_write' || approval === 'always' ? [[key, approval]] : []
  })))
}

import type { ToolGrantWorkspace } from '@movscript/core/agent'
import type { ProviderCatalogConfigFile } from '@movscript/agent-protocol'
import {
  CONFIG_FILE_APPROVAL_DEFAULT_KEYS,
  CONFIG_FILE_LIMIT_KEYS,
  type AgentSettingsTranslate,
  type ConfigFileApprovalDefaultKey,
  type ConfigFileDiff,
  type ConfigFileDiffSection,
  type ConfigFileLimitKey,
  type ToolPermissionsDiffItem,
} from '@/features/agent/application/agentSettingsConfigFileTypes'

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

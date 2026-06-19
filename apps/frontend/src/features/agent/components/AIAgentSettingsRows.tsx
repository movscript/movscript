import { useTranslation } from 'react-i18next'
import { AgentSettingsSkillCard, AgentSettingsToolPermissionsRow } from '@/features/agent/components/AgentSettingsUi'
import { skillSourceLabel } from '@/features/agent/presentation/agentSettingsSkillModel'
import type { SkillConfigWorkspace, ToolGrantWorkspace } from '@movscript/core/agent'
import type { ProviderCatalogSkill, ProviderToolDescriptor } from '@movscript/core/agent/protocol'

export function SkillRow({
  skill,
  workspace,
  readOnly = false,
  onWorkspaceChange,
}: {
  skill: ProviderCatalogSkill
  workspace?: SkillConfigWorkspace
  readOnly?: boolean
  onWorkspaceChange: (id: string, enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const dependencyCount = skill.dependencies?.length ?? 0
  const conflictCount = skill.conflicts?.length ?? 0
  const isCore = skill.loadMode === 'core'
  return (
    <AgentSettingsSkillCard
      name={skill.name}
      idLabel={skill.id}
      description={skill.description}
      enabled={skill.enabled !== false}
      enabledLabel={t('agents.settings.skillStatus.enabled')}
      disabledLabel={t('agents.settings.skillStatus.disabled')}
      versionLabel={skill.version ? `v${skill.version}` : undefined}
      sourceLabel={skillSourceLabel(skill, t)}
      priorityLabel={typeof skill.priority === 'number' ? `p${skill.priority}` : undefined}
      workspaceEnabled={workspace?.enabled}
      workspaceDisabled={readOnly || isCore}
      workspaceLocked={readOnly || isCore}
      workspaceTitle={workspace ? (workspace.enabled ? t('agents.settings.skillStatus.enabled') : t('agents.settings.skillStatus.disabled')) : undefined}
      workspaceHelp={workspace ? (readOnly ? t('agents.settings.configFileReadonlyHelp') : isCore ? t('agents.settings.skillConfigCoreLocked') : t('agents.settings.skillConfigToggleHelp')) : undefined}
      onWorkspaceChange={workspace ? (checked) => onWorkspaceChange(skill.id, checked) : undefined}
      metaItems={skillMetaItems(skill, dependencyCount, conflictCount, t)}
    />
  )
}

export function ToolPermissionsRow({
  tool,
  workspace,
  configFileGranted,
  readOnly = false,
  onWorkspaceChange,
}: {
  tool: ProviderToolDescriptor
  workspace?: ToolGrantWorkspace
  configFileGranted: boolean
  readOnly?: boolean
  onWorkspaceChange: (name: string, patch: Partial<ToolGrantWorkspace>) => void
}) {
  const { t } = useTranslation()
  const canAllow = !readOnly && tool.available && configFileGranted
  return (
    <AgentSettingsToolPermissionsRow
      name={tool.name}
      sourceLabel={tool.source}
      permissionLabel={tool.permission ?? t('agents.settings.toolPermissionsValues.none')}
      riskLabel={tool.risk ?? t('agents.settings.toolPermissionsValues.unknown')}
      approvalStatusLabel={tool.approval}
      available={tool.available}
      availableLabel={t('agents.settings.toolPermissionsStatus.available')}
      blockedLabel={t('agents.settings.toolPermissionsStatus.blocked')}
      configFileGranted={configFileGranted}
      configFileGrantedLabel={t('agents.settings.toolPermissionsStatus.configFileGranted')}
      requiresApproval={tool.requiresApproval}
      description={tool.description}
      workspace={workspace && !readOnly ? { mode: workspace.mode, approval: workspace.approval ?? 'never', canAllow } : undefined}
      modeLabel={t('agents.settings.toolPermissionsFields.mode')}
      approvalLabel={t('agents.settings.toolPermissionsFields.approval')}
      allowLabel={t('agents.settings.toolPermissionsModes.allow')}
      denyLabel={t('agents.settings.toolPermissionsModes.deny')}
      approvalNeverLabel={t('agents.settings.toolPermissionsApprovals.never')}
      approvalOnWriteLabel={t('agents.settings.toolPermissionsApprovals.onWrite')}
      approvalAlwaysLabel={t('agents.settings.toolPermissionsApprovals.always')}
      allowDisabledHelp={t('agents.settings.toolPermissionsAllowDisabled')}
      onModeChange={(mode) => onWorkspaceChange(tool.name, { mode })}
      onApprovalChange={(approval) => onWorkspaceChange(tool.name, { approval })}
      metaItems={toolPermissionsMetaItems(tool, t)}
    />
  )
}

function skillMetaItems(
  skill: ProviderCatalogSkill,
  dependencyCount: number,
  conflictCount: number,
  t: (key: string) => string,
) {
  return [
    ...(dependencyCount > 0 ? [{ id: 'dependencies', label: `${t('agents.settings.skillFields.dependencies')}: ${dependencyCount}` }] : []),
    ...(conflictCount > 0 ? [{ id: 'conflicts', label: `${t('agents.settings.skillFields.conflicts')}: ${conflictCount}` }] : []),
    ...(skill.tags?.slice(0, 4).map((tag) => ({ id: `tag:${tag}`, label: tag })) ?? []),
  ]
}

function toolPermissionsMetaItems(
  tool: ProviderToolDescriptor,
  t: (key: string) => string,
) {
  const execution = tool.runtime?.execution ?? tool.execution
  return [
    {
      id: 'registered',
      label: `${t('agents.settings.toolPermissionsFields.registered')}: ${tool.registered ? t('agents.settings.toolPermissionsValues.yes') : t('agents.settings.toolPermissionsValues.no')}`,
    },
    {
      id: 'granted',
      label: `${t('agents.settings.toolPermissionsFields.granted')}: ${tool.granted ? t('agents.settings.toolPermissionsValues.yes') : t('agents.settings.toolPermissionsValues.no')}`,
    },
    ...(tool.runtime ? [{
      id: 'grantMode',
      label: `${t('agents.settings.toolPermissionsFields.grantMode')}: ${t(`agents.settings.toolPermissionsModes.${tool.runtime.grantMode === 'none' ? 'none' : tool.runtime.grantMode}`)}`,
    }] : []),
    ...(tool.runtime ? [{
      id: 'approvalReason',
      label: `${t('agents.settings.toolPermissionsFields.approvalReason')}: ${t(`agents.settings.toolApprovalReasons.${tool.runtime.approvalReason}`)}`,
    }] : []),
    ...(tool.projectScoped ? [{ id: 'projectScoped', label: t('agents.settings.toolPermissionsFields.projectScoped') }] : []),
    ...(execution?.readOnly ? [{ id: 'readOnly', label: t('agents.settings.toolPermissionsFields.readOnly') }] : []),
    ...(execution?.concurrencySafe ? [{ id: 'concurrencySafe', label: t('agents.settings.toolPermissionsFields.concurrencySafe') }] : []),
    ...(execution?.destructive ? [{ id: 'destructive', label: t('agents.settings.toolPermissionsFields.destructive'), tone: 'warning' as const }] : []),
    ...(execution?.interruptBehavior ? [{
      id: 'interruptBehavior',
      label: `${t('agents.settings.toolPermissionsFields.interruptBehavior')}: ${t(`agents.settings.toolInterruptBehaviors.${execution.interruptBehavior}`)}`,
    }] : []),
    ...(execution?.resultRefStrategy ? [{
      id: 'resultRefStrategy',
      label: `${t('agents.settings.toolPermissionsFields.resultRefStrategy')}: ${t(`agents.settings.toolResultRefStrategies.${execution.resultRefStrategy}`)}`,
    }] : []),
    ...(tool.unavailableReason ? [{ id: 'unavailableReason', label: tool.unavailableReason, tone: 'warning' as const }] : []),
    ...(tool.runtime?.reason ? [{ id: 'runtimeReason', label: `${t('agents.settings.toolPermissionsFields.runtimeReason')}: ${tool.runtime.reason}` }] : []),
  ]
}

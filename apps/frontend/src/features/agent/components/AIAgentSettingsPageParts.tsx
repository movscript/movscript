import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clipboard, Trash2 } from 'lucide-react'
import {
  AgentSettingsApiModeCapabilityMatrix,
  AgentSettingsAuditTrailPanel,
  AgentSettingsMigrationGuide,
  AgentSettingsSkillCard,
  AgentSettingsStack,
  AgentSettingsStatusPanel,
  AgentSettingsSwitchPlanPanel,
  AgentSettingsToolPermissionsDiffPanel,
  AgentSettingsToolPermissionsRow,
  agentSettingsApiModeBadgeRecipe,
  agentSettingsRecipe,
  agentSettingsStatusRecipe,
} from '@movscript/ui/business/agent'
import { AgentSettingsConfigFileDiffPanel } from '@/features/agent/components/AgentSettingsConfigFileUi'
import {
  redactAgentTraceDebugText,
  type ProviderModelAPIKind,
  type SkillConfigWorkspace,
  type ToolGrantWorkspace,
} from '@movscript/core/agent'
import {
  type ConfigFileDiff,
  type ConfigFileDiffSection,
  type ToolPermissionsDiffItem,
} from '@/features/agent/application/agentSettingsConfigFile'
import type { ApiModeSwitchPlanItem, ModelCompatibilityProbe } from '@/features/agent/application/agentSettingsReadiness'
import { skillSourceLabel } from '@/features/agent/presentation/agentSettingsSkillModel'
import type { AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'
import type {
  ProviderCatalogConfigFile,
  ProviderCatalogSkill,
  ProviderToolDescriptor,
} from '@/shared/infrastructure/providerSessionClient'
import { copyTextToClipboard, scheduleUiReset } from '@/shared/ui/browserActions'

const API_MODE_CAPABILITY_MATRIX: Record<ProviderModelAPIKind, { badge: 'recommended' | 'managed' | 'compatibility' | 'providerNative'; itemKeys: string[] }> = {
  openai_responses: {
    badge: 'recommended',
    itemKeys: ['agenticPrimitive', 'structuredOutputs', 'responseState', 'builtInTools'],
  },
  openai_chat_completions: {
    badge: 'managed',
    itemKeys: ['centralizedCredentials', 'backendRouting', 'backendAudit', 'functionCalling'],
  },
  anthropic_messages: {
    badge: 'providerNative',
    itemKeys: ['anthropicNative', 'toolUse', 'directCredential', 'separateModelFamily'],
  },
}

const API_MODE_MIGRATION_STEPS: Record<ProviderModelAPIKind, string[]> = {
  openai_responses: ['recommended', 'stateful', 'futureTools'],
  openai_chat_completions: ['centralize', 'verifyModel', 'switchResponses'],
  anthropic_messages: ['providerNative', 'compare', 'keepSeparate'],
}

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

export function ConfigFileDiffPanel({ diff }: { diff: ConfigFileDiff }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsConfigFileDiffPanel
      title={t('agents.settings.configFileDiffTitle')}
      sections={[
        configFileDiffSection('packs', t('agents.settings.configFileFields.packs'), diff.packs, t),
        configFileDiffSection('skills', t('agents.settings.configFileFields.skills'), diff.skills, t),
        configFileDiffSection('tools', t('agents.settings.configFileFields.tools'), diff.tools, t),
        configFileDiffSection('approvalDefaults', t('agents.settings.configFileFields.approvalDefaults'), diff.approvalDefaults, t),
        configFileDiffSection('limits', t('agents.settings.configFileLimitsLabel'), diff.limits, t),
      ]}
    />
  )
}

export function configFileListSummary(configFile: ProviderCatalogConfigFile, t: (key: string) => string) {
  return [
    `${t('agents.settings.configFileFields.packs')}: ${configFile.enabledPackIds.length}`,
    `${t('agents.settings.configFileFields.skills')}: ${configFile.skillIds.length}`,
    `${t('agents.settings.configFileFields.toolGrants')}: ${configFile.toolGrants.length}`,
  ].join(' / ')
}

export function SettingsAuditTrailPanel({ entries, onClear }: { entries: AgentSettingsAuditEntry[]; onClear: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function copyAuditSummary() {
    const lines = [
      t('agents.settings.settingsAuditSummaryTitle'),
      ...entries.slice(0, 25).map((entry, index) => (
        `${index + 1}. [${t(`agents.settings.auditTargets.${entry.target}`)} / ${formatSettingsAuditAction(t, entry.action)}] ${redactAgentTraceDebugText(entry.summary)} (${new Date(entry.createdAt).toLocaleString()})`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    scheduleUiReset(() => setCopied(false), 1500)
  }

  return (
    <AgentSettingsAuditTrailPanel
      entries={entries.map((entry) => ({
        id: entry.id,
        summary: redactAgentTraceDebugText(entry.summary),
        createdAtLabel: new Date(entry.createdAt).toLocaleString(),
        targetLabel: t(`agents.settings.auditTargets.${entry.target}`),
        actionLabel: formatSettingsAuditAction(t, entry.action),
        failed: entry.action.endsWith('_failed'),
      }))}
      emptyLabel={t('agents.settings.settingsAuditEmpty')}
      help={t('agents.settings.settingsAuditHelp')}
      copyLabel={t('agents.settings.copySettingsAudit')}
      copiedLabel={t('agents.settings.settingsAuditCopied')}
      copied={copied}
      clearLabel={t('agents.settings.clearSettingsAudit')}
      copyIcon={<Clipboard size={14} />}
      clearIcon={<Trash2 size={14} />}
      onCopy={() => void copyAuditSummary()}
      onClear={onClear}
    />
  )
}

export function ApiModeCapabilityMatrix({ apiKind, t }: { apiKind: ProviderModelAPIKind; t: (key: string) => string }) {
  const mode = API_MODE_CAPABILITY_MATRIX[apiKind] ?? API_MODE_CAPABILITY_MATRIX.openai_chat_completions
  return (
    <AgentSettingsApiModeCapabilityMatrix
      title={t('agents.settings.apiModeCapabilityPanel')}
      description={t('agents.settings.apiModeCapabilityHelp')}
      badgeLabel={t(`agents.settings.apiModeCapabilityBadges.${mode.badge}`)}
      badgeProps={agentSettingsApiModeBadgeRecipe(mode.badge)}
      items={mode.itemKeys.map((itemKey) => ({
        id: itemKey,
        label: t(`agents.settings.apiModeCapabilityItems.${itemKey}.label`),
        detail: t(`agents.settings.apiModeCapabilityItems.${itemKey}.detail`),
      }))}
    />
  )
}

export function ModelCompatibilityProbePanel({ probes }: { probes: ModelCompatibilityProbe[] }) {
  const { t } = useTranslation()
  return (
    <AgentSettingsStatusPanel
      testId="agent-settings-model-compatibility-probes"
      itemTestId="agent-settings-model-compatibility-probe"
      title={t('agents.settings.modelCompatibilityPanel')}
      description={t('agents.settings.modelCompatibilityHelp')}
      items={probes.map((probe) => ({
        id: probe.id,
        label: t(probe.labelKey),
        detail: t(probe.detailKey, probe.detailValues),
        statusProps: agentSettingsStatusRecipe(probe.status),
        statusLabel: t(`agents.settings.modelCompatibilityStatuses.${probe.status}`),
      }))}
    />
  )
}

export function ApiModeMigrationGuide({
  apiKind,
  onSwitchToResponses,
}: {
  apiKind: ProviderModelAPIKind
  onSwitchToResponses: () => void
}) {
  const { t } = useTranslation()
  const stepKeys = API_MODE_MIGRATION_STEPS[apiKind] ?? API_MODE_MIGRATION_STEPS.openai_chat_completions
  return (
    <AgentSettingsMigrationGuide
      apiKind={apiKind}
      title={t('agents.settings.apiModeMigrationGuide')}
      description={t(`agents.settings.apiModeMigration.${apiKind}.detail`)}
      switchLabel={apiKind === 'openai_chat_completions' ? t('agents.settings.switchToResponses') : undefined}
      onSwitch={apiKind === 'openai_chat_completions' ? onSwitchToResponses : undefined}
      steps={stepKeys.map((stepKey, index) => ({
        id: stepKey,
        eyebrow: t('agents.settings.apiModeMigrationStep', { index: index + 1 }),
        label: t(`agents.settings.apiModeMigrationSteps.${stepKey}`),
      }))}
    />
  )
}

export function ApiModeSwitchPlanPanel({ apiKind, items }: { apiKind: ProviderModelAPIKind; items: ApiModeSwitchPlanItem[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const actionCount = items.filter((item) => item.status === 'action').length
  const warningCount = items.filter((item) => item.status === 'warning').length
  async function copySwitchTaskGraph() {
    const lines = [
      t('agents.settings.apiModeSwitchPlanTitle'),
      t('agents.settings.apiModeSwitchPlanCopyContext', { apiKind }),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.modelCompatibilityStatuses.${item.status}`)}] ${t(item.labelKey)} - ${t(item.detailKey, item.detailValues)}`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    scheduleUiReset(() => setCopied(false), 1500)
  }

  return (
    <AgentSettingsSwitchPlanPanel
      title={t('agents.settings.apiModeSwitchPlanTitle')}
      description={t('agents.settings.apiModeSwitchPlanHelp', { actions: actionCount, warnings: warningCount })}
      copyLabel={t('agents.settings.copyApiModeSwitchTaskGraph')}
      copiedLabel={t('agents.settings.apiModeSwitchPlanCopied')}
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      onCopy={() => void copySwitchTaskGraph()}
      items={items.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        detail: t(item.detailKey, item.detailValues),
        statusProps: agentSettingsStatusRecipe(item.status),
        statusLabel: t(`agents.settings.modelCompatibilityStatuses.${item.status}`),
      }))}
    />
  )
}

export function ToolPermissionsDiffPreview({ items }: { items: ToolPermissionsDiffItem[] }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const added = items.filter((item) => item.change === 'added').length
  const removed = items.filter((item) => item.change === 'removed').length
  const changed = items.filter((item) => item.change === 'changed').length
  async function copyToolPermissionsDiffSummary() {
    const lines = [
      t('agents.settings.toolPermissionsDiffSummaryTitle'),
      t('agents.settings.toolPermissionsDiffSummary', { added, removed, changed }),
      ...items.map((item, index) => (
        `${index + 1}. [${t(`agents.settings.toolPermissionsDiffChangeTypes.${item.change}`)}] ${item.name}: ${formatToolPermissionsDiffValue(t, item.beforeMode, item.beforeApproval)} -> ${formatToolPermissionsDiffValue(t, item.afterMode, item.afterApproval)}`
      )),
    ]
    await copyRedactedSettingsLines(lines)
    setCopied(true)
    scheduleUiReset(() => setCopied(false), 1500)
  }

  if (items.length === 0) return null
  return (
    <AgentSettingsToolPermissionsDiffPanel
      title={t('agents.settings.toolPermissionsDiffPreview')}
      summary={t('agents.settings.toolPermissionsDiffSummary', { added, removed, changed })}
      copyLabel={t('agents.settings.copyToolPermissionsDiff')}
      copiedLabel={t('agents.settings.toolPermissionsDiffCopied')}
      copied={copied}
      copyIcon={<Clipboard size={14} />}
      onCopy={() => void copyToolPermissionsDiffSummary()}
      items={items.map((item) => ({
        id: `${item.change}:${item.name}`,
        name: item.name,
        beforeLabel: formatToolPermissionsDiffValue(t, item.beforeMode, item.beforeApproval),
        afterLabel: formatToolPermissionsDiffValue(t, item.afterMode, item.afterApproval),
        changeLabel: t(`agents.settings.toolPermissionsDiffChangeTypes.${item.change}`),
        statusProps: agentSettingsRecipe(item.change === 'removed' ? 'warning' : item.change === 'added' ? 'success' : 'neutral'),
      }))}
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

async function copyRedactedSettingsLines(lines: string[]) {
  await copyTextToClipboard(lines.map(redactAgentTraceDebugText).join('\n'))
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

function configFileDiffSection(
  id: string,
  label: string,
  section: ConfigFileDiffSection,
  t: (key: string) => string,
) {
  const lines = [
    ...(section.added.length > 0 ? [`${t('agents.settings.configFileDiffAdded')}: ${section.added.slice(0, 4).join(', ')}`] : []),
    ...(section.removed.length > 0 ? [`${t('agents.settings.configFileDiffRemoved')}: ${section.removed.slice(0, 4).join(', ')}`] : []),
    ...((section.changed?.length ?? 0) > 0 ? [`${t('agents.settings.configFileDiffChanged')}: ${section.changed!.slice(0, 4).join(', ')}`] : []),
  ]
  return {
    id,
    label,
    lines,
    emptyLabel: t('agents.settings.configFileDiffNoChange'),
  }
}

function formatSettingsAuditAction(t: ReturnType<typeof useTranslation>['t'], action: string): string {
  return t(`agents.settings.auditActions.${action}`, { defaultValue: action })
}

function formatToolPermissionsDiffValue(
  t: (key: string, values?: Record<string, unknown>) => string,
  mode?: ToolGrantWorkspace['mode'],
  approval?: ToolGrantWorkspace['approval'],
): string {
  if (!mode) return t('agents.settings.toolPermissionsDiffValues.none')
  const approvalKey = approval ?? 'never'
  return t('agents.settings.toolPermissionsDiffValues.grant', {
    mode: t(`agents.settings.toolPermissionsModes.${mode}`),
    approval: t(`agents.settings.toolPermissionsApprovals.${approvalKey === 'on_write' ? 'onWrite' : approvalKey}`),
  })
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

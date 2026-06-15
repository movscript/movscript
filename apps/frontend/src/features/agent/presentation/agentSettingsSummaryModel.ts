import { redactAgentTraceDebugText } from '@movscript/core/agent'
import type { SettingsActionItem, SettingsReadinessItem } from '@/features/agent/application/agentSettingsReadiness'
import type { AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'

type AgentSettingsTranslate = (key: string, values?: Record<string, unknown>) => string

export const SETTINGS_NAV_SECTIONS = [
  { id: 'agent-settings-config-files', labelKey: 'agents.settings.configFilesPanel', descriptionKey: 'agents.settings.sectionDescriptions.configFiles' },
  { id: 'agent-settings-installed-capabilities', labelKey: 'agents.settings.installedCapabilitiesPanel', descriptionKey: 'agents.settings.sectionDescriptions.installedCapabilities' },
  { id: 'agent-settings-skills', labelKey: 'agents.settings.skillsPanel', descriptionKey: 'agents.settings.sectionDescriptions.skills' },
  { id: 'agent-settings-tools', labelKey: 'agents.settings.toolPermissionsPanel', descriptionKey: 'agents.settings.sectionDescriptions.tools' },
  { id: 'agent-settings-model', labelKey: 'agents.settings.modelPanel', descriptionKey: 'agents.settings.sectionDescriptions.model' },
  { id: 'agent-settings-snapshot', labelKey: 'agents.settings.settingsSnapshotPanel', descriptionKey: 'agents.settings.sectionDescriptions.snapshot' },
] as const

export function settingsSectionLabelKey(sectionId: SettingsActionItem['targetSection']): string {
  return SETTINGS_NAV_SECTIONS.find((section) => section.id === sectionId)?.labelKey ?? 'agents.settings.title'
}

export function buildSettingsStatusSummaryLines(input: {
  t: AgentSettingsTranslate
  readinessItems: SettingsReadinessItem[]
  actionItems: SettingsActionItem[]
  auditTrail: AgentSettingsAuditEntry[]
}): string[] {
  const { t, readinessItems, actionItems, auditTrail } = input
  return [
    t('agents.settings.settingsStatusSummaryTitle'),
    '',
    t('agents.settings.settingsStatusSummaryReadiness'),
    ...readinessItems.map((item, index) => (
      `${index + 1}. [${t(`agents.settings.readinessStatuses.${item.status}`)}] ${t(item.labelKey)} - ${t(item.detailKey, item.detailValues)}`
    )),
    '',
    t('agents.settings.settingsStatusSummaryActionItems'),
    ...buildSettingsActionSummaryBodyLines({ t, actionItems }),
    '',
    t('agents.settings.settingsStatusSummaryAudit'),
    ...(auditTrail.length === 0
      ? [t('agents.settings.settingsAuditEmpty')]
      : auditTrail.slice(0, 5).map((entry, index) => (
        `${index + 1}. ${redactAgentTraceDebugText(entry.summary)} (${new Date(entry.createdAt).toLocaleString()})`
      ))),
  ]
}

export function buildSettingsActionSummaryLines(input: {
  t: AgentSettingsTranslate
  actionItems: SettingsActionItem[]
}): string[] {
  return [
    input.t('agents.settings.actionItemsSummaryTitle'),
    ...buildSettingsActionSummaryBodyLines(input),
  ]
}

function buildSettingsActionSummaryBodyLines(input: {
  t: AgentSettingsTranslate
  actionItems: SettingsActionItem[]
}): string[] {
  const { t, actionItems } = input
  if (actionItems.length === 0) return [t('agents.settings.actionItemsEmpty')]
  return actionItems.flatMap((item, index) => {
    const sectionLabelKey = settingsSectionLabelKey(item.targetSection)
    const parts = [
      `${index + 1}. [${t(`agents.settings.actionStatuses.${item.status}`)}] ${t(item.labelKey)} (${t(sectionLabelKey)}) - ${t(item.detailKey, item.detailValues)}`,
    ]
    if (item.reasons?.length) {
      parts.push(...item.reasons.map((reason) => `   - ${t(reason.labelKey, reason.values)}`))
    }
    if (item.quickFixLabelKey) {
      parts.push(`   ${t('agents.settings.actionItemsSummaryQuickFix', { quickFix: t(item.quickFixLabelKey) })}`)
    }
    if (item.persistHintKey) parts.push(`   ${t(item.persistHintKey)}`)
    return parts
  })
}

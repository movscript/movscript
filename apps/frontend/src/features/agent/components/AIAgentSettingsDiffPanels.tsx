import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clipboard } from 'lucide-react'
import {
  AgentSettingsToolPermissionsDiffPanel,
  agentSettingsRecipe,
} from '@/features/agent/components/AgentSettingsUi'
import { AgentSettingsConfigFileDiffPanel } from '@/features/agent/components/AgentSettingsConfigFileUi'
import { redactAgentTraceDebugText, type ToolGrantWorkspace } from '@movscript/core/agent'
import type {
  ConfigFileDiff,
  ConfigFileDiffSection,
  ToolPermissionsDiffItem,
} from '@/features/agent/application/agentSettingsConfigFile'
import type { ProviderCatalogConfigFile } from '@/shared/infrastructure/providerSessionClient'
import { copyTextToClipboard, scheduleUiReset } from '@/shared/ui/browserActions'

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

async function copyRedactedSettingsLines(lines: string[]) {
  await copyTextToClipboard(lines.map(redactAgentTraceDebugText).join('\n'))
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

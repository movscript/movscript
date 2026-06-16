import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clipboard } from 'lucide-react'
import {
  AgentSettingsApiModeCapabilityMatrix,
  AgentSettingsMigrationGuide,
  AgentSettingsStatusPanel,
  AgentSettingsSwitchPlanPanel,
  agentSettingsApiModeBadgeRecipe,
  agentSettingsStatusRecipe,
} from '@/features/agent/components/AgentSettingsUi'
import { redactAgentTraceDebugText, type ProviderModelAPIKind } from '@movscript/core/agent'
import type { ApiModeSwitchPlanItem, ModelCompatibilityProbe } from '@/features/agent/application/agentSettingsReadiness'
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

async function copyRedactedSettingsLines(lines: string[]) {
  await copyTextToClipboard(lines.map(redactAgentTraceDebugText).join('\n'))
}

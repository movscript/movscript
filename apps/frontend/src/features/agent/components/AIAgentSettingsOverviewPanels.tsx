import { useTranslation } from 'react-i18next'
import { Clipboard } from 'lucide-react'
import {
  AgentSettingsActionItemsPanel,
  AgentSettingsPanel,
  AgentSettingsReadinessPanel,
  agentSettingsStatusRecipe,
} from '@/features/agent/components/AgentSettingsUi'
import { SettingsAuditTrailPanel } from '@/features/agent/components/AIAgentSettingsPageParts'
import type {
  SettingsActionItem,
  SettingsActionQuickFix,
  SettingsReadinessItem,
} from '@/features/agent/application/agentSettingsReadiness'
import type { AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'

export function AIAgentSettingsOverviewPanels({
  readinessItems,
  actionItems,
  actionFeedback,
  statusCopied,
  actionItemsCopied,
  auditTrail,
  onCopyStatus,
  onCopyActionItems,
  onClearAuditTrail,
  onJumpToSection,
  onQuickFix,
}: {
  readinessItems: SettingsReadinessItem[]
  actionItems: SettingsActionItem[]
  actionFeedback: string | null
  statusCopied: boolean
  actionItemsCopied: boolean
  auditTrail: AgentSettingsAuditEntry[]
  onCopyStatus: () => void | Promise<void>
  onCopyActionItems: () => void | Promise<void>
  onClearAuditTrail: () => void
  onJumpToSection: (sectionId: SettingsActionItem['targetSection']) => void
  onQuickFix: (quickFix: SettingsActionQuickFix) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <AgentSettingsPanel>
        <AgentSettingsReadinessPanel
          items={readinessItems.map((item) => ({
            id: item.id,
            label: t(item.labelKey),
            detail: t(item.detailKey, item.detailValues),
            statusProps: agentSettingsStatusRecipe(item.status),
            statusLabel: t(`agents.settings.readinessStatuses.${item.status}`),
          }))}
          copied={statusCopied}
          copyLabel={t('agents.settings.copySettingsStatus')}
          copiedLabel={t('agents.settings.settingsStatusCopied')}
          copyIcon={<Clipboard size={14} />}
          onCopy={onCopyStatus}
        />
      </AgentSettingsPanel>
      <AgentSettingsPanel>
        <AgentSettingsActionItemsPanel
          items={actionItems.map((item) => ({
            id: item.id,
            label: t(item.labelKey),
            detail: t(item.detailKey, item.detailValues),
            statusProps: agentSettingsStatusRecipe(item.status),
            statusLabel: t(`agents.settings.actionStatuses.${item.status}`),
            reasons: item.reasons?.map((reason) => t(reason.labelKey, reason.values)),
            persistHint: item.persistHintKey ? t(item.persistHintKey) : undefined,
            jumpLabel: t('agents.settings.quickFixes.jumpToSection'),
            onJump: () => onJumpToSection(item.targetSection),
            quickFixLabel: item.quickFixLabelKey ? t(item.quickFixLabelKey) : undefined,
            onQuickFix: item.quickFix ? () => onQuickFix(item.quickFix!) : undefined,
          }))}
          feedback={actionFeedback}
          emptyLabel={t('agents.settings.actionItemsEmpty')}
          countLabel={t('agents.settings.actionItemsCountSummary', {
            actions: actionItems.filter((item) => item.status === 'action').length,
            warnings: actionItems.filter((item) => item.status === 'warning').length,
          })}
          copied={actionItemsCopied}
          copyLabel={t('agents.settings.copyActionItems')}
          copiedLabel={t('agents.settings.actionItemsCopied')}
          copyIcon={<Clipboard size={14} />}
          onCopy={onCopyActionItems}
        />
      </AgentSettingsPanel>
      <AgentSettingsPanel>
        <SettingsAuditTrailPanel entries={auditTrail} onClear={onClearAuditTrail} />
      </AgentSettingsPanel>
    </>
  )
}

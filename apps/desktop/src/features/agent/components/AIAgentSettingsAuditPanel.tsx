import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clipboard, Trash2 } from 'lucide-react'
import { AgentSettingsAuditTrailPanel } from '@/features/agent/components/AgentSettingsUi'
import { redactAgentTraceDebugText } from '@movscript/core/agent'
import type { AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'
import { copyTextToClipboard, scheduleUiReset } from '@/shared/ui/browserActions'

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

async function copyRedactedSettingsLines(lines: string[]) {
  await copyTextToClipboard(lines.map(redactAgentTraceDebugText).join('\n'))
}

function formatSettingsAuditAction(t: ReturnType<typeof useTranslation>['t'], action: string): string {
  return t(`agents.settings.auditActions.${action}`, { defaultValue: action })
}

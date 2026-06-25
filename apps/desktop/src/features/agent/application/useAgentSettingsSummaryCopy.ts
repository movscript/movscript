import { useState } from 'react'
import { redactAgentTraceDebugText } from '@movscript/core/agent'
import { copyTextToClipboard, scheduleUiReset } from '@/shared/ui/browserActions'
import type { AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'
import type { SettingsActionItem, SettingsReadinessItem } from '@/features/agent/application/agentSettingsReadiness'
import {
  buildSettingsActionSummaryLines,
  buildSettingsStatusSummaryLines,
} from '@/features/agent/presentation/agentSettingsSummaryModel'

type AgentSettingsTranslate = (key: string, values?: Record<string, unknown>) => string

export function useAgentSettingsSummaryCopy(input: {
  t: AgentSettingsTranslate
  readinessItems: SettingsReadinessItem[]
  actionItems: SettingsActionItem[]
  auditTrail: AgentSettingsAuditEntry[]
}) {
  const [statusCopied, setStatusCopied] = useState(false)
  const [actionItemsCopied, setActionItemsCopied] = useState(false)

  async function copySettingsStatusSummary() {
    const lines = buildSettingsStatusSummaryLines({
      t: input.t,
      readinessItems: input.readinessItems,
      actionItems: input.actionItems,
      auditTrail: input.auditTrail,
    })
    await copyRedactedSettingsLines(lines)
    setStatusCopied(true)
    scheduleUiReset(() => setStatusCopied(false), 1500)
  }

  async function copyActionItemsSummary() {
    const lines = buildSettingsActionSummaryLines({
      t: input.t,
      actionItems: input.actionItems,
    })
    await copyRedactedSettingsLines(lines)
    setActionItemsCopied(true)
    scheduleUiReset(() => setActionItemsCopied(false), 1500)
  }

  return {
    actionItemsCopied,
    copyActionItemsSummary,
    copySettingsStatusSummary,
    statusCopied,
  }
}

async function copyRedactedSettingsLines(lines: string[]) {
  await copyTextToClipboard(lines.map(redactAgentTraceDebugText).join('\n'))
}

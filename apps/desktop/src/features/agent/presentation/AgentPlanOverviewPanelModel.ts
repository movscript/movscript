import type { TFunction } from 'i18next'
import { inputTypeLabel } from '@/features/agent/domain/agentRunUi'
import { formatAgentCompactTimestamp, formatAgentDuration, formatAgentDurationMs } from '@/features/agent/domain/agentTimeFormat'

export function runInteractionInputTypeLabel(type: string, t: TFunction): string {
  switch (type) {
    case 'choice':
      return t('agents.chat.task.inputTypeChoice')
    case 'text':
      return t('agents.chat.task.inputTypeText')
    case 'confirmation':
      return t('agents.chat.task.inputTypeConfirmation')
    default:
      return inputTypeLabel(type)
  }
}

export function agentStepStatusLabel(status: string): string {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'in_progress') return '进行中'
  if (status === 'cancelled') return '已取消'
  if (status === 'pending') return '待处理'
  if (status === 'blocked') return '已阻塞'
  return `未知状态 (${status})`
}

export function agentStepTypeLabel(type: string): string {
  if (type === 'tool_call') return '工具调用'
  if (type === 'message') return '消息'
  return `未知步骤 (${type})`
}

export function formatAgentPlanDate(value: string | number, locale: string): string {
  return formatAgentCompactTimestamp(value, locale)
}

export function agentPlanDurationLabel(start: string | undefined, end: string | undefined): string {
  return formatAgentDuration(start, end)
}

export function formatAgentPlanDurationLabel(ms: number): string {
  return ms > 0 ? formatAgentDurationMs(ms) : ''
}

export function safeAgentPlanJSONStringify(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

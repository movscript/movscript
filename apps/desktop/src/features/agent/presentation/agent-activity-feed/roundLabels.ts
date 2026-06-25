import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import {
  modelEventUsage,
  type RunActivityRoundSnapshot,
} from '@/features/agent/domain/agentRunActivitySnapshot'
import type { AgentRunActivityRound as ConversationRunActivityRound } from '@/features/agent/domain/agentConversation'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type { AgentActivityRound } from './types'
import { formatDuration, formatTokenUsage } from './format'
import { compactLines, recordValue, stringValue, timestamp } from './values'

export function visibleActivityRoundLabel(round: AgentActivityRound, status: AgentActivityRound['status']): string {
  const telemetry = {
    ...(round.durationMs !== undefined ? { durationMs: round.durationMs } : {}),
    ...(round.usage ? { usage: round.usage } : {}),
  }
  if (round.source === 'final' || round.index === 999) {
    const details = compactLines([
      round.durationMs !== undefined ? formatDuration(round.durationMs) : undefined,
      round.usage ? formatTokenUsage(round.usage) : undefined,
    ]).join(' · ')
    const suffix = details ? `（${details}）` : ''
    if (status === 'failed') return `最终回复：记录失败${suffix}`
    return `最终回复：形成回复${suffix}`
  }
  const providerSessionSource = providerSessionRoundSource(round)
  if (providerSessionSource) {
    return providerSessionRoundLabel(round.label, providerSessionSource, status, telemetry)
  }
  if (round.index !== undefined) return roundLabel(round.index, status, telemetry)
  if (status === 'tool_calls') return '运行片段：调用工具'
  if (status === 'final') return '运行片段：形成回复'
  if (status === 'failed') return '运行片段：请求失败'
  return '运行片段：运行中'
}

export function activityRoundLabel(
  round: ConversationRunActivityRound,
  position: number,
  status: AgentActivityRound['status'],
  telemetry?: RunActivityRoundSnapshot,
  contentPreview?: string,
): string {
  if (round.source === 'final' || round.label === 'Final response' || round.index === 999) {
    const details = compactLines([
      telemetry?.durationMs !== undefined ? formatDuration(telemetry.durationMs) : undefined,
      telemetry?.usage ? formatTokenUsage(telemetry.usage) : undefined,
    ]).join(' · ')
    const suffix = details ? `（${details}）` : ''
    if (status === 'failed') return `最终回复：记录失败${suffix}`
    return `最终回复：形成回复${suffix}`
  }
  const providerSessionSource = providerSessionRoundSource(round)
  if (providerSessionSource) {
    return providerSessionRoundLabel(round.label, providerSessionSource, status, telemetry)
  }
  if (round.index !== undefined) return roundLabel(round.index, status, telemetry, contentPreview)
  const prefix = `运行片段 ${position + 1}`
  if (status === 'tool_calls') return `${prefix}：调用工具`
  if (status === 'final') return `${prefix}：形成回复`
  if (status === 'failed') return `${prefix}：请求失败`
  return `${prefix}：运行中`
}

function roundLabel(index: number, status: AgentActivityRound['status'], telemetry?: Pick<RunActivityRoundSnapshot, 'durationMs' | 'usage'>, contentPreview?: string) {
  const prefix = `第 ${index} 轮思考`
  const details = compactLines([
    telemetry?.durationMs !== undefined ? formatDuration(telemetry.durationMs) : undefined,
    telemetry?.usage ? formatTokenUsage(telemetry.usage) : undefined,
  ]).join(' · ')
  const suffix = details ? `（${details}）` : ''
  if (contentPreview) return `${prefix}：${contentPreview}${suffix}`
  if (status === 'tool_calls') return `${prefix}：决定调用工具${suffix}`
  if (status === 'final') return `${prefix}：形成回复${suffix}`
  if (status === 'failed') return `${prefix}：请求失败${suffix}`
  return `${prefix}：请求模型中${suffix}`
}

type ProviderSessionActivityRoundSource = Extract<NonNullable<ConversationRunActivityRound['source']>, 'setup' | 'runtime_rule'>

function providerSessionRoundSource(round: { label?: string; source?: ConversationRunActivityRound['source'] }): ProviderSessionActivityRoundSource | undefined {
  if (round.source === 'setup') return 'setup'
  if (round.source !== 'runtime_rule') return undefined
  return round.label !== undefined && !/^Model turn\b/i.test(round.label) ? 'runtime_rule' : undefined
}

function providerSessionRoundLabel(
  label: string | undefined,
  source: ProviderSessionActivityRoundSource,
  status: AgentActivityRound['status'],
  telemetry?: Pick<RunActivityRoundSnapshot, 'durationMs' | 'usage'>,
): string {
  const base = label === 'Setup'
    ? '运行准备'
    : label === ['Run', 'time command'].join('')
      ? 'Runtime 会话命令'
      : label?.trim() || (source === 'setup' ? '运行准备' : 'runtime session 规则')
  const details = compactLines([
    telemetry?.durationMs !== undefined ? formatDuration(telemetry.durationMs) : undefined,
    telemetry?.usage ? formatTokenUsage(telemetry.usage) : undefined,
  ]).join(' · ')
  const suffix = details ? `（${details}）` : ''
  if (status === 'tool_calls') return `${base}：调用工具${suffix}`
  if (status === 'final') return `${base}：完成${suffix}`
  if (status === 'failed') return `${base}：失败${suffix}`
  return `${base}：运行中${suffix}`
}

export function modelRoundContentPreview(activity: ChatRunActivity, roundIndex: number | undefined): string | undefined {
  if (roundIndex === undefined) return undefined
  const events = activity.events
    .filter((event) => event.kind === 'model_call' && event.roundIndex === roundIndex)
    .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt) || left.id.localeCompare(right.id))
  for (const event of [...events].reverse()) {
    const preview = stringValue(recordValue(event.data)?.contentPreview)?.trim()
    if (preview) return preview.length > 120 ? `${preview.slice(0, 120)}...` : preview
  }
  return undefined
}

export function latestStatusText(activity: ChatRunActivity): string | undefined {
  if (!isActiveActivityStatus(activity.status)) return undefined
  const latest = [...activity.events].reverse().find((event) => event.status === 'started' || event.status === 'info')
  if (!latest) return undefined
  if (latest.kind === 'model_call') {
    if (latest.title === 'Model round started') return '正在请求模型'
    if (latest.title === 'Model HTTP request sent') return '正在请求模型'
    if (latest.title === 'Assistant progress update') return '正在接收模型回复'
    if (latest.title === 'Model tool call delta') return '正在准备工具调用'
    if (latest.title === 'Model retry scheduled' || latest.title === 'Model HTTP retry scheduled') return '模型请求重试中'
  }
  if (latest.title === 'Prompt composed') return '正在整理上下文'
  if (latest.kind === 'tool_call' && latest.toolName) return `正在${agentToolNameLabel(latest.toolName)}`
  if (activity.status === 'queued') return '等待 agent 开始'
  if (activity.status === 'in_progress') return 'agent 正在运行'
  return undefined
}

function isActiveActivityStatus(status: string): boolean {
  return status === 'queued' || status === 'in_progress' || status === 'requires_action'
}

export function formatModelEventUsage(event: ChatRunActivityEvent): string | undefined {
  const usage = modelEventUsage(event)
  return usage ? formatTokenUsage(usage) : undefined
}

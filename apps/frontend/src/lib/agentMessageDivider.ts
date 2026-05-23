import type { ChatRunActivity } from '@/store/agentStore'

export function formatAgentDividerTime(date: string | number | Date | undefined, locale?: string) {
  const value = date ? new Date(date) : new Date()
  if (!Number.isFinite(value.getTime())) return ''
  return value.toLocaleTimeString(locale ?? dividerLocale(), { hour: '2-digit', minute: '2-digit' })
}

export function agentMessageDividerLabel(time: string, activity?: ChatRunActivity) {
  if (!activity || !isRunActivityTerminal(activity.status)) return time
  const metrics = runActivityMetrics(activity)
  const parts = runActivityDividerMetricParts(activity, metrics)
  return parts.length > 0 ? [time, ...parts].join(' · ') : time
}

function dividerLocale() {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-CN'
}

function isRunActivityTerminal(status: string) {
  return status === 'completed'
    || status === 'completed_with_warnings'
    || status === 'failed'
    || status === 'cancelled'
}

function runActivityMetrics(activity: ChatRunActivity) {
  const endedAt = activity.completedAt ?? activity.failedAt ?? activity.updatedAt
  const duration = formatRunDuration(activity.startedAt ?? activity.createdAt, endedAt)
  const modelCalls = countRunActivityModelCalls(activity)
  const toolCalls = activity.steps.filter((step) => step.type === 'tool_call').length
  const tokens = totalRunActivityTokens(activity)
  return {
    duration,
    modelCalls,
    toolCalls,
    tokens: tokens > 0 ? tokens.toLocaleString() : undefined,
  }
}

function runActivityDividerMetricParts(activity: ChatRunActivity, metrics: ReturnType<typeof runActivityMetrics>) {
  const hasModelCalls = metrics.modelCalls > 0
  const hasToolCalls = metrics.toolCalls > 0
  const hasInteractions = (activity.approvals?.length ?? 0) > 0 || (activity.inputs?.length ?? 0) > 0
  const hasProblem = Boolean(activity.error)
    || (activity.warnings?.length ?? 0) > 0
    || activity.status === 'failed'
    || activity.status === 'cancelled'
    || activity.status === 'completed_with_warnings'

  if (!hasModelCalls && !hasToolCalls && !hasInteractions && !hasProblem) return []

  const parts: string[] = []
  if (metrics.duration !== '--') parts.push(`耗时 ${metrics.duration}`)
  if (hasModelCalls) parts.push(`调用 ${metrics.modelCalls} 次`)
  if (hasToolCalls) parts.push(`工具 ${metrics.toolCalls} 次`)
  if (metrics.tokens) parts.push(`Token ${metrics.tokens}`)
  return parts
}

function countRunActivityModelCalls(activity: ChatRunActivity) {
  const responseRounds = new Set<number>()
  let fallbackResponses = 0
  for (const event of activity.events) {
    if (event.kind !== 'model_call' || event.title !== 'Model HTTP response received') continue
    if (event.roundIndex !== undefined) responseRounds.add(event.roundIndex)
    else fallbackResponses += 1
  }
  if (responseRounds.size || fallbackResponses) return responseRounds.size + fallbackResponses

  const telemetryRounds = new Set<number>()
  for (const event of activity.events) {
    if (event.kind === 'model_call' && event.roundIndex !== undefined) telemetryRounds.add(event.roundIndex)
  }
  if (telemetryRounds.size) return telemetryRounds.size

  return activity.events.some((event) => event.kind === 'model_call') ? 1 : 0
}

function formatRunDuration(start: string | undefined, end: string | undefined) {
  if (!start || !end) return '--'
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '--'
  const ms = endMs - startMs
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function totalRunActivityTokens(activity: ChatRunActivity) {
  return activity.events
    .filter((event) => event.kind === 'model_call' && (event.status === 'completed' || event.status === 'info'))
    .reduce((sum, event) => sum + tokenUsageFromValue(event.data), 0)
}

function tokenUsageFromValue(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  const record = value as Record<string, unknown>
  const total = numericField(record, ['total_tokens', 'totalTokens'])
  if (total !== undefined) return total
  const input = numericField(record, ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens'])
  const output = numericField(record, ['output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens'])
  const nested = tokenUsageFromValue(record.usage)
  return (input ?? 0) + (output ?? 0) + nested
}

function numericField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

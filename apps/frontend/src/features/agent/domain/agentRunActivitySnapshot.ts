import { compactRunActivity, liveTraceEventKey, mergeRunActivityEvents } from '@/features/agent/domain/agentRunActivity'
import { isRecord } from '@/shared/domain/jsonValue'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface RunActivitySnapshotInput {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
}

export interface RunActivitySnapshot {
  activity: ChatRunActivity
  rounds: RunActivityRoundSnapshot[]
  totals: RunActivityTotals
}

export interface RunActivityRoundSnapshot {
  index: number
  startedAt: string
  finishedAt?: string
  failed: boolean
  finished: boolean
  durationMs?: number
  usage?: RunActivityTokenUsage
}

export interface RunActivityTokenUsage {
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

export interface RunActivityTotals {
  modelCallCount: number
  toolCallCount: number
  durationMs?: number
  usage?: RunActivityTokenUsage
}

export function buildRunActivitySnapshot(input: RunActivitySnapshotInput): RunActivitySnapshot | undefined {
  const activity = normalizeRunActivity(input)
  if (!activity) return undefined
  const rounds = modelRoundSnapshots(activity)
  return {
    activity,
    rounds,
    totals: activityTotals(activity, rounds),
  }
}

function normalizeRunActivity(input: RunActivitySnapshotInput): ChatRunActivity | undefined {
  const base = input.activity ?? (input.run ? compactRunActivity(input.run) : activityFromEvents(input.events ?? []))
  if (!base) return undefined
  const normalizedBase: ChatRunActivity = {
    ...base,
    approvals: base.approvals ?? [],
    inputs: base.inputs ?? [],
    steps: base.steps ?? [],
    events: normalizeEvents(base.events ?? []),
  }
  if (!input.events?.length || base.events === input.events) return normalizedBase
  const scopedEvents = input.events.filter((event) => activityEventBelongsToRun(event, normalizedBase.runId))
  if (scopedEvents.length === 0) return normalizedBase
  const merged = mergeRunActivityEvents(normalizedBase, scopedEvents, { runtimeLimit: Number.POSITIVE_INFINITY })
  return { ...merged, events: normalizeEvents(merged.events) }
}

function activityEventBelongsToRun(event: ChatRunActivityEvent, runId: string): boolean {
  const eventRunId = typeof event.runId === 'string' && event.runId.trim() ? event.runId.trim() : undefined
  return !eventRunId || eventRunId === runId
}

function activityFromEvents(events: ChatRunActivityEvent[]): ChatRunActivity | undefined {
  if (events.length === 0) return undefined
  const sorted = [...events].sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt))
  const first = sorted[0]
  const last = sorted[sorted.length - 1] ?? first
  const failed = sorted.some((event) => event.status === 'failed' || event.status === 'blocked')
  const running = sorted.some((event) => event.status === 'started' || event.status === 'info')
  return {
    runId: 'pending',
    threadId: 'pending',
    status: failed ? 'failed' : running ? 'in_progress' : 'completed',
    createdAt: first.createdAt,
    updatedAt: last.completedAt ?? last.createdAt,
    steps: [],
    events: sorted,
  }
}

function normalizeEvents(events: ChatRunActivityEvent[]): ChatRunActivityEvent[] {
  const byKey = new Map<string, ChatRunActivityEvent>()
  for (const event of events) byKey.set(liveTraceEventKey(event), event)
  return [...byKey.values()].sort((left, right) => {
    const byTime = timestamp(left.createdAt) - timestamp(right.createdAt)
    if (byTime !== 0) return byTime
    return left.id.localeCompare(right.id)
  })
}

function modelRoundSnapshots(activity: ChatRunActivity): RunActivityRoundSnapshot[] {
  const rounds = new Map<number, RunActivityRoundSnapshot>()
  for (const event of activity.events) {
    if (event.kind !== 'model_call' || event.roundIndex === undefined || !isModelRoundTelemetryEvent(event)) continue
    const current = rounds.get(event.roundIndex)
    const startedAt = current?.startedAt && timestamp(current.startedAt) <= timestamp(event.createdAt)
      ? current.startedAt
      : event.createdAt
    const failed = !!current?.failed || event.status === 'failed'
    const isFinished = (event.title === 'Model round completed' || event.title === 'Model HTTP response received') && event.status === 'completed'
    const finishedAt = isFinished
      ? event.completedAt ?? event.createdAt
      : current?.finishedAt
    const durationMs = maxNumber(current?.durationMs, modelEventDurationMs(event))
    const usage = mergeUsage(current?.usage, modelEventUsage(event))
    rounds.set(event.roundIndex, {
      index: event.roundIndex,
      startedAt,
      ...(finishedAt ? { finishedAt } : {}),
      failed,
      finished: !!current?.finished || isFinished,
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(usage ? { usage } : {}),
    })
  }
  return [...rounds.values()].sort((left, right) => left.index - right.index)
}

function isModelRoundTelemetryEvent(event: ChatRunActivityEvent): boolean {
  return event.title === 'Model round started'
    || event.title === 'Model round completed'
    || event.title === 'Model HTTP request sent'
    || event.title === 'Model HTTP response received'
    || event.title === 'Model HTTP call failed'
    || event.title === 'Model retry scheduled'
}

function activityTotals(activity: ChatRunActivity, rounds: RunActivityRoundSnapshot[]): RunActivityTotals {
  const modelCallCount = countModelCalls(activity.events)
  const toolCallCount = activity.steps.filter((step) => step.type === 'tool_call').length
    + activity.events.filter((event) => event.kind === 'tool_call' && !event.stepId && event.title !== 'Model tool call delta').length
  const durationMs = runDurationMs(activity) ?? sumRoundDurations(rounds)
  const usage = sumRoundUsage(rounds)
  return {
    modelCallCount,
    toolCallCount,
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(usage ? { usage } : {}),
  }
}

function countModelCalls(events: ChatRunActivityEvent[]): number {
  const responseRounds = new Set<number>()
  let fallbackResponses = 0
  for (const event of events) {
    if (event.kind !== 'model_call' || event.title !== 'Model HTTP response received') continue
    if (event.roundIndex !== undefined) responseRounds.add(event.roundIndex)
    else fallbackResponses += 1
  }
  if (responseRounds.size || fallbackResponses) return responseRounds.size + fallbackResponses
  return new Set(events
    .filter((event) => event.kind === 'model_call' && event.roundIndex !== undefined)
    .map((event) => event.roundIndex)).size
}

function runDurationMs(activity: ChatRunActivity): number | undefined {
  const start = timestamp(activity.startedAt ?? activity.createdAt)
  const end = timestamp(activity.completedAt ?? activity.failedAt ?? activity.updatedAt)
  if (!start || !end || end < start) return undefined
  return end - start
}

function sumRoundDurations(rounds: RunActivityRoundSnapshot[]): number | undefined {
  let total = 0
  let found = false
  for (const round of rounds) {
    if (round.durationMs === undefined) continue
    total += round.durationMs
    found = true
  }
  return found ? total : undefined
}

function sumRoundUsage(rounds: RunActivityRoundSnapshot[]): RunActivityTokenUsage | undefined {
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let cachedInputTokens = 0
  let reasoningTokens = 0
  let hasInput = false
  let hasOutput = false
  let hasTotal = false
  let hasCachedInput = false
  let hasReasoning = false
  for (const round of rounds) {
    if (round.usage?.inputTokens !== undefined) {
      inputTokens += round.usage.inputTokens
      hasInput = true
    }
    if (round.usage?.outputTokens !== undefined) {
      outputTokens += round.usage.outputTokens
      hasOutput = true
    }
    if (round.usage?.totalTokens !== undefined) {
      totalTokens += round.usage.totalTokens
      hasTotal = true
    }
    if (round.usage?.cachedInputTokens !== undefined) {
      cachedInputTokens += round.usage.cachedInputTokens
      hasCachedInput = true
    }
    if (round.usage?.reasoningTokens !== undefined) {
      reasoningTokens += round.usage.reasoningTokens
      hasReasoning = true
    }
  }
  if (!hasInput && !hasOutput && !hasTotal && !hasCachedInput && !hasReasoning) return undefined
  return {
    ...(hasInput ? { inputTokens } : {}),
    ...(hasOutput ? { outputTokens } : {}),
    ...(hasCachedInput ? { cachedInputTokens } : {}),
    ...(hasReasoning ? { reasoningTokens } : {}),
    ...(hasTotal ? { totalTokens } : {}),
  }
}

function modelEventDurationMs(event: ChatRunActivityEvent): number | undefined {
  if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs) && event.durationMs >= 0) return event.durationMs
  const data = recordValue(event.data)
  const durationMs = numberValue(data?.durationMs) ?? numberValue(data?.latencyMs)
  return durationMs !== undefined && durationMs >= 0 ? durationMs : undefined
}

function modelEventUsage(event: ChatRunActivityEvent): RunActivityTokenUsage | undefined {
  const data = recordValue(event.data)
  const response = recordValue(data?.response)
  const parsedBody = recordValue(response?.parsedBody)
  const usage = recordValue(data?.usage) ?? recordValue(parsedBody?.usage)
  if (!usage) return undefined
  const inputTokens = numberValue(usage.input_tokens) ?? numberValue(usage.prompt_tokens)
  const outputTokens = numberValue(usage.output_tokens) ?? numberValue(usage.completion_tokens)
  const inputDetails = recordValue(usage.input_tokens_details) ?? recordValue(usage.prompt_tokens_details)
  const outputDetails = recordValue(usage.output_tokens_details) ?? recordValue(usage.completion_tokens_details)
  const cachedInputTokens = numberValue(usage.cached_input_tokens)
    ?? numberValue(usage.cache_read_input_tokens)
    ?? numberValue(inputDetails?.cached_tokens)
  const reasoningTokens = numberValue(usage.reasoning_tokens)
    ?? numberValue(outputDetails?.reasoning_tokens)
  const totalTokens = numberValue(usage.total_tokens) ?? sumNumbers(inputTokens, outputTokens)
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined && cachedInputTokens === undefined && reasoningTokens === undefined) return undefined
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  }
}

function mergeUsage(current: RunActivityTokenUsage | undefined, next: RunActivityTokenUsage | undefined): RunActivityTokenUsage | undefined {
  if (!current) return next
  if (!next) return current
  return {
    inputTokens: next.inputTokens ?? current.inputTokens,
    outputTokens: next.outputTokens ?? current.outputTokens,
    cachedInputTokens: next.cachedInputTokens ?? current.cachedInputTokens,
    reasoningTokens: next.reasoningTokens ?? current.reasoningTokens,
    totalTokens: next.totalTokens ?? current.totalTokens,
  }
}

function maxNumber(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function sumNumbers(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) return undefined
  return (left ?? 0) + (right ?? 0)
}

function timestamp(value: string | undefined) {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

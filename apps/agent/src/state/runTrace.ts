import type { AgentRun, AgentRunStep, AgentTraceEvent, AgentTraceEventKind, JSONValue } from './types.js'
import type { AgentRunRoundInfo } from './runRound.js'

const MAX_TRACE_DATA_DEPTH = 20
const MAX_TRACE_ARRAY_ITEMS = 200
const MAX_TRACE_OBJECT_KEYS = 200
const MAX_TRACE_STRING_CHARS = 200_000

export interface BuildRunStepInput {
  id: string
  runId: string
  type: AgentRunStep['type']
  createdAt: string
  round?: AgentRunRoundInfo
  toolName?: string
}

export function buildRunStep(input: BuildRunStepInput): AgentRunStep {
  return {
    id: input.id,
    runId: input.runId,
    type: input.type,
    status: 'in_progress',
    ...(input.round ? {
      roundId: input.round.roundId,
      roundIndex: input.round.roundIndex,
      roundLabel: input.round.roundLabel,
      roundSource: input.round.roundSource,
    } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    createdAt: input.createdAt,
  }
}

export function appendRunStep(input: BuildRunStepInput & { run: AgentRun }): AgentRunStep {
  const step = buildRunStep(input)
  input.run.steps.push(step)
  input.run.updatedAt = step.createdAt
  return step
}

export interface CompleteRunStepInput {
  completedAt: string
  status?: AgentRunStep['status']
  result?: JSONValue
  error?: string
  errorData?: JSONValue
  sandboxed?: boolean
  durationMs?: number
}

export function completeRunStep(step: AgentRunStep, input: CompleteRunStepInput): AgentRunStep {
  step.status = input.status ?? (input.error ? 'failed' : 'completed')
  if (Object.prototype.hasOwnProperty.call(input, 'result')) step.result = input.result
  if (input.error) step.error = input.error
  if (input.errorData !== undefined) step.errorData = input.errorData
  if (input.sandboxed) step.sandboxed = input.sandboxed
  step.completedAt = input.completedAt
  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)) step.durationMs = input.durationMs
  return step
}

export interface AppendTraceEventInput {
  id: string
  run: AgentRun
  now: string
  kind: AgentTraceEventKind
  title: string
  status: AgentTraceEvent['status']
  summary?: string
  round?: AgentRunRoundInfo
  agentId?: string
  parentAgentId?: string
  stepId?: string
  toolName?: string
  data?: unknown
  durationMs?: number
  completedAt?: string
}

export function appendTraceEvent(input: AppendTraceEventInput): AgentTraceEvent {
  const event: AgentTraceEvent = {
    id: input.id,
    runId: input.run.id,
    kind: input.kind,
    title: input.title,
    status: input.status,
    createdAt: input.now,
    ...(input.round ? {
      roundId: input.round.roundId,
      roundIndex: input.round.roundIndex,
      roundLabel: input.round.roundLabel,
      roundSource: input.round.roundSource,
    } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.parentAgentId ? { parentAgentId: input.parentAgentId } : {}),
    ...(input.stepId ? { stepId: input.stepId } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.data !== undefined ? { data: toJSONValue(input.data) } : {}),
    ...(typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) ? { durationMs: input.durationMs } : {}),
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
  }
  input.run.updatedAt = event.completedAt ?? event.createdAt
  return event
}

export function normalizeTracePageLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 200
  return Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(1, Math.floor(value)))
}

export interface BuildRunTracePageInput {
  runId: string
  eventsPlusOne: AgentTraceEvent[]
  limit: number
  total: number
}

export interface AgentRunTracePage {
  runId: string
  events: AgentTraceEvent[]
  total: number
  hasMore: boolean
  nextCursor?: string
}

export interface AgentRunTraceSummary {
  runId: string
  total: number
  byKind: Partial<Record<AgentTraceEventKind, number>>
  latestEvent?: AgentTraceEvent
}

export function buildRunTracePage(input: BuildRunTracePageInput): AgentRunTracePage {
  const events = input.eventsPlusOne.slice(0, input.limit)
  const hasMore = input.eventsPlusOne.length > input.limit
  const nextCursor = hasMore ? events.at(-1)?.id : undefined
  return {
    runId: input.runId,
    events,
    total: input.total,
    hasMore,
    ...(nextCursor ? { nextCursor } : {}),
  }
}

function toJSONValue(value: unknown): JSONValue {
  return toBoundedJSONValue(value, { depth: 0, ancestors: new WeakSet<object>() })
}

function toBoundedJSONValue(value: unknown, state: { depth: number; ancestors: WeakSet<object> }): JSONValue {
  if (value === undefined) return null
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.length > MAX_TRACE_STRING_CHARS
    ? `${value.slice(0, MAX_TRACE_STRING_CHARS)}... [truncated ${value.length - MAX_TRACE_STRING_CHARS} chars]`
    : value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (state.depth >= MAX_TRACE_DATA_DEPTH) return '[Trace data truncated: max depth exceeded]'
  if (Array.isArray(value)) {
    if (state.ancestors.has(value)) return '[Circular]'
    state.ancestors.add(value)
    const items = value.slice(0, MAX_TRACE_ARRAY_ITEMS).map((item) => toBoundedJSONValue(item, { depth: state.depth + 1, ancestors: state.ancestors }))
    state.ancestors.delete(value)
    return value.length > MAX_TRACE_ARRAY_ITEMS
      ? [...items, `[Trace data truncated: ${value.length - MAX_TRACE_ARRAY_ITEMS} more items]`]
      : items
  }
  if (!isRecord(value)) return String(value)
  if (state.ancestors.has(value)) return '[Circular]'
  state.ancestors.add(value)
  const out: Record<string, JSONValue> = {}
  const entries = Object.entries(value)
  for (const [key, item] of entries.slice(0, MAX_TRACE_OBJECT_KEYS)) {
    if (item === undefined) continue
    out[key] = toBoundedJSONValue(item, { depth: state.depth + 1, ancestors: state.ancestors })
  }
  if (entries.length > MAX_TRACE_OBJECT_KEYS) out.__truncatedKeys = entries.length - MAX_TRACE_OBJECT_KEYS
  state.ancestors.delete(value)
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

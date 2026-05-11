import type { AgentRun, AgentRunStep, AgentTraceEvent, AgentTraceEventKind, JSONValue } from './types.js'
import type { AgentRunRoundInfo } from '../context/normalizeRunInput.js'

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

function toJSONValue(value: unknown): JSONValue {
  if (value === undefined) return null
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value as JSONValue
  if (Array.isArray(value)) return value.map(toJSONValue)
  if (!isRecord(value)) return String(value)
  const out: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    out[key] = toJSONValue(item)
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

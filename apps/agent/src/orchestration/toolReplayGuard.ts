import { createHash } from 'node:crypto'
import { isRecord } from '../jsonValue.js'
import type { AgentRun, AgentRunStep, JSONValue, ToolCall } from '../state/types.js'
import { normalizeToolExecutionMetadata, type ToolRegistry } from '../tools/toolRegistry.js'

export interface ReplayableToolStep {
  step: AgentRunStep
  argsHash: string
}

export function findReplayableToolStep(input: {
  run: AgentRun
  call: ToolCall
  registry: ToolRegistry
}): ReplayableToolStep | undefined {
  if (!isRecoveryResumedRun(input.run)) return undefined
  if (!isReplayGuardedTool(input.call, input.registry)) return undefined

  const args = normalizeToolArgs(input.call)
  const argsHash = stableHash(args)
  const resumedAt = recoveryResumedAt(input.run)
  return input.run.steps
    .filter((step) => isReplayCandidateStep(step, input.call.name, args, argsHash, resumedAt))
    .sort((left, right) => (right.completedAt ?? right.createdAt).localeCompare(left.completedAt ?? left.createdAt))
    .map((step) => ({ step, argsHash }))
    .at(0)
}

export function toolReplayGuardData(input: {
  replay: ReplayableToolStep
  call: ToolCall
}): Record<string, JSONValue> {
  return {
    eventType: 'tool.call.replay_guard_reused',
    reusedStepId: input.replay.step.id,
    toolName: input.call.name,
    argsHash: input.replay.argsHash,
    originalCompletedAt: input.replay.step.completedAt ?? input.replay.step.createdAt,
  }
}

function isReplayGuardedTool(call: ToolCall, registry: ToolRegistry): boolean {
  const tool = registry.get(call.name)
  if (!tool) return false
  const execution = tool.execution ?? normalizeToolExecutionMetadata(undefined, tool.risk)
  return !execution.readOnly
}

function isRecoveryResumedRun(run: AgentRun): boolean {
  const recovery = isRecord(run.metadata?.recovery) ? run.metadata.recovery : undefined
  return recovery?.state === 'resumed' && typeof recovery.resumedAt === 'string'
}

function recoveryResumedAt(run: AgentRun): string {
  const recovery = isRecord(run.metadata?.recovery) ? run.metadata.recovery : undefined
  return typeof recovery?.resumedAt === 'string' ? recovery.resumedAt : ''
}

function isReplayCandidateStep(
  step: AgentRunStep,
  toolName: string,
  args: Record<string, JSONValue>,
  argsHash: string,
  resumedAt: string,
): boolean {
  if (step.type !== 'tool_call') return false
  if (step.status !== 'completed') return false
  if (step.toolName !== toolName) return false
  if (!Object.prototype.hasOwnProperty.call(step, 'result')) return false
  const completedAt = step.completedAt ?? step.createdAt
  if (resumedAt && completedAt > resumedAt) return false
  return stableHash(step.args ?? {}) === argsHash && stableHash(args) === argsHash
}

function normalizeToolArgs(call: ToolCall): Record<string, JSONValue> {
  return call.args ?? call.arguments ?? {}
}

function stableHash(value: JSONValue): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableJSON(value))).digest('hex')}`
}

function stableJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJSON)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJSON(item)]),
  )
}

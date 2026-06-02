import type { AgentRunExecutionConfig, AgentRuntimeLimits } from '../../../shared/types.js'
import { isRecord } from '../../../../shared/json/jsonValue.js'

export interface DefaultRuntimeLimitsInput {
  approvalMode?: AgentRuntimeLimits['approvalMode']
  sandboxMode?: boolean
  maxToolCalls?: number
  maxIterations?: number
  execution?: AgentRunExecutionConfig
  override?: unknown
}

export function defaultRuntimeLimits(input: DefaultRuntimeLimitsInput = {}): AgentRuntimeLimits {
  const override = normalizeRuntimeLimitsOverride(input.override)
  const sandboxMode = override.sandboxMode ?? input.sandboxMode ?? false
  return {
    approvalMode: override.approvalMode ?? input.approvalMode ?? 'interactive',
    ...(sandboxMode ? { sandboxMode: true } : {}),
    maxToolCalls: override.maxToolCalls ?? normalizeRuntimeLimit(input.maxToolCalls) ?? 20,
    maxIterations: override.maxIterations ?? normalizeRuntimeLimit(input.maxIterations) ?? 20,
    allowNetwork: false,
    allowFileBytes: false,
    execution: override.execution ?? input.execution ?? { mode: 'standard', includeMemories: true, allowForcedToolCalls: true },
  }
}

export function normalizeRuntimeLimitsOverride(value: unknown): Partial<Pick<AgentRuntimeLimits, 'approvalMode' | 'sandboxMode' | 'maxToolCalls' | 'maxIterations' | 'execution'>> {
  if (!isRecord(value)) return {}
  const record = value
  const execution = normalizeExecutionConfig(record.execution)
  return {
    ...(isRunApprovalMode(record.approvalMode) ? { approvalMode: record.approvalMode } : {}),
    ...(typeof record.sandboxMode === 'boolean' ? { sandboxMode: record.sandboxMode } : {}),
    ...(isPositiveFiniteNumber(record.maxToolCalls) ? { maxToolCalls: clampRuntimeLimit(record.maxToolCalls) } : {}),
    ...(isPositiveFiniteNumber(record.maxIterations) ? { maxIterations: clampRuntimeLimit(record.maxIterations) } : {}),
    ...(execution ? { execution } : {}),
  }
}

function isRunApprovalMode(value: unknown): value is AgentRuntimeLimits['approvalMode'] {
  return value === 'interactive' || value === 'auto_readonly' || value === 'auto'
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function clampRuntimeLimit(value: number): number {
  return Math.max(1, Math.min(200, Math.floor(value)))
}

function normalizeRuntimeLimit(value: unknown): number | undefined {
  return isPositiveFiniteNumber(value) ? clampRuntimeLimit(value) : undefined
}

function normalizeExecutionConfig(value: unknown): AgentRuntimeLimits['execution'] | undefined {
  if (!isRecord(value)) return undefined
  const mode = value.mode === 'compact' || value.mode === 'deep' ? value.mode : value.mode === 'standard' ? 'standard' : undefined
  if (!mode) return undefined
  return {
    mode,
    ...(typeof value.includeMemories === 'boolean' ? { includeMemories: value.includeMemories } : {}),
    ...(typeof value.allowForcedToolCalls === 'boolean' ? { allowForcedToolCalls: value.allowForcedToolCalls } : {}),
  }
}

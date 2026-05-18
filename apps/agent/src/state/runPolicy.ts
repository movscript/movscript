import type { AgentRunPolicy, AgentWorkflowConfig } from './types.js'
import { isRecord } from '../jsonValue.js'

export interface DefaultRunPolicyInput {
  approvalMode?: AgentRunPolicy['approvalMode']
  sandboxMode?: boolean
  workflow?: AgentWorkflowConfig
  policy?: unknown
}

export function defaultRunPolicy(input: DefaultRunPolicyInput = {}): AgentRunPolicy {
  const override = normalizeRunPolicyOverride(input.policy)
  return {
    approvalMode: override.approvalMode ?? input.approvalMode ?? 'interactive',
    ...(input.sandboxMode ? { sandboxMode: true } : {}),
    maxToolCalls: override.maxToolCalls ?? 20,
    maxIterations: override.maxIterations ?? 20,
    allowNetwork: false,
    allowFileBytes: false,
    workflow: input.workflow ?? { profile: 'standard', includeMemories: true, allowForcedToolCalls: true },
  }
}

export function normalizeRunPolicyOverride(value: unknown): Partial<Pick<AgentRunPolicy, 'approvalMode' | 'maxToolCalls' | 'maxIterations'>> {
  if (!isRecord(value)) return {}
  const record = value
  return {
    ...(isRunApprovalMode(record.approvalMode) ? { approvalMode: record.approvalMode } : {}),
    ...(isPositiveFiniteNumber(record.maxToolCalls) ? { maxToolCalls: clampPolicyLimit(record.maxToolCalls) } : {}),
    ...(isPositiveFiniteNumber(record.maxIterations) ? { maxIterations: clampPolicyLimit(record.maxIterations) } : {}),
  }
}

function isRunApprovalMode(value: unknown): value is AgentRunPolicy['approvalMode'] {
  return value === 'interactive' || value === 'auto_readonly' || value === 'auto'
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function clampPolicyLimit(value: number): number {
  return Math.max(1, Math.min(200, Math.floor(value)))
}

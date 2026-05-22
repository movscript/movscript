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
  const sandboxMode = override.sandboxMode ?? input.sandboxMode ?? false
  return {
    approvalMode: override.approvalMode ?? input.approvalMode ?? 'interactive',
    ...(sandboxMode ? { sandboxMode: true } : {}),
    maxToolCalls: override.maxToolCalls ?? 20,
    maxIterations: override.maxIterations ?? 20,
    allowNetwork: false,
    allowFileBytes: false,
    workflow: override.workflow ?? input.workflow ?? { profile: 'standard', includeMemories: true, allowForcedToolCalls: true },
  }
}

export function normalizeRunPolicyOverride(value: unknown): Partial<Pick<AgentRunPolicy, 'approvalMode' | 'sandboxMode' | 'maxToolCalls' | 'maxIterations' | 'workflow'>> {
  if (!isRecord(value)) return {}
  const record = value
  const workflow = normalizeWorkflowConfig(record.workflow)
  return {
    ...(isRunApprovalMode(record.approvalMode) ? { approvalMode: record.approvalMode } : {}),
    ...(typeof record.sandboxMode === 'boolean' ? { sandboxMode: record.sandboxMode } : {}),
    ...(isPositiveFiniteNumber(record.maxToolCalls) ? { maxToolCalls: clampPolicyLimit(record.maxToolCalls) } : {}),
    ...(isPositiveFiniteNumber(record.maxIterations) ? { maxIterations: clampPolicyLimit(record.maxIterations) } : {}),
    ...(workflow ? { workflow } : {}),
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

function normalizeWorkflowConfig(value: unknown): AgentRunPolicy['workflow'] | undefined {
  if (!isRecord(value)) return undefined
  const profile = value.profile === 'compact' || value.profile === 'deep' ? value.profile : value.profile === 'standard' ? 'standard' : undefined
  if (!profile) return undefined
  return {
    profile,
    ...(typeof value.includeMemories === 'boolean' ? { includeMemories: value.includeMemories } : {}),
    ...(typeof value.allowForcedToolCalls === 'boolean' ? { allowForcedToolCalls: value.allowForcedToolCalls } : {}),
  }
}

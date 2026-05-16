import type { AgentRunRole } from './types.js'

export interface RunHierarchyInput {
  role?: unknown
  parentRunId?: unknown
  planId?: unknown
  taskId?: unknown
  progress?: unknown
  blockedReason?: unknown
}

export interface NormalizedRunHierarchy {
  role?: AgentRunRole
  parentRunId?: string
  planId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
}

export function normalizeRunHierarchyInput(
  input: RunHierarchyInput,
  options: { defaultRole?: AgentRunRole } = {},
): NormalizedRunHierarchy {
  const role = normalizeRunRole(input.role) ?? options.defaultRole
  const parentRunId = normalizeNonEmptyString(input.parentRunId)
  const planId = normalizeNonEmptyString(input.planId)
  const taskId = normalizeNonEmptyString(input.taskId)
  const progress = normalizeRunProgress(input.progress)
  const blockedReason = normalizeNonEmptyString(input.blockedReason)
  return {
    ...(role ? { role } : {}),
    ...(parentRunId ? { parentRunId } : {}),
    ...(planId ? { planId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(progress !== undefined ? { progress } : {}),
    ...(blockedReason ? { blockedReason } : {}),
  }
}

export function normalizeRunRole(value: unknown): AgentRunRole | undefined {
  return value === 'planner' || value === 'worker' ? value : undefined
}

export function normalizeRunProgress(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.max(0, Math.min(1, number))
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

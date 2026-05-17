import { cloneJSONValue, isJSONRecord, isRecord } from '../jsonValue.js'
import type {
  AgentTask,
  AgentTaskArtifact,
  CreatePlanTaskInput,
  JSONValue,
  UpdatePlanTaskInput,
} from './types.js'

export function normalizeTaskStatus(value: unknown): AgentTask['status'] | undefined {
  return value === 'pending'
    || value === 'running'
    || value === 'blocked'
    || value === 'needs_review'
    || value === 'done'
    || value === 'failed'
    || value === 'cancelled'
    ? value
    : undefined
}

export function normalizeProgress(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.max(0, Math.min(1, number))
}

export function normalizePositiveInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.max(1, Math.floor(number))
}

export function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
}

export function normalizePlanTaskInputs(value: unknown): CreatePlanTaskInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => isRecord(item) ? [item] : [])
}

export function normalizePlanTaskUpdateInputs(value: unknown): UpdatePlanTaskInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => isRecord(item) ? [item] : [])
}

export function taskExecutionOverrideMetadata(input: CreatePlanTaskInput): Record<string, JSONValue> {
  const maxTaskAttempts = normalizePositiveInteger(input.maxTaskAttempts)
  const workerTimeoutMs = normalizePositiveInteger(input.workerTimeoutMs)
  return {
    ...(maxTaskAttempts ? { maxTaskAttempts } : {}),
    ...(workerTimeoutMs ? { workerTimeoutMs } : {}),
  }
}

export function taskExecutionMaxTaskAttempts(task: AgentTask, defaultMaxTaskAttempts: number): number {
  return normalizePositiveInteger(task.metadata?.maxTaskAttempts) ?? defaultMaxTaskAttempts
}

export function taskExecutionWorkerTimeoutMs(task: AgentTask | undefined, defaultTimeoutMs?: number): number | undefined {
  return normalizePositiveInteger(task?.metadata?.workerTimeoutMs) ?? defaultTimeoutMs
}

export function buildAgentTask(planId: string, input: CreatePlanTaskInput, now: string): AgentTask {
  const title = normalizeNonEmptyString(input.title)
  if (!title) throw new Error('task title is required')
  const metadata = {
    ...(isJSONRecord(input.metadata) ? cloneJSONValue(input.metadata) : {}),
    ...taskExecutionOverrideMetadata(input),
  }
  return {
    id: normalizeNonEmptyString(input.id) ?? makeId('task'),
    planId,
    ...(normalizeNonEmptyString(input.parentId) ? { parentId: normalizeNonEmptyString(input.parentId) } : {}),
    deps: normalizeStringList(input.deps),
    title,
    ...(normalizeNonEmptyString(input.description) ? { description: normalizeNonEmptyString(input.description) } : {}),
    status: 'pending',
    progress: 0,
    artifacts: [],
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

export function selectPlannerInlineTask(tasks: AgentTask[]): AgentTask | undefined {
  if (tasks.length !== 1) return undefined
  const task = tasks[0]
  if (!task || task.deps.length > 0 || task.parentId) return undefined
  const metadata = isRecord(task.metadata) ? task.metadata : undefined
  if (metadata?.executionMode === 'worker') return undefined
  return task
}

export function normalizeTaskArtifacts(value: unknown, now: string): AgentTaskArtifact[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const type = normalizeNonEmptyString(item.type)
    if (!type) return []
    return [{
      id: normalizeNonEmptyString(item.id) ?? makeId('artifact'),
      type,
      ...(normalizeNonEmptyString(item.title) ? { title: normalizeNonEmptyString(item.title) } : {}),
      ...(normalizeNonEmptyString(item.uri) ? { uri: normalizeNonEmptyString(item.uri) } : {}),
      ...(isJSONRecord(item.metadata) ? { metadata: cloneJSONValue(item.metadata) } : {}),
      createdAt: normalizeNonEmptyString(item.createdAt) ?? now,
    }]
  })
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

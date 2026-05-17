import type { JSONValue } from '../types.js'
import { cloneJSONValue, isRecord } from '../jsonValue.js'
import type { AgentRun, AgentThread } from '../state/types.js'
import { buildThreadContextSummary, normalizeThreadContextSummary, type ThreadContextSummary } from './promptHygiene.js'

const DEFAULT_MAX_THREAD_SUMMARY_CHARS = 4000

export function applyRuntimeThreadContextSummary(input: {
  thread: AgentThread
  run: AgentRun
  now: string
}): ThreadContextSummary {
  const limits = isRecord(input.run.metadata?.limits) ? input.run.metadata.limits : undefined
  const summary = buildThreadContextSummary({
    threadId: input.thread.id,
    messages: input.thread.messages,
    run: input.run,
    now: input.run.completedAt ?? input.now,
    previous: normalizeThreadContextSummary(input.thread.metadata?.threadContextSummary),
    maxSummaryChars: numberField(limits?.maxThreadSummaryChars) ?? DEFAULT_MAX_THREAD_SUMMARY_CHARS,
  })
  input.thread.metadata = {
    ...(input.thread.metadata ?? {}),
    threadContextSummary: cloneThreadContextSummary(summary) as unknown as JSONValue,
  }
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    threadContextSummary: cloneThreadContextSummary(summary) as unknown as JSONValue,
  }
  return summary
}

export function attachRuntimeThreadContextSummaryToRun(input: {
  thread: AgentThread
  run: AgentRun
}): ThreadContextSummary | undefined {
  const summary = normalizeThreadContextSummary(input.thread.metadata?.threadContextSummary)
  if (!summary) return undefined
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    threadContextSummary: cloneThreadContextSummary(summary) as unknown as JSONValue,
  }
  return summary
}

function cloneThreadContextSummary(summary: ThreadContextSummary): ThreadContextSummary {
  return cloneJSONValue(summary as unknown as JSONValue) as unknown as ThreadContextSummary
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

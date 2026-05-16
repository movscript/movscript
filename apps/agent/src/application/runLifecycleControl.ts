import type { AgentRun } from '../state/types.js'

const DEFAULT_SUBTREE_CANCEL_REASON = 'Run subtree was cancelled.'

export function createAbortError(message = 'Run was cancelled.'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function assertRunExecutionNotCancelled(input: {
  runId: string
  signal?: AbortSignal
  getRunStatus: (runId: string) => AgentRun['status'] | undefined
}): void {
  if (input.signal?.aborted) {
    throw input.signal.reason instanceof Error
      ? input.signal.reason
      : createAbortError(typeof input.signal.reason === 'string' ? input.signal.reason : undefined)
  }
  if (input.getRunStatus(input.runId) === 'cancelled') {
    throw createAbortError('Run was cancelled.')
  }
}

export function durationBetweenMs(start: string, end: string): number | undefined {
  const startedAt = new Date(start).getTime()
  const completedAt = new Date(end).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return undefined
  const durationMs = completedAt - startedAt
  return durationMs >= 0 && Number.isFinite(durationMs) ? durationMs : undefined
}

export function normalizeCancelReason(value: unknown, fallback = DEFAULT_SUBTREE_CANCEL_REASON): string {
  return normalizeOptionalCancelReason(value) ?? fallback
}

export function normalizeOptionalCancelReason(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function collectRunSubtreeIds(
  rootRunId: string,
  listChildRuns: (runId: string) => AgentRun[],
): string[] {
  const result: string[] = []
  const visit = (runId: string): void => {
    result.push(runId)
    for (const child of listChildRuns(runId)) visit(child.id)
  }
  visit(rootRunId)
  return result
}

export class RuntimeRunControllerRegistry {
  private readonly controllersByRunId = new Map<string, AbortController>()

  create(runId: string): AbortController {
    const controller = new AbortController()
    this.controllersByRunId.set(runId, controller)
    return controller
  }

  get(runId: string): AbortController | undefined {
    return this.controllersByRunId.get(runId)
  }

  release(runId: string, controller: AbortController): void {
    if (this.controllersByRunId.get(runId) === controller) {
      this.controllersByRunId.delete(runId)
    }
  }
}

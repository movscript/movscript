import { projectRunOntoThread } from '../../../../../state/run/projection/thread/runProjection.js'
import {
  applyRunCancellation,
  DEFAULT_RUN_CANCEL_REASON,
  isFinishedOrCancelledRunStatus,
  isFinishedRunStatus,
} from '../../../../../state/run/status/lifecycle/runStatus.js'
import { completeRunStep } from '../../../../../state/run/status/trace/runTrace.js'
import type { AgentStore } from '../../../../../state/store/core/store.js'
import type {
  CancelRunInput,
  AgentRun,
  AgentRunStep,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../../../../../state/shared/types.js'
import type { AgentRunRoundInfo } from '../../../../../state/run/core/round/runRound.js'
import {
  collectRunSubtreeIds,
  createAbortError,
  normalizeCancelReason,
  normalizeOptionalCancelReason,
} from '../../../lifecycle/runLifecycleControl.js'
import { createRuntimeMessage } from '../../../../shared/message/runtimeMessageFactory.js'
import { requireRuntimeRun } from '../../../../shared/store/runtimeStoreLookup.js'
import { appendThreadMessage } from '../../../../../messages/thread/threadMessage.js'
import { updateRuntimeThreadRunStatus } from '../../../../thread/projection/runtimeThreadProjection.js'

export interface RuntimeSubtreeCancellationTaskGraph {
  reason: string
  runIds: string[]
}

export interface RuntimeRunCancellationTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  agentId?: string
  parentAgentId?: string
  stepId?: string
  toolName?: string
  data?: unknown
  durationMs?: number
  completedAt?: string
}

export function applyRuntimeRunCancellationFlow(input: {
  store: Pick<AgentStore, 'getRun' | 'getThread' | 'updateRun' | 'updateThread'>
  runId: string
  reason?: unknown
  messageId: string
  now: string
  projectionNow?: string
  abortRun: (runId: string, error: Error) => void
  recordTrace: (run: AgentRun, trace: RuntimeRunCancellationTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): AgentRun {
  const run = requireRuntimeRun(input.store, input.runId)
  if (run.status === 'cancelled') return run
  if (isFinishedRunStatus(run.status)) return run

  const reason = normalizeOptionalCancelReason(input.reason)
  input.abortRun(run.id, createAbortError(reason ?? 'Run was cancelled.'))

  const current = input.store.getRun(run.id) ?? run
  if (current.status === 'cancelled') return current
  const cancelReason = reason ?? DEFAULT_RUN_CANCEL_REASON
  applyRunCancellation(current, input.now, reason)
  input.recordTrace(current, {
    kind: 'run',
    title: 'Run cancelled',
    summary: cancelReason,
    status: 'info',
    data: { reason: cancelReason },
  })

  const thread = input.store.getThread(current.threadId)
  if (thread && !current.assistantMessageId) {
    const assistant = createRuntimeMessage({
      threadId: thread.id,
      role: 'assistant',
      content: `已停止当前会话。\n\n${cancelReason}`,
      runId: current.id,
      id: input.messageId,
      now: input.now,
    })
    appendThreadMessage({ thread, message: assistant })
    projectRunOntoThread(thread, current)
    current.assistantMessageId = assistant.id
    const step = input.createStep(current, 'message')
    completeRunStep(step, {
      completedAt: input.now,
      result: { messageId: assistant.id, cancelled: true },
    })
    input.store.updateThread(thread)
  }
  input.store.updateRun(current)
  updateRuntimeThreadRunStatus({
    store: input.store,
    threadId: current.threadId,
    status: current.status,
    runId: current.id,
    now: input.projectionNow ?? input.now,
  })
  input.emitRunSnapshot(current, { done: true })
  return current
}

export function applyRuntimeRunCancellationRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'getThread' | 'updateRun' | 'updateThread'>
  runId: string
  cancelInput?: CancelRunInput
  messageId: string
  now: () => string
  abortRun: (runId: string, error: Error) => void
  recordTrace: (run: AgentRun, trace: RuntimeRunCancellationTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): AgentRun {
  return applyRuntimeRunCancellationFlow({
    store: input.store,
    runId: input.runId,
    reason: input.cancelInput?.reason,
    messageId: input.messageId,
    now: input.now(),
    projectionNow: input.now(),
    abortRun: input.abortRun,
    recordTrace: input.recordTrace,
    createStep: input.createStep,
    emitRunSnapshot: input.emitRunSnapshot,
  })
}

export function planRuntimeSubtreeCancellation(input: {
  store: Pick<AgentStore, 'getRun' | 'listChildRuns'>
  runId: string
  reason?: unknown
}): RuntimeSubtreeCancellationTaskGraph {
  requireRuntimeRun(input.store, input.runId)
  const reason = normalizeCancelReason(input.reason)
  const runIds = collectRunSubtreeIds(input.runId, (runId) => input.store.listChildRuns(runId))
    .reverse()
    .filter((runId) => {
      const run = input.store.getRun(runId)
      return run ? !isFinishedOrCancelledRunStatus(run.status) : false
  })
  return { reason, runIds }
}

export function applyRuntimeSubtreeCancellation(input: {
  taskGraph: RuntimeSubtreeCancellationTaskGraph
  cancelRun: (runId: string, reason: string) => void
}): { cancelledRunIds: string[] } {
  const cancelledRunIds: string[] = []
  for (const runId of input.taskGraph.runIds) {
    input.cancelRun(runId, input.taskGraph.reason)
    cancelledRunIds.push(runId)
  }
  return { cancelledRunIds }
}

export function applyRuntimeSubtreeCancellationRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'listChildRuns'>
  runId: string
  reason?: unknown
  cancelRun: (runId: string, reason: string) => void
}): { cancelledRunIds: string[] } {
  const taskGraph = planRuntimeSubtreeCancellation({
    store: input.store,
    runId: input.runId,
    reason: input.reason,
  })
  return applyRuntimeSubtreeCancellation({
    taskGraph,
    cancelRun: input.cancelRun,
  })
}

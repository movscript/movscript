import { isTerminalRuntimeOperationStatus, type RuntimeOperation } from '../operations/runtimeOperation.js'
import type { AgentRun, CreateRunInput, RuntimeContinuation, RuntimeInteraction } from '../state/types.js'
import type { AgentStore } from '../state/store.js'
import {
  approveRuntimeInteraction,
  rejectRuntimeInteraction,
  type RuntimeInteractionApprovalResult,
} from './runtimeInteractions.js'
import type { RuntimeRunControlBridge } from './runtimeRunControlBridge.js'

export type RuntimeSchedulerEvent =
  | { type: 'operation.started'; operation: RuntimeOperation }
  | { type: 'operation.observed'; operation: RuntimeOperation }
  | { type: 'interaction.approved'; interactionId: string }
  | { type: 'interaction.rejected'; interactionId: string }
  | { type: 'continuation.ready'; continuationId: string }

export class RuntimeScheduler {
  constructor(private readonly input: {
    store: Pick<AgentStore,
      | 'getRuntimeInteraction'
      | 'updateRuntimeInteraction'
      | 'createRuntimeContinuation'
      | 'updateRuntimeContinuation'
      | 'listRuntimeContinuations'
      | 'listRuntimeOperations'
      | 'listRuntimeInteractions'
      | 'listRuns'
      | 'getRun'
    >
    runControl: Pick<RuntimeRunControlBridge, 'approveRun' | 'rejectRun'>
    continueRun?: (input: CreateRunInput) => AgentRun
    now: () => string
  }) {}

  dispatch(event: RuntimeSchedulerEvent): RuntimeInteractionApprovalResult | RuntimeContinuation[] | undefined {
    if (event.type === 'operation.started') {
      return this.registerOperationContinuation(event.operation)
    }
    if (event.type === 'operation.observed') {
      const continuations = this.evaluateContinuationsForOperation(event.operation)
      if (continuations.length > 0) this.advanceThread(event.operation.threadId)
      return continuations
    }
    if (event.type === 'interaction.approved') {
      return approveRuntimeInteraction({
        store: this.input.store,
        interactionId: event.interactionId,
        now: this.input.now(),
        approveRun: (runId, approvalInput) => this.input.runControl.approveRun(runId, approvalInput),
      })
    }
    if (event.type === 'interaction.rejected') {
      return rejectRuntimeInteraction({
        store: this.input.store,
        interactionId: event.interactionId,
        now: this.input.now(),
        rejectRun: (runId, rejectionInput) => this.input.runControl.rejectRun(runId, rejectionInput),
      })
    }
    return undefined
  }

  approveInteraction(interactionId: string): { interaction: RuntimeInteraction; run: AgentRun } {
    return approveRuntimeInteraction({
      store: this.input.store,
      interactionId,
      now: this.input.now(),
      approveRun: (runId, approvalInput) => this.input.runControl.approveRun(runId, approvalInput),
    })
  }

  rejectInteraction(interactionId: string): { interaction: RuntimeInteraction; run: AgentRun } {
    return rejectRuntimeInteraction({
      store: this.input.store,
      interactionId,
      now: this.input.now(),
      rejectRun: (runId, rejectionInput) => this.input.runControl.rejectRun(runId, rejectionInput),
    })
  }

  registerOperationContinuation(operation: RuntimeOperation): RuntimeContinuation[] {
    const policy = operation.continuationPolicy
    if (!policy || policy.mode === 'none') return []
    const existing = this.input.store.listRuntimeContinuations({ runId: operation.runId })
      .find((continuation) => continuation.trigger.type === 'operation_completed'
        && continuation.status === 'waiting'
        && continuation.id === continuationIdForOperation(operation))
    const now = this.input.now()
    if (existing && existing.trigger.type === 'operation_completed') {
      const operationIds = Array.from(new Set([...existing.trigger.operationIds, operation.id]))
      const next: RuntimeContinuation = {
        ...existing,
        trigger: { ...existing.trigger, operationIds },
        updatedAt: now,
      }
      this.input.store.updateRuntimeContinuation(next)
      return this.evaluateContinuation(next)
    }
    const continuation: RuntimeContinuation = {
      id: continuationIdForOperation(operation),
      threadId: operation.threadId,
      runId: operation.runId,
      status: 'waiting',
      trigger: {
        type: 'operation_completed',
        operationIds: [operation.id],
        mode: policy.mode === 'any_completed' ? 'any' : 'all',
      },
      createdAt: now,
      updatedAt: now,
    }
    this.input.store.createRuntimeContinuation(continuation)
    return this.evaluateContinuation(continuation)
  }

  evaluateContinuationsForOperation(operation: RuntimeOperation): RuntimeContinuation[] {
    if (!isTerminalRuntimeOperationStatus(operation.status)) return []
    const continuations = this.input.store.listRuntimeContinuations({ runId: operation.runId, status: 'waiting' })
      .filter((continuation) => continuation.trigger.type === 'operation_completed'
        && continuation.trigger.operationIds.includes(operation.id))
    return continuations.flatMap((continuation) => this.evaluateContinuation(continuation))
  }

  advanceThread(threadId: string): AgentRun[] {
    if (!this.input.continueRun) return []
    if (this.threadHasBlockingRuntimeWork(threadId)) return []
    const readyContinuations = this.input.store.listRuntimeContinuations({ threadId, status: 'ready' })
    const advancedRuns: AgentRun[] = []
    for (const continuation of readyContinuations) {
      const run = this.advanceContinuation(continuation)
      if (run) advancedRuns.push(run)
    }
    return advancedRuns
  }

  private advanceContinuation(continuation: RuntimeContinuation): AgentRun | undefined {
    if (!this.input.continueRun || continuation.status !== 'ready') return undefined
    const sourceRun = this.input.store.getRun(continuation.runId)
    const operationIds = continuation.nextInput?.operationResults ?? []
    const operations = this.input.store.listRuntimeOperations({ runId: continuation.runId })
      .filter((operation) => operationIds.includes(operation.id))
    const run = this.input.continueRun({
      threadId: continuation.threadId,
      userMessage: continuationMessage(continuation, operations),
      parentRunId: continuation.runId,
      ...(sourceRun?.role ? { role: sourceRun.role } : {}),
      ...(sourceRun?.planId ? { planId: sourceRun.planId } : {}),
      ...(sourceRun?.taskId ? { taskId: sourceRun.taskId } : {}),
      ...(sourceRun?.agentManifest ? { agentManifest: sourceRun.agentManifest } : {}),
      metadata: {
        runtimeContinuationId: continuation.id,
        runtimeOperationIds: operationIds,
      },
    })
    const now = this.input.now()
    this.input.store.updateRuntimeContinuation({
      ...continuation,
      status: 'consumed',
      consumedAt: now,
      updatedAt: now,
    })
    return run
  }

  private threadHasBlockingRuntimeWork(threadId: string): boolean {
    const pendingInteractions = this.input.store.listRuntimeInteractions({ threadId, status: 'pending' })
    if (pendingInteractions.length > 0) return true
    const activeRuns = this.input.store.listRuns({ threadId })
      .filter((run) => run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action')
    return activeRuns.length > 0
  }

  private evaluateContinuation(continuation: RuntimeContinuation): RuntimeContinuation[] {
    if (continuation.status !== 'waiting' || continuation.trigger.type !== 'operation_completed') return []
    const operations = this.input.store.listRuntimeOperations({ runId: continuation.runId })
      .filter((operation) => continuation.trigger.type === 'operation_completed'
        && continuation.trigger.operationIds.includes(operation.id))
    const ready = continuation.trigger.mode === 'any'
      ? operations.some((operation) => operation.status === 'completed')
      : operations.length === continuation.trigger.operationIds.length
        && operations.every((operation) => operation.status === 'completed' || isTerminalRuntimeOperationStatus(operation.status))
    if (!ready) return []
    const now = this.input.now()
    const next: RuntimeContinuation = {
      ...continuation,
      status: 'ready',
      nextInput: {
        operationResults: operations
          .filter((operation) => operation.status === 'completed')
          .map((operation) => operation.id),
      },
      updatedAt: now,
    }
    this.input.store.updateRuntimeContinuation(next)
    return [next]
  }
}

function continuationIdForOperation(operation: RuntimeOperation): string {
  const groupId = operation.continuationPolicy?.groupId?.trim()
  return `continuation_${groupId || operation.id}`
}

function continuationMessage(continuation: RuntimeContinuation, operations: RuntimeOperation[]): string {
  const lines = [
    '[Runtime continuation]',
    `Continuation: ${continuation.id}`,
    'Runtime operations completed. Continue the original task using these results. Do not rerun completed operations unless the result is unusable.',
    '',
    ...operations.map((operation) => {
      const result = operation.result === undefined ? 'null' : JSON.stringify(operation.result)
      return `- ${operation.id} (${operation.kind}): ${result}`
    }),
  ]
  return lines.join('\n')
}

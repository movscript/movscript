import { isTerminalRuntimeWorkStatus, type RuntimeWork } from '../runtimeWork/runtimeWork.js'
import type { AgentRun, CreateRunInput, RuntimeContinuation, RuntimeInteraction } from '../state/types.js'
import type { AgentStore } from '../state/store.js'
import {
  approveRuntimeInteraction,
  rejectRuntimeInteraction,
  type RuntimeInteractionApprovalResult,
} from './runtimeInteractions.js'
import type { RuntimeRunControlBridge } from './runtimeRunControlBridge.js'

export type RuntimeSchedulerEvent =
  | { type: 'work.started'; work: RuntimeWork }
  | { type: 'work.observed'; work: RuntimeWork }
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
      | 'listRuntimeWorks'
      | 'listRuntimeInteractions'
      | 'listRuns'
      | 'getRun'
    >
    runControl: Pick<RuntimeRunControlBridge, 'approveRun' | 'rejectRun'>
    continueRun?: (input: CreateRunInput) => AgentRun
    now: () => string
  }) {}

  dispatch(event: RuntimeSchedulerEvent): RuntimeInteractionApprovalResult | RuntimeContinuation[] | undefined {
    if (event.type === 'work.started') {
      return this.registerWorkContinuation(event.work)
    }
    if (event.type === 'work.observed') {
      const continuations = this.evaluateContinuationsForWork(event.work)
      if (continuations.length > 0) this.advanceThread(event.work.threadId)
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

  registerWorkContinuation(work: RuntimeWork): RuntimeContinuation[] {
    const policy = work.continuationPolicy
    if (!policy || policy.mode === 'none') return []
    const existing = this.input.store.listRuntimeContinuations({ runId: work.runId })
      .find((continuation) => continuation.trigger.type === 'work_completed'
        && continuation.status === 'waiting'
        && continuation.id === continuationIdForWork(work))
    const now = this.input.now()
    if (existing && existing.trigger.type === 'work_completed') {
      const workIds = Array.from(new Set([...existing.trigger.workIds, work.id]))
      const next: RuntimeContinuation = {
        ...existing,
        trigger: { ...existing.trigger, workIds },
        updatedAt: now,
      }
      this.input.store.updateRuntimeContinuation(next)
      return this.evaluateContinuation(next)
    }
    const continuation: RuntimeContinuation = {
      id: continuationIdForWork(work),
      threadId: work.threadId,
      runId: work.runId,
      status: 'waiting',
      trigger: {
        type: 'work_completed',
        workIds: [work.id],
        mode: policy.mode === 'any_completed' ? 'any' : 'all',
      },
      createdAt: now,
      updatedAt: now,
    }
    this.input.store.createRuntimeContinuation(continuation)
    return this.evaluateContinuation(continuation)
  }

  evaluateContinuationsForWork(work: RuntimeWork): RuntimeContinuation[] {
    if (!isTerminalRuntimeWorkStatus(work.status)) return []
    const continuations = this.input.store.listRuntimeContinuations({ runId: work.runId, status: 'waiting' })
      .filter((continuation) => continuation.trigger.type === 'work_completed'
        && continuation.trigger.workIds.includes(work.id))
    return continuations.flatMap((continuation) => this.evaluateContinuation(continuation))
  }

  advanceThread(threadId: string): AgentRun[] {
    if (!this.input.continueRun) return []
    if (this.threadHasBlockingModelRun(threadId)) return []
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
    const workIds = continuation.nextInput?.workResults ?? []
    const works = this.input.store.listRuntimeWorks({ runId: continuation.runId })
      .filter((work) => workIds.includes(work.id))
    const run = this.input.continueRun({
      threadId: continuation.threadId,
      userMessage: continuationMessage(continuation, works),
      parentRunId: continuation.runId,
      ...(sourceRun?.role ? { role: sourceRun.role } : {}),
      ...(sourceRun?.taskGraphId ? { taskGraphId: sourceRun.taskGraphId } : {}),
      ...(sourceRun?.taskId ? { taskId: sourceRun.taskId } : {}),
      ...(sourceRun?.agentManifest ? { agentManifest: sourceRun.agentManifest } : {}),
      metadata: {
        runtimeContinuationId: continuation.id,
        runtimeWorkIds: workIds,
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

  private threadHasBlockingModelRun(threadId: string): boolean {
    const pendingInteractions = this.input.store.listRuntimeInteractions({ threadId, status: 'pending' })
    if (pendingInteractions.length > 0) return true
    const activeRuns = this.input.store.listRuns({ threadId })
      .filter((run) => run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action')
    return activeRuns.length > 0
  }

  private evaluateContinuation(continuation: RuntimeContinuation): RuntimeContinuation[] {
    if (continuation.status !== 'waiting' || continuation.trigger.type !== 'work_completed') return []
    const works = this.input.store.listRuntimeWorks({ runId: continuation.runId })
      .filter((work) => continuation.trigger.type === 'work_completed'
        && continuation.trigger.workIds.includes(work.id))
    const ready = continuation.trigger.mode === 'any'
      ? works.some((work) => work.status === 'completed')
      : works.length === continuation.trigger.workIds.length
        && works.every((work) => work.status === 'completed' || isTerminalRuntimeWorkStatus(work.status))
    if (!ready) return []
    const now = this.input.now()
    const next: RuntimeContinuation = {
      ...continuation,
      status: 'ready',
      nextInput: {
        workResults: works
          .filter((work) => work.status === 'completed')
          .map((work) => work.id),
      },
      updatedAt: now,
    }
    this.input.store.updateRuntimeContinuation(next)
    return [next]
  }
}

function continuationIdForWork(work: RuntimeWork): string {
  const groupId = work.continuationPolicy?.groupId?.trim()
  return `continuation_${groupId || work.id}`
}

function continuationMessage(continuation: RuntimeContinuation, works: RuntimeWork[]): string {
  const lines = [
    '[Runtime work continuation]',
    `Continuation: ${continuation.id}`,
    'Runtime work completed. Continue the original task using these results. Do not rerun completed work unless the result is unusable.',
    '',
    ...works.map((work) => {
      const result = work.result === undefined ? 'null' : JSON.stringify(work.result)
      return `- ${work.id} (${work.kind}): ${result}`
    }),
  ]
  return lines.join('\n')
}

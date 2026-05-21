import { projectRunStatusOntoThread } from '../state/runProjection.js'
import type { AgentStore } from '../state/store.js'
import type { AgentInputRequest, AgentRun, AgentTraceEvent, AnswerRunInputRequestInput } from '../state/types.js'

const RECOVERY_INPUT_PREFIX = 'input_runtime_recovery_'
const RECOVERY_SCHEMA = 'movscript.agent.thread-runtime-recovery.v1'

export interface RuntimeThreadRecoveryReport {
  checkedRunCount: number
  rescheduledRunIds: string[]
  interruptedRunIds: string[]
  waitingRunIds: string[]
}

export interface RuntimeThreadRecoveryTraceInput {
  kind: AgentTraceEvent['kind']
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  data?: unknown
}

export function reconcileRuntimeThreads(input: {
  store: Pick<AgentStore, 'listRuns' | 'getThread' | 'updateThread' | 'updateRun'>
  now: string
  recordTrace: (run: AgentRun, trace: RuntimeThreadRecoveryTraceInput) => void
  emitRunSnapshot: (run: AgentRun, options?: { done?: boolean }) => void
  startRunExecution: (runId: string) => void
}): RuntimeThreadRecoveryReport {
  const report: RuntimeThreadRecoveryReport = {
    checkedRunCount: 0,
    rescheduledRunIds: [],
    interruptedRunIds: [],
    waitingRunIds: [],
  }

  for (const run of input.store.listRuns()) {
    report.checkedRunCount += 1
    if (run.status === 'queued') {
      input.recordTrace(run, {
        kind: 'run',
        title: 'Queued run recovered',
        summary: 'Runtime router found a queued run during startup and scheduled it.',
        status: 'info',
        data: { eventType: 'runtime.recovery.queued_rescheduled' },
      })
      report.rescheduledRunIds.push(run.id)
      input.startRunExecution(run.id)
      continue
    }

    if (run.status === 'in_progress') {
      markRunInterrupted({ ...input, run })
      report.interruptedRunIds.push(run.id)
      continue
    }

    if (run.status === 'requires_action') report.waitingRunIds.push(run.id)
  }

  return report
}

export function resumeInterruptedRuntimeRun(input: {
  store: Pick<AgentStore, 'getRun' | 'getThread' | 'updateThread' | 'updateRun'>
  runId: string
  now: string
  recordTrace: (run: AgentRun, trace: RuntimeThreadRecoveryTraceInput) => void
  emitRunSnapshot: (run: AgentRun, options?: { done?: boolean }) => void
  startRunExecution: (runId: string) => void
}): AgentRun {
  const run = input.store.getRun(input.runId)
  if (!run) throw new Error(`run not found: ${input.runId}`)
  if (!isInterruptedByRuntimeRecovery(run)) {
    throw new Error(`run ${input.runId} is not an interrupted runtime recovery run`)
  }
  run.pendingInputRequests = (run.pendingInputRequests ?? []).map((request) => (
    isRuntimeRecoveryInput(request)
      ? {
        ...request,
        status: 'answered' as const,
        answer: { choiceIds: ['resume'] },
        answeredAt: input.now,
        updatedAt: input.now,
      }
      : request
  ))
  run.status = 'queued'
  run.blockedReason = undefined
  run.updatedAt = input.now
  run.metadata = {
    ...(run.metadata ?? {}),
    recovery: {
      ...(isRecord(run.metadata?.recovery) ? run.metadata.recovery : {}),
      schema: RECOVERY_SCHEMA,
      state: 'resumed',
      resumedAt: input.now,
    },
  }
  input.recordTrace(run, {
    kind: 'run',
    title: 'Interrupted run resumed',
    summary: 'Runtime router queued an interrupted thread run for execution.',
    status: 'info',
    data: { eventType: 'runtime.recovery.resumed' },
  })
  input.store.updateRun(run)
  projectRunOntoOwningThread(input.store, run, input.now)
  input.emitRunSnapshot(run)
  input.startRunExecution(run.id)
  return run
}

export function runtimeRecoveryActionFromInputAnswer(
  run: AgentRun,
  answerInput: AnswerRunInputRequestInput = {},
): 'resume' | 'cancel' | undefined {
  if (!isInterruptedByRuntimeRecovery(run)) return undefined
  const pendingRecoveryRequests = (run.pendingInputRequests ?? [])
    .filter((request) => request.status === 'pending' && isRuntimeRecoveryInput(request))
  if (pendingRecoveryRequests.length === 0) return undefined
  const requestId = typeof answerInput.requestId === 'string' && answerInput.requestId.trim()
    ? answerInput.requestId.trim()
    : undefined
  const request = requestId
    ? pendingRecoveryRequests.find((item) => item.id === requestId)
    : pendingRecoveryRequests[0]
  if (!request) return undefined
  const selectedChoices = Array.isArray(answerInput.choiceIds) ? answerInput.choiceIds : []
  if (selectedChoices.includes('resume')) return 'resume'
  if (selectedChoices.includes('cancel')) return 'cancel'
  return undefined
}

export function markInterruptedRuntimeRunRecoveryCancelled(run: AgentRun, now: string): AgentRun {
  if (!isInterruptedByRuntimeRecovery(run)) return run
  run.metadata = {
    ...(run.metadata ?? {}),
    recovery: {
      ...(isRecord(run.metadata?.recovery) ? run.metadata.recovery : {}),
      schema: RECOVERY_SCHEMA,
      state: 'cancelled',
      cancelledAt: now,
    },
  }
  run.updatedAt = now
  return run
}

function markRunInterrupted(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread' | 'updateRun'>
  run: AgentRun
  now: string
  recordTrace: (run: AgentRun, trace: RuntimeThreadRecoveryTraceInput) => void
  emitRunSnapshot: (run: AgentRun, options?: { done?: boolean }) => void
}): void {
  input.run.status = 'requires_action'
  input.run.blockedReason = 'Runtime restarted while this run was in progress.'
  input.run.updatedAt = input.now
  input.run.pendingInputRequests = ensureRuntimeRecoveryInput(input.run, input.now)
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    recovery: {
      schema: RECOVERY_SCHEMA,
      state: 'interrupted',
      detectedAt: input.now,
      previousStatus: 'in_progress',
      resumeEndpoint: `/runs/${encodeURIComponent(input.run.id)}/resume`,
      cancelEndpoint: `/runs/${encodeURIComponent(input.run.id)}/cancel`,
    },
  }
  input.recordTrace(input.run, {
    kind: 'run',
    title: 'Interrupted run recovered',
    summary: 'Runtime restarted while this run was in progress. The run is paused for explicit recovery.',
    status: 'blocked',
    data: { eventType: 'runtime.recovery.interrupted', recovery: input.run.metadata.recovery },
  })
  input.store.updateRun(input.run)
  projectRunOntoOwningThread(input.store, input.run, input.now)
  input.emitRunSnapshot(input.run, { done: true })
}

function ensureRuntimeRecoveryInput(run: AgentRun, now: string): AgentInputRequest[] {
  const existing = run.pendingInputRequests ?? []
  if (existing.some(isRuntimeRecoveryInput)) return existing
  return [
    ...existing,
    {
      id: `${RECOVERY_INPUT_PREFIX}${run.id}`,
      runId: run.id,
      title: '运行恢复',
      summary: '上次运行在进程重启时中断，需要明确恢复动作。',
      question: '请选择继续执行此 run，或取消后从 thread 创建新的 run。',
      inputType: 'choice',
      choices: [
        { id: 'resume', label: '继续执行', description: '从当前 thread/run 状态重新调度。' },
        { id: 'cancel', label: '取消运行', description: '保留 trace 和 debug ledger，停止当前 run。' },
      ],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
  ]
}

function projectRunOntoOwningThread(
  store: Pick<AgentStore, 'getThread' | 'updateThread'>,
  run: AgentRun,
  now: string,
): void {
  const thread = store.getThread(run.threadId)
  if (!thread) return
  projectRunStatusOntoThread({ thread, status: run.status, runId: run.id, now })
  store.updateThread(thread)
}

function isInterruptedByRuntimeRecovery(run: AgentRun): boolean {
  return run.status === 'requires_action'
    && isRecord(run.metadata?.recovery)
    && run.metadata.recovery.schema === RECOVERY_SCHEMA
    && run.metadata.recovery.state === 'interrupted'
}

function isRuntimeRecoveryInput(request: AgentInputRequest): boolean {
  return request.id.startsWith(RECOVERY_INPUT_PREFIX)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

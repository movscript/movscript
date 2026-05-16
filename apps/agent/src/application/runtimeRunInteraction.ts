import {
  answerRunInputInteraction,
  applyAnsweredRunInputInteraction,
  applyApprovedRunInteraction,
  applyRejectedRunInteraction,
  applyRequiredRunAction,
  approveRunInteraction,
  formatInputAnswerMessage,
  rejectedRunInteractionWarning,
  rejectRunInteraction,
  type AnsweredRunInputInteraction,
  type ApprovedRunInteraction,
  type RejectedRunInteraction,
} from '../state/runInteractionState.js'
import { projectRunOntoThread } from '../state/runProjection.js'
import { completeRunStep } from '../state/runTrace.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentApprovalRequest,
  AgentInputRequest,
  AgentTraceEvent,
  AgentTraceEventKind,
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AnswerRunInputRequestInput,
  ApproveRunInput,
  RejectRunInput,
} from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import { applyRuntimeThreadContextSummary } from '../context/runtimeThreadContextSummary.js'
import { appendThreadMessage } from './threadLifecycle.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { requireRuntimeRun, requireRuntimeThread } from './runtimeStoreLookup.js'
import { updateRuntimeThreadRunStatus } from './runtimeThreadProjection.js'

export interface RuntimeRunInteractionTraceInput {
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

export interface RuntimeRunApprovalResult {
  run: AgentRun
  approval: ApprovedRunInteraction
}

export interface RuntimeRunInputAnswerResult {
  run: AgentRun
  answer: AnsweredRunInputInteraction
  message: AgentMessage
}

export interface RuntimeRunRejectionResult {
  run: AgentRun
  rejection: RejectedRunInteraction
  warning: string
  message: AgentMessage
}

export function applyRuntimeRunRequiredActionFlow(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread' | 'updateRun'>
  run: AgentRun
  pendingApprovals: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
  warnings?: string[]
  now: string
  projectionNow?: string
  recordTrace: (run: AgentRun, trace: RuntimeRunInteractionTraceInput) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): AgentRun {
  const pendingInputRequests = input.pendingInputRequests ?? []
  const warnings = input.warnings ?? []
  const requiredAction = applyRequiredRunAction(input.run, {
    pendingApprovals: input.pendingApprovals,
    pendingInputRequests,
    warnings,
    now: input.now,
  })
  const inputOnly = requiredAction.pendingInputCount > 0 && input.pendingApprovals.length === 0
  input.recordTrace(input.run, {
    kind: inputOnly ? 'input' : 'approval',
    title: inputOnly ? 'User input required' : 'Approval required',
    summary: inputOnly
      ? `${requiredAction.pendingInputCount} user input request(s) paused the run.`
      : `${input.pendingApprovals.length} tool action(s) paused the run.`,
    status: 'blocked',
    data: { approvals: input.pendingApprovals, inputRequests: input.run.pendingInputRequests },
  })
  input.store.updateRun(input.run)
  updateRuntimeThreadRunStatus({
    store: input.store,
    threadId: input.run.threadId,
    status: input.run.status,
    runId: input.run.id,
    now: input.projectionNow ?? input.now,
  })
  input.emitRunSnapshot(input.run, { done: true })
  return input.run
}

export function applyRuntimeRunApprovalFlow(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  approvalInput?: ApproveRunInput
  now: string
  projectionNow?: string
  recordTrace: (run: AgentRun, trace: RuntimeRunInteractionTraceInput) => void
  emitRunSnapshot: (run: AgentRun) => void
  rememberRunAuth: (runId: string, value: unknown) => void
  startRunExecution: (runId: string) => void
}): AgentRun {
  const { run } = approveRuntimeRunInteraction({
    store: input.store,
    runId: input.runId,
    approvalInput: input.approvalInput,
    now: input.now,
    projectionNow: input.projectionNow,
    beforePersist: (targetRun, approval) => {
      input.recordTrace(targetRun, {
        kind: 'approval',
        title: 'Approval granted',
        summary: approval.approvingAll ? 'Approved all pending tool calls.' : `Approved ${approval.selectedApprovalIds.length + approval.selectedToolNames.length} pending action(s).`,
        status: 'completed',
        data: {
          eventType: 'approval.resolved',
          outcome: 'approved',
          approvalIds: approval.selectedApprovalIds,
          toolNames: approval.selectedToolNames,
          approvedToolNames: approval.approvedToolNames,
        },
      })
    },
  })
  input.emitRunSnapshot(run)
  input.rememberRunAuth(run.id, input.approvalInput ?? {})
  input.startRunExecution(run.id)
  return run
}

export function applyRuntimeRunInputAnswerFlow(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  answerInput?: AnswerRunInputRequestInput
  messageId: string
  now: string
  recordTrace: (run: AgentRun, trace: RuntimeRunInteractionTraceInput) => void
  emitRunSnapshot: (run: AgentRun) => void
  rememberRunAuth: (runId: string, value: unknown) => void
  startRunExecution: (runId: string) => void
}): AgentRun {
  const { run } = answerRuntimeRunInputRequest({
    store: input.store,
    runId: input.runId,
    answerInput: input.answerInput,
    messageId: input.messageId,
    now: input.now,
    beforePersist: (targetRun, answer) => {
      input.recordTrace(targetRun, {
        kind: 'input',
        title: 'User input received',
        summary: answer.request.title,
        status: 'completed',
        data: {
          requestId: answer.request.id,
          choiceIds: answer.choiceIds,
          ...(answer.text ? { text: answer.text } : {}),
        },
      })
    },
  })
  input.emitRunSnapshot(run)
  input.rememberRunAuth(run.id, input.answerInput ?? {})
  input.startRunExecution(run.id)
  return run
}

export function applyRuntimeRunApprovalRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  approvalInput?: ApproveRunInput
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeRunInteractionTraceInput) => void
  emitRunSnapshot: (run: AgentRun) => void
  rememberRunAuth: (runId: string, value: unknown) => void
  startRunExecution: (runId: string) => void
}): AgentRun {
  return applyRuntimeRunApprovalFlow({
    store: input.store,
    runId: input.runId,
    approvalInput: input.approvalInput,
    now: input.now(),
    projectionNow: input.now(),
    recordTrace: input.recordTrace,
    emitRunSnapshot: input.emitRunSnapshot,
    rememberRunAuth: input.rememberRunAuth,
    startRunExecution: input.startRunExecution,
  })
}

export function applyRuntimeRunInputAnswerRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  answerInput?: AnswerRunInputRequestInput
  messageId: string
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeRunInteractionTraceInput) => void
  emitRunSnapshot: (run: AgentRun) => void
  rememberRunAuth: (runId: string, value: unknown) => void
  startRunExecution: (runId: string) => void
}): AgentRun {
  return applyRuntimeRunInputAnswerFlow({
    store: input.store,
    runId: input.runId,
    answerInput: input.answerInput,
    messageId: input.messageId,
    now: input.now(),
    recordTrace: input.recordTrace,
    emitRunSnapshot: input.emitRunSnapshot,
    rememberRunAuth: input.rememberRunAuth,
    startRunExecution: input.startRunExecution,
  })
}

export function applyRuntimeRunRejectionFlow(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  rejectionInput?: RejectRunInput
  messageId: string
  now: string
  summaryNow?: string
  recordTrace: (run: AgentRun, trace: RuntimeRunInteractionTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): AgentRun {
  const { run } = rejectRuntimeRunInteraction({
    store: input.store,
    runId: input.runId,
    rejectionInput: input.rejectionInput,
    messageId: input.messageId,
    now: input.now,
    summaryNow: input.summaryNow,
    beforeMessage: (targetRun, rejection, warning) => {
      input.recordTrace(targetRun, {
        kind: 'approval',
        title: 'Approval rejected',
        summary: warning,
        status: 'blocked',
        data: {
          eventType: 'approval.resolved',
          outcome: 'denied',
          rejectedToolNames: rejection.rejectedToolNames,
        },
      })
    },
    beforePersist: (targetRun, rejection, message) => {
      const step = input.createStep(targetRun, 'message')
      completeRunStep(step, {
        completedAt: input.now,
        result: { messageId: message.id, rejectedToolNames: rejection.rejectedToolNames },
      })
    },
  })
  input.emitRunSnapshot(run, { done: true })
  return run
}

export function applyRuntimeRunRejectionRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  rejectionInput?: RejectRunInput
  messageId: string
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeRunInteractionTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): AgentRun {
  return applyRuntimeRunRejectionFlow({
    store: input.store,
    runId: input.runId,
    rejectionInput: input.rejectionInput,
    messageId: input.messageId,
    now: input.now(),
    summaryNow: input.now(),
    recordTrace: input.recordTrace,
    createStep: input.createStep,
    emitRunSnapshot: input.emitRunSnapshot,
  })
}

export function approveRuntimeRunInteraction(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  approvalInput?: ApproveRunInput
  now: string
  projectionNow?: string
  beforePersist?: (run: AgentRun, approval: ApprovedRunInteraction) => void
}): RuntimeRunApprovalResult {
  const run = requireRuntimeRun(input.store, input.runId)
  const approval = approveRunInteraction(run, input.approvalInput ?? {}, input.now)
  applyApprovedRunInteraction(run, approval, input.now)
  input.beforePersist?.(run, approval)
  input.store.updateRun(run)
  updateRuntimeThreadRunStatus({
    store: input.store,
    threadId: run.threadId,
    status: run.status,
    runId: run.id,
    now: input.projectionNow ?? input.now,
  })
  return { run, approval }
}

export function answerRuntimeRunInputRequest(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  answerInput?: AnswerRunInputRequestInput
  messageId: string
  now: string
  beforePersist?: (run: AgentRun, answer: AnsweredRunInputInteraction) => void
}): RuntimeRunInputAnswerResult {
  const run = requireRuntimeRun(input.store, input.runId)
  const answer = answerRunInputInteraction(run, input.answerInput ?? {}, input.now)
  applyAnsweredRunInputInteraction(run, answer, input.now)
  input.beforePersist?.(run, answer)

  const thread = requireRuntimeThread(input.store, run.threadId)
  const message = createRuntimeMessage({
    threadId: thread.id,
    role: 'user',
    content: formatInputAnswerMessage(answer.request, answer.choiceIds, answer.text),
    id: input.messageId,
    now: input.now,
  })
  appendThreadMessage({ thread, message })
  projectRunOntoThread(thread, run)
  input.store.updateThread(thread)
  input.store.updateRun(run)
  return { run, answer, message }
}

export function rejectRuntimeRunInteraction(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun' | 'getThread' | 'updateThread'>
  runId: string
  rejectionInput?: RejectRunInput
  messageId: string
  now: string
  summaryNow?: string
  beforeMessage?: (run: AgentRun, rejection: RejectedRunInteraction, warning: string) => void
  beforePersist?: (
    run: AgentRun,
    rejection: RejectedRunInteraction,
    message: AgentMessage,
    warning: string,
  ) => void
}): RuntimeRunRejectionResult {
  const run = requireRuntimeRun(input.store, input.runId)
  const rejection = rejectRunInteraction(run, input.rejectionInput ?? {}, input.now)
  const warning = rejectedRunInteractionWarning(rejection)
  input.beforeMessage?.(run, rejection, warning)

  const thread = requireRuntimeThread(input.store, run.threadId)
  const message = createRuntimeMessage({
    threadId: thread.id,
    role: 'assistant',
    content: `已取消需要确认的工具调用。\n\n${warning}`,
    runId: run.id,
    id: input.messageId,
    now: input.now,
  })
  appendThreadMessage({ thread, message })
  applyRejectedRunInteraction(run, rejection, {
    now: input.now,
    assistantMessageId: message.id,
    warning,
  })
  projectRunOntoThread(thread, run)
  applyRuntimeThreadContextSummary({ thread, run, now: input.summaryNow ?? input.now })
  input.beforePersist?.(run, rejection, message, warning)
  input.store.updateThread(thread)
  input.store.updateRun(run)
  return { run, rejection, warning, message }
}

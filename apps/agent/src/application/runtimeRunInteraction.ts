import {
  answerRunInputInteraction,
  applyAnsweredRunInputInteraction,
  applyApprovedRunInteraction,
  applyRejectedRunInteraction,
  approveRunInteraction,
  formatInputAnswerMessage,
  rejectedRunInteractionWarning,
  rejectRunInteraction,
  type AnsweredRunInputInteraction,
  type ApprovedRunInteraction,
  type RejectedRunInteraction,
} from '../state/runInteractionState.js'
import { projectRunOntoThread } from '../state/runProjection.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AnswerRunInputRequestInput,
  ApproveRunInput,
  RejectRunInput,
} from '../state/types.js'
import { applyRuntimeThreadContextSummary } from '../context/runtimeThreadContextSummary.js'
import { appendThreadMessage } from './threadLifecycle.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { requireRuntimeRun, requireRuntimeThread } from './runtimeStoreLookup.js'
import { updateRuntimeThreadRunStatus } from './runtimeThreadProjection.js'

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

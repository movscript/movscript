import { applyRunFailure } from '../state/runStatus.js'
import { projectRunOntoThread } from '../state/runProjection.js'
import { completeRunStep } from '../state/runTrace.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { updateRuntimeThreadRunStatus } from './runtimeThreadProjection.js'
import { appendThreadMessage } from './threadLifecycle.js'

export interface RuntimeRunFailureTraceInput {
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

export function applyRuntimeRunFailure(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread' | 'updateRun'>
  run: AgentRun
  error: unknown
  messageId: string
  now: string
  projectionNow?: string
  stepCompletedAt?: string
  recordTrace: (run: AgentRun, trace: RuntimeRunFailureTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): AgentRun {
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error)
  applyRunFailure(input.run, input.now, errorMessage)
  input.recordTrace(input.run, {
    kind: 'error',
    title: 'Run failed',
    summary: input.run.error,
    status: 'failed',
    data: { error: input.run.error },
  })
  updateRuntimeThreadRunStatus({
    store: input.store,
    threadId: input.run.threadId,
    status: input.run.status,
    runId: input.run.id,
    now: input.projectionNow ?? input.now,
  })
  const thread = input.store.getThread(input.run.threadId)
  if (thread) {
    const assistant = createRuntimeMessage({
      threadId: thread.id,
      role: 'assistant',
      content: `运行失败：${input.run.error}`,
      runId: input.run.id,
      id: input.messageId,
      now: input.now,
    })
    appendThreadMessage({ thread, message: assistant })
    projectRunOntoThread(thread, input.run)
    input.run.assistantMessageId = assistant.id
    const step = input.createStep(input.run, 'message')
    completeRunStep(step, {
      completedAt: input.stepCompletedAt ?? input.now,
      result: { messageId: assistant.id },
    })
    input.store.updateThread(thread)
    input.emitAssistantMessage(input.run, assistant)
  }
  input.store.updateRun(input.run)
  input.emitRunSnapshot(input.run, { done: true })
  return input.run
}

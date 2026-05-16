import type { AgentMemory } from '../memory/types.js'
import { applyRuntimeThreadContextSummary } from '../context/runtimeThreadContextSummary.js'
import { projectRunOntoThread } from '../state/runProjection.js'
import { buildRunRound, type AgentRunRoundInfo } from '../state/runRound.js'
import { applyRunCompletion } from '../state/runStatus.js'
import type { AgentStore } from '../state/store.js'
import { completeRunStep } from '../state/runTrace.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
  JSONValue,
  ToolCallOutcome,
} from '../state/types.js'
import { buildRollbackMetadata } from '../tools/toolRollbackRecords.js'
import { buildFinalAssistantContent, combineAssistantTurnContents } from './assistantMessage.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { appendThreadMessage } from './threadLifecycle.js'

export interface RuntimeRunCompletionTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  stepId?: string
  data?: unknown
}

export function applyRuntimeRunCompletion(input: {
  store: Pick<AgentStore, 'updateRun' | 'updateThread'>
  run: AgentRun
  thread: AgentThread
  userMessage: string
  assistantContents: string[]
  finalContent: string
  toolOutcomes: ToolCallOutcome[]
  warnings: string[]
  memories: AgentMemory[]
  memoryStorePath: string | undefined
  messageId: string
  now: string
  stepCompletedAt?: string
  summaryNow?: string
  postRunUserMessage: AgentMessage
  projectId?: number
  recordTrace: (run: AgentRun, trace: RuntimeRunCompletionTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
  deferPostRunRecords: (runId: string, input: {
    round: AgentRunRoundInfo
    userMessage: AgentMessage
    projectId?: number
    toolOutcomes: ToolCallOutcome[]
    warnings: string[]
  }) => void
}): AgentMessage {
  const finalRound = buildRunRound(999, 'Final response', 'final')
  const visibleModelContent = combineAssistantTurnContents(input.assistantContents, input.finalContent)
  const finalAssistantContent = buildFinalAssistantContent({
    userMessage: input.userMessage,
    modelContent: visibleModelContent,
    toolResults: input.toolOutcomes,
    warnings: input.warnings,
    memories: input.memories,
    run: input.run,
    ...(input.memoryStorePath ? { memoryStorePath: input.memoryStorePath } : {}),
  })
  const assistant = createRuntimeMessage({
    threadId: input.thread.id,
    role: 'assistant',
    content: finalAssistantContent || '（无内容）',
    runId: input.run.id,
    id: input.messageId,
    now: input.now,
  })
  appendThreadMessage({ thread: input.thread, message: assistant })

  const step = input.createStep(input.run, 'message', finalRound)
  completeRunStep(step, {
    completedAt: input.stepCompletedAt ?? input.now,
    result: { messageId: assistant.id },
  })
  input.recordTrace(input.run, {
    kind: 'assistant',
    title: 'Assistant message created',
    summary: assistant.content.slice(0, 180),
    status: 'completed',
    round: finalRound,
    stepId: step.id,
    data: { messageId: assistant.id, chars: assistant.content.length, content: assistant.content, source: 'model' },
  })

  applyRunCompletion(input.run, {
    now: input.now,
    assistantMessageId: assistant.id,
    warnings: input.warnings,
    metadataPatch: {
      memoryIds: input.memories.map((memory) => memory.id),
      ...(input.assistantContents.length > 1 ? { assistantContentTurns: input.assistantContents as unknown as JSONValue } : {}),
      ...buildRollbackMetadata(input.toolOutcomes),
    },
  })
  input.recordTrace(input.run, {
    kind: 'run',
    title: 'Run finished',
    summary: `Run ${input.run.status} with ${input.run.steps.length} step(s).`,
    status: input.warnings.length > 0 ? 'info' : 'completed',
    round: finalRound,
    data: {
      status: input.run.status,
      warningCount: input.warnings.length,
      stepCount: input.run.steps.length,
      toolResultCount: input.toolOutcomes.length,
    },
  })
  projectRunOntoThread(input.thread, input.run)
  input.thread.updatedAt = input.run.updatedAt
  applyRuntimeThreadContextSummary({ thread: input.thread, run: input.run, now: input.summaryNow ?? input.now })
  input.store.updateThread(input.thread)
  input.store.updateRun(input.run)
  input.emitAssistantMessage(input.run, assistant)
  input.emitRunSnapshot(input.run, { done: true })
  input.deferPostRunRecords(input.run.id, {
    round: finalRound,
    userMessage: input.postRunUserMessage,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    toolOutcomes: input.toolOutcomes,
    warnings: input.warnings,
  })
  return assistant
}

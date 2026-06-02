import type { AgentMemory } from '../../../../memory/shared/types.js'
import { applyRuntimeThreadContextSummary } from '../../../../context/prompt/summary/runtimeThreadContextSummary.js'
import { projectRunOntoThread } from '../../../../state/run/projection/thread/runProjection.js'
import { buildRunRound, type AgentRunRoundInfo } from '../../../../state/run/core/round/runRound.js'
import { applyRunCompletion } from '../../../../state/run/status/lifecycle/runStatus.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import { completeRunStep } from '../../../../state/run/status/trace/runTrace.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
  JSONValue,
  ToolCallOutcome,
} from '../../../../state/shared/types.js'
import { buildRollbackMetadata } from '../../../../tools/calls/rollback/toolRollbackRecords.js'
import { combineAssistantTurnContents } from '../../../../messages/assistant/output/assistantOutput.js'
import { formatAssistantMessageTraceSummary, summarizeAssistantMessageTrace } from '../../../../trace/summaries/interaction/messages/messageTrace.js'
import { buildFinalAssistantContent } from '../content/runtimeFinalAssistantContent.js'
import { createRuntimeMessage } from '../../../shared/message/runtimeMessageFactory.js'
import { appendThreadMessage } from '../../../../messages/thread/threadMessage.js'

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
  const runtimeStatus = runtimeStatusMessageFromToolOutcomes(input.toolOutcomes)
  const assistantContent = finalAssistantContent || runtimeStatus?.detail || '（无内容）'
  const assistant = createRuntimeMessage({
    threadId: input.thread.id,
    role: 'assistant',
    content: assistantContent,
    runId: input.run.id,
    ...(runtimeStatus
      ? {
        metadata: {
          kind: 'runtime_status',
          runtimeStatus: runtimeStatus as unknown as JSONValue,
        },
      }
      : {}),
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
    summary: formatAssistantMessageTraceSummary(assistant.content),
    status: 'completed',
    round: finalRound,
    stepId: step.id,
    data: summarizeAssistantMessageTrace({
      messageId: assistant.id,
      content: assistant.content,
      source: 'model',
    }),
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

interface RuntimeStatusMessage {
  kind: 'async_work_handoff'
  title: string
  detail: string
  workId?: string
  workKind?: string
  workStatus?: string
}

function runtimeStatusMessageFromToolOutcomes(toolOutcomes: ToolCallOutcome[]): RuntimeStatusMessage | undefined {
  for (const outcome of [...toolOutcomes].reverse()) {
    if (outcome.call.name !== 'core_work_start' || outcome.error) continue
    const result = recordValue(outcome.result)
    const args = recordValue(outcome.call.args)
    const work = recordValue(result?.work)
    const workId = stringValue(work?.id) ?? stringValue(result?.workId)
    const workKind = stringValue(work?.kind) ?? stringValue(args?.kind)
    const workStatus = stringValue(work?.status) ?? stringValue(result?.status)
    const active = isActiveRuntimeWorkStatus(workStatus)
    return {
      kind: 'async_work_handoff',
      title: '异步任务已提交',
      detail: active
        ? '任务正在后台运行，完成后会自动接续。你可以继续发送消息。'
        : '任务已交给 runtime 后台处理，后续结果会从异步任务返回。你可以继续发送消息。',
      ...(workId ? { workId } : {}),
      ...(workKind ? { workKind } : {}),
      ...(workStatus ? { workStatus } : {}),
    }
  }
  return undefined
}

function isActiveRuntimeWorkStatus(status: string | undefined): boolean {
  return status === 'pending_approval'
    || status === 'queued'
    || status === 'running'
    || status === 'waiting'
    || status === 'started'
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

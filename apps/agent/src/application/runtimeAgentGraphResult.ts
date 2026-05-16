import type { AgentGraphResult } from '../orchestration/agentGraph.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentMemory } from '../memory/types.js'
import {
  applyRuntimeRunRequiredActionFlow,
} from './runtimeRunInteraction.js'
import {
  applyRuntimeRunCompletion,
} from './runtimeRunCompletion.js'

export interface RuntimeAgentGraphResultTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  stepId?: string
  data?: unknown
}

export function applyRuntimeAgentGraphResult(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread' | 'updateRun'>
  result: AgentGraphResult
  run: AgentRun
  thread: AgentThread
  userMessage: string
  memories: AgentMemory[]
  memoryStorePath?: string
  postRunUserMessage: AgentMessage
  projectId?: number
  messageId: string
  now: string
  projectionNow: string
  stepCompletedAt: string
  summaryNow: string
  markRunCancelled: (run: AgentRun, reason?: string) => AgentRun
  recordTrace: (run: AgentRun, trace: RuntimeAgentGraphResultTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
  deferPostRunRecords: Parameters<typeof applyRuntimeRunCompletion>[0]['deferPostRunRecords']
}): AgentRun | AgentMessage {
  if (input.result.status === 'requires_action') {
    return applyRuntimeRunRequiredActionFlow({
      store: input.store,
      run: input.run,
      pendingApprovals: input.result.pendingApprovals,
      pendingInputRequests: input.result.pendingInputRequests,
      warnings: input.result.warnings,
      now: input.now,
      projectionNow: input.projectionNow,
      recordTrace: input.recordTrace,
      emitRunSnapshot: input.emitRunSnapshot,
    })
  }

  if (input.result.status === 'cancelled') {
    return input.markRunCancelled(input.run, input.result.reason)
  }

  if (input.result.status === 'failed') {
    throw new Error(input.result.error)
  }

  return applyRuntimeRunCompletion({
    store: input.store,
    run: input.run,
    thread: input.thread,
    userMessage: input.userMessage,
    assistantContents: input.result.assistantContents,
    finalContent: input.result.finalContent,
    toolOutcomes: input.result.toolOutcomes,
    warnings: input.result.warnings,
    memories: input.memories,
    memoryStorePath: input.memoryStorePath,
    messageId: input.messageId,
    now: input.now,
    stepCompletedAt: input.stepCompletedAt,
    summaryNow: input.summaryNow,
    postRunUserMessage: input.postRunUserMessage,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    recordTrace: input.recordTrace,
    createStep: input.createStep,
    emitAssistantMessage: input.emitAssistantMessage,
    emitRunSnapshot: input.emitRunSnapshot,
    deferPostRunRecords: input.deferPostRunRecords,
  })
}

import type { AgentGraphResult } from '../../../../../orchestration/graph/result/agentGraphResult.js'
import { memoryStorePath, type AgentMemoryStore } from '../../../../../memory/store/in-memory/memoryStore.js'
import type { AgentMemory } from '../../../../../memory/shared/types.js'
import type { AgentRunRoundInfo } from '../../../../../state/run/core/round/runRound.js'
import type { AgentStore } from '../../../../../state/store/core/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../../../../../state/shared/types.js'
import { applyRuntimeAgentGraphResult, type RuntimeAgentGraphResultTraceInput } from '../../../../graph/result/runtimeAgentGraphResult.js'
import type { RuntimeRunContextPackage } from '../../context/package/runtimeRunContextPackage.js'
import type { applyRuntimeRunCompletion } from '../../../completion/success/runtimeRunCompletion.js'

export interface RuntimeRunAgentGraphResultHandlingTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  stepId?: string
  data?: unknown
}

export function applyRuntimeRunAgentGraphResultHandling(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread' | 'updateRun' | 'createRuntimeInteraction' | 'listRuntimeInteractions'>
  result: AgentGraphResult
  run: AgentRun
  thread: AgentThread
  userMessage: string
  postRunUserMessage: AgentMessage
  memories: AgentMemory[]
  memoryStore: AgentMemoryStore
  contextPackage: Pick<RuntimeRunContextPackage, 'context'>
  messageId: string
  now: () => string
  markRunCancelled: (run: AgentRun, reason?: string) => AgentRun
  recordTrace: (run: AgentRun, trace: RuntimeRunAgentGraphResultHandlingTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
  deferPostRunRecords: Parameters<typeof applyRuntimeRunCompletion>[0]['deferPostRunRecords']
}): AgentRun | AgentMessage | undefined {
  const now = input.now()
  return applyRuntimeAgentGraphResult({
    store: input.store,
    result: input.result,
    run: input.run,
    thread: input.thread,
    userMessage: input.userMessage,
    memories: input.memories,
    memoryStorePath: memoryStorePath(input.memoryStore),
    postRunUserMessage: input.postRunUserMessage,
    ...(input.contextPackage.context.currentProjectId !== undefined ? { projectId: input.contextPackage.context.currentProjectId } : {}),
    messageId: input.messageId,
    now,
    projectionNow: now,
    stepCompletedAt: now,
    summaryNow: now,
    markRunCancelled: input.markRunCancelled,
    recordTrace: input.recordTrace as (run: AgentRun, trace: RuntimeAgentGraphResultTraceInput) => void,
    createStep: input.createStep,
    emitAssistantMessage: input.emitAssistantMessage,
    emitRunSnapshot: input.emitRunSnapshot,
    deferPostRunRecords: input.deferPostRunRecords,
  })
}

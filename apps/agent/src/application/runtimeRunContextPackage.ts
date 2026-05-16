import type { JSONValue } from '../types.js'
import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import {
  extractAgentContext,
  extractFocusTimings,
  type AgentContext,
} from '../context/runtimeContext.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentRun,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import {
  resolveRuntimeFocusContext,
  type RuntimeFocusContextResult,
} from './runtimeFocusContext.js'
import {
  resolveRuntimeMemoryContext,
  type RuntimeMemoryContextResult,
} from './runtimeMemoryContext.js'

export interface RuntimeRunContextPackageTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export interface RuntimeRunContextPackage extends RuntimeFocusContextResult {
  context: AgentContext
  focusTimings?: { totalMs?: number; focusMs?: number }
  memories: AgentMemory[]
  memoryContext: RuntimeMemoryContextResult
  memoryDurationMs: number
  contextCompletedAt: number
}

export async function resolveRuntimeRunContextPackage(input: {
  store: Pick<AgentStore, 'updateRun' | 'updateThread'>
  run: AgentRun
  thread: AgentThread
  command: AgentCommandRuntime
  clientInput?: NormalizedClientInput
  userMessage: string
  setupRound: AgentRunRoundInfo
  timestampMs: () => number
  now: () => string
  mcpClient: {
    initialize(options?: { signal?: AbortSignal }): Promise<unknown>
    callTool(name: string, args?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue>
  }
  memoryManager: Pick<MemoryManager, 'loadRelevantMemories'>
  signal?: AbortSignal
  recordTrace: (run: AgentRun, trace: RuntimeRunContextPackageTraceInput) => void
}): Promise<RuntimeRunContextPackage> {
  const focusContext = await resolveRuntimeFocusContext({
    run: input.run,
    command: input.command,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    setupRound: input.setupRound,
    timestampMs: input.timestampMs,
    now: input.now,
    mcpClient: input.mcpClient,
    signal: input.signal,
    recordTrace: input.recordTrace,
    updateRun: (targetRun) => input.store.updateRun(targetRun),
  })
  const context = extractAgentContext(focusContext.contextResult)
  const focusTimings = extractFocusTimings(focusContext.contextResult)
  if (typeof context.currentProjectId === 'number') {
    input.thread.projectId = context.currentProjectId
    input.store.updateThread(input.thread)
  }

  const memoryContext = resolveRuntimeMemoryContext({
    run: input.run,
    memoryManager: input.memoryManager,
    projectId: context.currentProjectId,
    query: input.userMessage,
    setupRound: input.setupRound,
    timestampMs: input.timestampMs,
    recordTrace: input.recordTrace,
  })

  return {
    ...focusContext,
    context,
    ...(focusTimings ? { focusTimings } : {}),
    memories: memoryContext.memories,
    memoryContext,
    memoryDurationMs: memoryContext.memoryDurationMs,
    contextCompletedAt: input.timestampMs(),
  }
}

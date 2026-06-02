import type { JSONValue } from '../../../../../shared/protocol/types.js'
import type { NormalizedClientInput } from '../../../../../context/input/client/normalizeClientInput.js'
import type { AgentCommandRuntime } from '../../../../../context/command/commandRouter.js'
import {
  extractAgentContext,
  extractFocusTimings,
  isValidAgentProjectId,
  type AgentContext,
} from '../../../../../context/runtime/runtimeContext.js'
import type { MemoryManager } from '../../../../../memory/manager/memoryManager.js'
import type { AgentMemory } from '../../../../../memory/shared/types.js'
import type { AgentRunRoundInfo } from '../../../../../state/run/core/round/runRound.js'
import type { AgentStore } from '../../../../../state/store/core/store.js'
import type {
  AgentRun,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../../../../../state/shared/types.js'
import {
  resolveRuntimeFocusContext,
  type RuntimeFocusContextResult,
} from '../../../view/focus/runtimeFocusContext.js'
import {
  resolveRuntimeMemoryContext,
  type RuntimeMemoryContextResult,
} from '../../../../memory/context/runtimeMemoryContext.js'

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
  const currentProjectId = isValidAgentProjectId(context.currentProjectId) ? context.currentProjectId : undefined
  if (currentProjectId !== undefined) {
    input.thread.projectId = currentProjectId
    input.store.updateThread(input.thread)
  }

  const memoryContext = resolveRuntimeMemoryContext({
    run: input.run,
    memoryManager: input.memoryManager,
    projectId: currentProjectId,
    query: input.userMessage,
    setupRound: input.setupRound,
    timestampMs: input.timestampMs,
    recordTrace: input.recordTrace,
    enabled: shouldLoadRuntimeMemories(input.command, input.userMessage),
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

export function shouldLoadRuntimeMemories(command: AgentCommandRuntime, userMessage: string): boolean {
  if (command.name === 'memory') return true
  return /\b(memory|memories|remember|preference|preferences|default|defaults|previously|before|last time)\b/i.test(userMessage)
    || /(记忆|记住|偏好|默认|上次|之前|以前|按我.{0,4}习惯)/.test(userMessage)
}

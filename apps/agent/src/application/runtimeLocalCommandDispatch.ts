import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import { isLocalDiagnosticCommand } from '../context/localDiagnosticCommands.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { AgentDebugContextPanel, AgentMessage, AgentRun, AgentRunPolicy, AgentRunStep, AgentThread, AgentTraceEvent, AgentTraceEventKind, JSONValue, ResolvedAgentSkill, ResolvedToolCatalog } from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentStore } from '../state/store.js'
import type { AgentMemory } from '../memory/types.js'
import type { SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
import type { ToolExecutionResult } from '../orchestration/toolExecutor.js'
import { applyRuntimeLocalDiagnosticCommand } from './runtimeLocalDiagnosticCommand.js'
import {
  applyRuntimeLocalGenerationCommand,
  isRuntimeLocalGenerationCommand,
} from './runtimeLocalGenerationCommand.js'
export { normalizeRuntimeLocalGenerationToolError } from './runtimeLocalGenerationToolExecution.js'

export interface RuntimeLocalCommandTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  stepId?: string
  toolName?: string
  data?: unknown
  durationMs?: number
}

export async function applyRuntimeLocalCommandDispatch(input: {
  store: Pick<AgentStore, 'updateRun' | 'updateThread'>
  run: AgentRun
  thread: AgentThread
  command: AgentCommandRuntime
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  policy: AgentRunPolicy
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  memoryStorePath?: string
  contractResolver: AgentRuntimeContractResolver
  now: () => string
  timestampMs: () => number
  executeGenerationTool: (call: { name: 'movscript_create_generation_job'; args: Record<string, JSONValue> }) => Promise<ToolExecutionResult>
  recordTrace: (run: AgentRun, trace: RuntimeLocalCommandTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): Promise<boolean> {
  if (input.run.metadata?.forcedToolCall) return false

  if (isLocalDiagnosticCommand(input.command.name)) {
    applyRuntimeLocalDiagnosticCommand({
      store: input.store,
      run: input.run,
      thread: input.thread,
      command: input.command,
      manifest: input.manifest,
      skills: input.skills,
      ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
      context: input.context,
      tools: input.tools,
      policy: input.policy,
      memories: input.memories,
      warnings: input.warnings,
      history: input.history,
      userMessage: input.userMessage,
      ...(input.memoryStorePath ? { memoryStorePath: input.memoryStorePath } : {}),
      contractResolver: input.contractResolver,
      now: input.now,
      recordTrace: input.recordTrace,
      createStep: input.createStep,
      emitAssistantMessage: input.emitAssistantMessage,
      emitRunSnapshot: input.emitRunSnapshot,
    })
    return true
  }

  if (isRuntimeLocalGenerationCommand(input.command)) {
    await applyRuntimeLocalGenerationCommand({
      store: input.store,
      run: input.run,
      thread: input.thread,
      command: input.command,
      userMessage: input.userMessage,
      warnings: input.warnings,
      memories: input.memories,
      ...(input.memoryStorePath ? { memoryStorePath: input.memoryStorePath } : {}),
      now: input.now,
      timestampMs: input.timestampMs,
      executeGenerationTool: input.executeGenerationTool,
      recordTrace: input.recordTrace,
      createStep: input.createStep,
      emitAssistantMessage: input.emitAssistantMessage,
      emitRunSnapshot: input.emitRunSnapshot,
    })
    return true
  }

  return false
}

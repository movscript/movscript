import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type { AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import { isLocalDiagnosticCommand } from '../../../context/diagnostics/commands/localDiagnosticCommands.js'
import type { AgentCommandRuntime } from '../../../context/command/commandRouter.js'
import type { AgentDebugContextPanel, AgentMessage, AgentRun, AgentRuntimeLimits, AgentRunStep, AgentThread, AgentTraceEvent, AgentTraceEventKind, JSONValue, ResolvedAgentSkill, ResolvedToolCatalog } from '../../../state/shared/types.js'
import type { AgentRunRoundInfo } from '../../../state/run/core/round/runRound.js'
import type { AgentStore } from '../../../state/store/core/store.js'
import type { AgentMemory } from '../../../memory/shared/types.js'
import type { SkillDiscoverySummary } from '../../../context/prompt/registry/promptCandidateParts.js'
import { applyRuntimeLocalDiagnosticCommand } from '../diagnostics/runtimeLocalDiagnosticCommand.js'

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
  runtimeLimits: AgentRuntimeLimits
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  memoryStorePath?: string
  contractResolver: AgentRuntimeContractResolver
  now: () => string
  timestampMs: () => number
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
      runtimeLimits: input.runtimeLimits,
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

  return false
}

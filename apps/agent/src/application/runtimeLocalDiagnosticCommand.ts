import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import { buildLocalDiagnosticCommand } from '../context/localDiagnosticCommands.js'
import { applyRuntimeThreadContextSummary } from '../context/runtimeThreadContextSummary.js'
import type { SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
import type { AgentMemory } from '../memory/types.js'
import { projectRunOntoThread } from '../state/runProjection.js'
import { buildRunRound, type AgentRunRoundInfo } from '../state/runRound.js'
import { applyRunCompletion } from '../state/runStatus.js'
import { completeRunStep } from '../state/runTrace.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRunPolicy,
  AgentRunStep,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../state/types.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { appendThreadMessage } from './threadLifecycle.js'

export interface RuntimeLocalDiagnosticTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  stepId?: string
  data?: unknown
}

export function applyRuntimeLocalDiagnosticCommand(input: {
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
  recordTrace: (run: AgentRun, trace: RuntimeLocalDiagnosticTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): AgentMessage {
  const localRound = buildRunRound(1, 'Runtime command', 'runtime_rule')
  input.recordTrace(input.run, {
    kind: 'policy',
    title: 'Command handled locally',
    summary: `${input.command.rawName ?? `/${input.command.name}`} returns deterministic runtime diagnostics without calling the model gateway.`,
    status: 'completed',
    round: localRound,
    data: {
      command: input.command,
      modelGatewayCalled: false,
      reason: `${input.command.name} is a deterministic runtime diagnostic command`,
    },
  })

  const finalRound = buildRunRound(999, 'Final response', 'final')
  const localDiagnostic = buildLocalDiagnosticCommand({
    command: input.command,
    run: input.run,
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
  })
  const assistant = createRuntimeMessage({
    threadId: input.thread.id,
    role: 'assistant',
    content: localDiagnostic.content || '（无内容）',
    runId: input.run.id,
  })
  appendThreadMessage({ thread: input.thread, message: assistant })

  const step = input.createStep(input.run, 'message', finalRound)
  completeRunStep(step, {
    completedAt: input.now(),
    result: {
      messageId: assistant.id,
      localCommand: input.command.name,
      ...(localDiagnostic.metadata ? { diagnostic: localDiagnostic.metadata } : {}),
    },
  })
  input.recordTrace(input.run, {
    kind: 'assistant',
    title: 'Assistant message created',
    summary: assistant.content.slice(0, 180),
    status: 'completed',
    round: finalRound,
    stepId: step.id,
    data: { messageId: assistant.id, chars: assistant.content.length, content: assistant.content, source: 'runtime_rule' },
  })

  const completedAt = input.now()
  applyRunCompletion(input.run, {
    now: completedAt,
    assistantMessageId: assistant.id,
    warnings: input.warnings,
    metadataPatch: {
      memoryIds: input.memories.map((memory) => memory.id),
      writtenMemoryIds: [],
    },
  })
  input.recordTrace(input.run, {
    kind: 'run',
    title: 'Run finished',
    summary: `Run ${input.run.status}; no model gateway call was needed.`,
    status: input.run.warnings && input.run.warnings.length > 0 ? 'info' : 'completed',
    round: finalRound,
    data: { status: input.run.status, warningCount: input.run.warnings?.length ?? 0, modelGatewayCalled: false },
  })
  projectRunOntoThread(input.thread, input.run)
  input.thread.updatedAt = input.run.updatedAt
  applyRuntimeThreadContextSummary({ thread: input.thread, run: input.run, now: input.now() })
  input.store.updateThread(input.thread)
  input.store.updateRun(input.run)
  input.emitAssistantMessage(input.run, assistant)
  input.emitRunSnapshot(input.run, { done: true })
  return assistant
}

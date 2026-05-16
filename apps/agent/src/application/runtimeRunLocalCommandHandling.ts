import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import { memoryStorePath, type AgentMemoryStore } from '../memory/memoryStore.js'
import type { AgentMemory } from '../memory/types.js'
import type { MCPClient } from '../mcpClient.js'
import type { AgentCatalogToolManager } from '../orchestration/toolExecutor.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { AgentRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import { applyRuntimeLocalCommandDispatch, type RuntimeLocalCommandTraceInput } from './runtimeLocalCommandDispatch.js'
import { executeRuntimeLocalGenerationTool } from './runtimeLocalGenerationToolExecution.js'
import type { RuntimeRunSetupResolution } from './runtimeRunSetupResolution.js'

export interface RuntimeRunLocalCommandHandlingTraceInput {
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

export async function applyRuntimeRunLocalCommandHandling(input: {
  store: Pick<AgentStore, 'updateRun' | 'updateThread'>
  run: AgentRun
  thread: AgentThread
  command: AgentCommandRuntime
  setup: Pick<RuntimeRunSetupResolution, 'activeManifest' | 'skills' | 'layers' | 'capabilities' | 'debugContext'>
  memories: AgentMemory[]
  history: AgentMessage[]
  userMessage: string
  memoryStore: AgentMemoryStore
  contractResolver: AgentRuntimeContractResolver
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  memoryManager: MemoryManager
  knowledgeManager: KnowledgeManager
  catalogManager: AgentCatalogToolManager
  signal?: AbortSignal
  now: () => string
  timestampMs: () => number
  recordTrace: (run: AgentRun, trace: RuntimeRunLocalCommandHandlingTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): Promise<boolean> {
  const setup = input.setup
  return applyRuntimeLocalCommandDispatch({
    store: input.store,
    run: input.run,
    thread: input.thread,
    command: input.command,
    manifest: setup.activeManifest,
    skills: setup.skills,
    ...(setup.layers?.skillDiscovery ? { skillDiscovery: setup.layers.skillDiscovery } : {}),
    context: setup.debugContext,
    tools: setup.capabilities.resolvedTools,
    policy: input.run.policy,
    memories: input.memories,
    warnings: [...setup.capabilities.warnings],
    history: input.history,
    userMessage: input.userMessage,
    memoryStorePath: memoryStorePath(input.memoryStore),
    contractResolver: input.contractResolver,
    now: input.now,
    timestampMs: input.timestampMs,
    executeGenerationTool: (call) => executeRuntimeLocalGenerationTool({
      call,
      run: input.run,
      mcpClient: input.mcpClient,
      draftStore: input.draftStore,
      backendApplyClient: input.backendApplyClient,
      registry: input.catalogSnapshot.toolRegistry,
      memoryManager: input.memoryManager,
      knowledgeManager: input.knowledgeManager,
      catalogManager: input.catalogManager,
      signal: input.signal,
    }),
    recordTrace: input.recordTrace as (run: AgentRun, trace: RuntimeLocalCommandTraceInput) => void,
    createStep: input.createStep,
    emitAssistantMessage: input.emitAssistantMessage,
    emitRunSnapshot: input.emitRunSnapshot,
  })
}

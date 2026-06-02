import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import type { AgentWorkspaceStore } from '../../../../workspaces/store/workspaceStore.js'
import type { ReferenceManager } from '../../../../reference/manager/referenceManager.js'
import type { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import { memoryStorePath, type AgentMemoryStore } from '../../../../memory/store/in-memory/memoryStore.js'
import type { AgentMemory } from '../../../../memory/shared/types.js'
import type { AgentCatalogToolManager } from '../../../../orchestration/tools/execution/executor/toolExecutor.js'
import type { AgentRunRoundInfo } from '../../../../state/run/core/round/runRound.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../../../../state/shared/types.js'
import type { AgentCommandRuntime } from '../../../../context/command/commandRouter.js'
import type { AgentRuntimeCatalogSnapshot } from '../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import { applyRuntimeLocalCommandDispatch, type RuntimeLocalCommandTraceInput } from '../../../local-command/dispatch/runtimeLocalCommandDispatch.js'
import { executeRuntimeLocalGenerationTool } from '../../../local-command/generation/tool/runtimeLocalGenerationToolExecution.js'
import type { RuntimeRunSetupResolution } from '../setup/resolution/runtimeRunSetupResolution.js'
import type { WorkspaceApplyPort } from '../../../../ports/workspace/apply/workspaceApplyPort.js'
import type { WorkspaceApplyPreviewPort } from '../../../../ports/workspace/preview/workspaceApplyPreviewPort.js'
import type { WorkspaceWorkspaceSnapshotHydrationPort } from '../../../../ports/workspace/hydration/workspaceSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../../ports/media/videoFrameExtractionPort.js'
import type { ProjectStandardsPort } from '../../../../ports/project/projectStandardsPort.js'
import type { RuntimeToolHandlerRegistry } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../../../../ports/tools/externalToolGatewayPort.js'

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
  workspaceStore: AgentWorkspaceStore
  externalToolGatewayPort: ExternalToolGatewayPort
  workspaceApplyPort: WorkspaceApplyPort
  workspaceApplyPreviewPort: WorkspaceApplyPreviewPort
  workspaceSnapshotHydrationPort: WorkspaceWorkspaceSnapshotHydrationPort
  resourceFilePort: CoreResourceFilePort
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  projectStandardsPort: ProjectStandardsPort
  memoryManager: MemoryManager
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  referenceManager: ReferenceManager
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
    runtimeLimits: input.run.runtimeLimits,
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
      workspaceStore: input.workspaceStore,
      externalToolGatewayPort: input.externalToolGatewayPort,
      workspaceApplyPort: input.workspaceApplyPort,
      workspaceApplyPreviewPort: input.workspaceApplyPreviewPort,
      workspaceSnapshotHydrationPort: input.workspaceSnapshotHydrationPort,
      resourceFilePort: input.resourceFilePort,
      imageProcessingPort: input.imageProcessingPort,
      videoFrameExtractionPort: input.videoFrameExtractionPort,
      projectStandardsPort: input.projectStandardsPort,
      registry: input.catalogSnapshot.toolRegistry,
      runtimeToolHandlers: input.runtimeToolHandlers,
      memoryManager: input.memoryManager,
      referenceManager: input.referenceManager,
      catalogManager: input.catalogManager,
      signal: input.signal,
    }),
    recordTrace: input.recordTrace as (run: AgentRun, trace: RuntimeLocalCommandTraceInput) => void,
    createStep: input.createStep,
    emitAssistantMessage: input.emitAssistantMessage,
    emitRunSnapshot: input.emitRunSnapshot,
  })
}

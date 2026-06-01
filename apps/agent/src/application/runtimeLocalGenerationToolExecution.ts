import { generationBackendErrorData } from '../generation/generationBackendError.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import {
  executeTool,
  type AgentCatalogToolManager,
  type ToolExecutionResult,
} from '../orchestration/toolExecutor.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { AgentRun, JSONValue } from '../state/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { DraftApplyPort } from '../ports/draft/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../ports/draft/draftApplyPreviewPort.js'
import type { DraftProposalSnapshotHydrationPort } from '../ports/draft/proposalSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../ports/core/resourceFilePort.js'
import type { CoreVideoFrameExtractionPort } from '../ports/core/videoFrameExtractionPort.js'
import type { MovscriptProjectStandardsPort } from '../ports/movscript/projectStandardsPort.js'
import type { RuntimeToolHandlerRegistry } from '../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../ports/tools/externalToolGatewayPort.js'

export type RuntimeLocalGenerationToolCall = {
  name: 'core_work_start'
  args: Record<string, JSONValue>
}

export async function executeRuntimeLocalGenerationTool(input: {
  call: RuntimeLocalGenerationToolCall
  run: AgentRun
  draftStore: AgentDraftStore
  externalToolGatewayPort: ExternalToolGatewayPort
  draftApplyPort: DraftApplyPort
  draftApplyPreviewPort: DraftApplyPreviewPort
  proposalSnapshotHydrationPort: DraftProposalSnapshotHydrationPort
  resourceFilePort: CoreResourceFilePort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  projectStandardsPort: MovscriptProjectStandardsPort
  registry: ToolRegistry
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  memoryManager?: MemoryManager
  knowledgeManager?: KnowledgeManager
  catalogManager?: AgentCatalogToolManager
  signal?: AbortSignal
}): Promise<ToolExecutionResult> {
  try {
    return await executeTool(input.call, {
      run: input.run,
      draftStore: input.draftStore,
      externalToolGatewayPort: input.externalToolGatewayPort,
      draftApplyPort: input.draftApplyPort,
      draftApplyPreviewPort: input.draftApplyPreviewPort,
      proposalSnapshotHydrationPort: input.proposalSnapshotHydrationPort,
      resourceFilePort: input.resourceFilePort,
      videoFrameExtractionPort: input.videoFrameExtractionPort,
      projectStandardsPort: input.projectStandardsPort,
      registry: input.registry,
      runtimeToolHandlers: input.runtimeToolHandlers,
      ...(input.memoryManager ? { memoryManager: input.memoryManager } : {}),
      ...(input.knowledgeManager ? { knowledgeManager: input.knowledgeManager } : {}),
      ...(input.catalogManager ? { catalogManager: input.catalogManager } : {}),
      sandboxMode: input.run.policy.sandboxMode === true,
      signal: input.signal,
    })
  } catch (error) {
    return normalizeRuntimeLocalGenerationToolError(input.call, error)
  }
}

export function normalizeRuntimeLocalGenerationToolError(
  call: RuntimeLocalGenerationToolCall,
  error: unknown,
): ToolExecutionResult {
  const errorData = generationBackendErrorData(error)
  return {
    call,
    error: error instanceof Error ? error.message : String(error),
    ...(errorData !== undefined ? { errorData } : {}),
    source: 'mcp',
  }
}

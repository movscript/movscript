import { generationBackendErrorData } from '../../../../generation/errors/generationBackendError.js'
import type { ReferenceManager } from '../../../../reference/manager/referenceManager.js'
import type { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import {
  executeTool,
  type AgentCatalogToolManager,
  type ToolExecutionResult,
} from '../../../../orchestration/tools/execution/executor/toolExecutor.js'
import type { AgentDraftStore } from '../../../../drafts/store/draftStore.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { DraftApplyPort } from '../../../../ports/draft/apply/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../../../../ports/draft/preview/draftApplyPreviewPort.js'
import type { DraftProposalSnapshotHydrationPort } from '../../../../ports/draft/hydration/proposalSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../../ports/media/videoFrameExtractionPort.js'
import type { ProjectStandardsPort } from '../../../../ports/project/projectStandardsPort.js'
import type { RuntimeToolHandlerRegistry } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../../../../ports/tools/externalToolGatewayPort.js'

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
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  projectStandardsPort: ProjectStandardsPort
  registry: ToolRegistry
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  memoryManager?: MemoryManager
  referenceManager?: ReferenceManager
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
      imageProcessingPort: input.imageProcessingPort,
      videoFrameExtractionPort: input.videoFrameExtractionPort,
      projectStandardsPort: input.projectStandardsPort,
      registry: input.registry,
      runtimeToolHandlers: input.runtimeToolHandlers,
      ...(input.memoryManager ? { memoryManager: input.memoryManager } : {}),
      ...(input.referenceManager ? { referenceManager: input.referenceManager } : {}),
      ...(input.catalogManager ? { catalogManager: input.catalogManager } : {}),
      sandboxMode: input.run.runtimeLimits.sandboxMode === true,
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

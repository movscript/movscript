import type { JSONValue } from '../../../../state/shared/types.js'
import type { AgentRun, ToolCall } from '../../../../state/shared/types.js'
import type { AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentDraftStore } from '../../../../drafts/store/draftStore.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import type { DraftApplyPort } from '../../../../ports/draft/apply/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../../../../ports/draft/preview/draftApplyPreviewPort.js'
import type { DraftProposalSnapshotHydrationPort } from '../../../../ports/draft/hydration/proposalSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../../ports/media/videoFrameExtractionPort.js'
import type { ProjectStandardsPort } from '../../../../ports/project/projectStandardsPort.js'
import type { ExternalToolGatewayPort } from '../../../../ports/tools/externalToolGatewayPort.js'
import type { ToolSource } from '../../../../ports/tools/toolExecutionSource.js'
import type { ReferenceManager } from '../../../../reference/manager/referenceManager.js'
import type { AgentRuntimeLimits, AgentRunRole, ResolvedToolCatalog } from '../../../../state/shared/types.js'
import type { AgentFileSystem } from '../../../../files/core/system/agentFileSystem.js'
import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import {
  type AgentCatalogToolManager,
  type RuntimeToolHandlerRegistry,
} from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import { runToolExecutionPipeline, type ToolExecutionPipelineSnapshot } from '../pipeline/toolExecutionPipeline.js'

export type {
  AgentCatalogToolManager,
  RuntimeToolHandlerRegistry,
} from '../../../../ports/runtime/runtimeToolHandlerPort.js'

export type { ToolSource } from '../../../../ports/tools/toolExecutionSource.js'

export interface ToolExecutionResult {
  call: ToolCall
  result?: JSONValue
  error?: string
  errorData?: JSONValue
  sandboxed?: boolean
  source: ToolSource
  pipeline?: ToolExecutionPipelineSnapshot
  supplementalMessages?: RuntimeModelChatMessage[]
}

export interface ToolExecutorOptions {
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
  fileSystem?: AgentFileSystem
  registry: ToolRegistry
  memoryManager?: MemoryManager
  referenceManager?: ReferenceManager
  catalogManager?: AgentCatalogToolManager
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  sandboxMode: boolean
  permissionGate?: {
    currentProjectId?: number
    manifest: AgentManifest
    catalog: ResolvedToolCatalog
    approvedToolNames?: string[]
    approvalMode: AgentRuntimeLimits['approvalMode']
    runRole?: AgentRunRole
  }
  signal?: AbortSignal
}

export async function executeTool(call: ToolCall, options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  return runToolExecutionPipeline(call, options)
}

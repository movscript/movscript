import type { JSONValue } from '../../../../state/shared/types.js'
import type { AgentRun, ToolCall } from '../../../../state/shared/types.js'
import type { AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentWorkspaceStore } from '../../../../workspaces/store/workspaceStore.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import type { WorkspaceApplyPort } from '../../../../ports/workspace/apply/workspaceApplyPort.js'
import type { WorkspaceApplyPreviewPort } from '../../../../ports/workspace/preview/workspaceApplyPreviewPort.js'
import type { WorkspaceWorkspaceSnapshotHydrationPort } from '../../../../ports/workspace/hydration/workspaceSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../../ports/media/videoFrameExtractionPort.js'
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
  workspaceStore: AgentWorkspaceStore
  externalToolGatewayPort: ExternalToolGatewayPort
  workspaceApplyPort: WorkspaceApplyPort
  workspaceApplyPreviewPort: WorkspaceApplyPreviewPort
  workspaceSnapshotHydrationPort: WorkspaceWorkspaceSnapshotHydrationPort
  resourceFilePort: CoreResourceFilePort
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
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

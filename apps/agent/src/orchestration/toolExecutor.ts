import type { JSONValue } from '../state/types.js'
import type { AgentRun, ToolCall } from '../state/types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { DraftApplyPort } from '../ports/draft/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../ports/draft/draftApplyPreviewPort.js'
import type { DraftProposalSnapshotHydrationPort } from '../ports/draft/proposalSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../ports/core/resourceFilePort.js'
import type { CoreVideoFrameExtractionPort } from '../ports/core/videoFrameExtractionPort.js'
import type { MovscriptProjectStandardsPort } from '../ports/movscript/projectStandardsPort.js'
import type { ExternalToolGatewayPort } from '../ports/tools/externalToolGatewayPort.js'
import type { ToolSource } from '../ports/tools/toolExecutionSource.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { AgentRunPolicy, AgentRunRole, ResolvedToolCatalog } from '../state/types.js'
import type { AgentFileSystem } from '../files/agentFileSystem.js'
import type { RuntimeModelChatMessage } from '../model/modelConfig.js'
import {
  type AgentCatalogToolManager,
  type RuntimeToolHandlerRegistry,
} from '../ports/runtime/runtimeToolHandlerPort.js'
import { runToolExecutionPipeline, type ToolExecutionPipelineSnapshot } from './toolExecutionPipeline.js'

export type {
  AgentCatalogToolManager,
  RuntimeToolHandlerRegistry,
} from '../ports/runtime/runtimeToolHandlerPort.js'

export type { ToolSource } from '../ports/tools/toolExecutionSource.js'

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
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  projectStandardsPort: MovscriptProjectStandardsPort
  fileSystem?: AgentFileSystem
  registry: ToolRegistry
  memoryManager?: MemoryManager
  knowledgeManager?: KnowledgeManager
  catalogManager?: AgentCatalogToolManager
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  sandboxMode: boolean
  policyGate?: {
    currentProjectId?: number
    manifest: AgentManifest
    catalog: ResolvedToolCatalog
    approvedToolNames?: string[]
    approvalMode: AgentRunPolicy['approvalMode']
    runRole?: AgentRunRole
  }
  signal?: AbortSignal
}

export async function executeTool(call: ToolCall, options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  return runToolExecutionPipeline(call, options)
}

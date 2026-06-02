import type { AgentDraftStore } from '../../drafts/store/draftStore.js'
import type { AgentFileSystem } from '../../files/core/system/agentFileSystem.js'
import type { MemoryManager } from '../../memory/manager/memoryManager.js'
import type { ReferenceManager } from '../../reference/manager/referenceManager.js'
import type { AgentRun, JSONValue, ToolCall } from '../../state/shared/types.js'
import type { ToolRegistry } from '../../tools/registry/core/toolRegistry.js'
import type { RuntimeModelChatMessage } from '../../model/config/modelConfig.js'
import type { DraftApplyPort } from '../draft/apply/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../draft/preview/draftApplyPreviewPort.js'
import type { DraftProposalSnapshotHydrationPort } from '../draft/hydration/proposalSnapshotHydrationPort.js'
import type { CoreImageProcessingPort } from '../media/imageProcessingPort.js'
import type { CoreResourceFilePort } from '../files/resourceFilePort.js'
import type { CoreVideoFrameExtractionPort } from '../media/videoFrameExtractionPort.js'
import type { ProjectStandardsPort } from '../project/projectStandardsPort.js'

export interface RuntimeToolHandlerResult {
  result: JSONValue
  supplementalMessages?: RuntimeModelChatMessage[]
}

export interface RuntimeToolHandlerContext {
  call: ToolCall
  args: Record<string, JSONValue>
  run: AgentRun
  draftStore: AgentDraftStore
  draftApplyPort: DraftApplyPort
  draftApplyPreviewPort: DraftApplyPreviewPort
  proposalSnapshotHydrationPort: DraftProposalSnapshotHydrationPort
  resourceFilePort: CoreResourceFilePort
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  projectStandardsPort: ProjectStandardsPort
  fileSystem: AgentFileSystem
  registry: ToolRegistry
  memoryManager?: MemoryManager
  referenceManager?: ReferenceManager
  catalogManager?: AgentCatalogToolManager
  sandboxMode: boolean
  signal?: AbortSignal
}

export interface RuntimeToolHandler {
  readonly toolNames: readonly string[]
  execute(context: RuntimeToolHandlerContext): Promise<RuntimeToolHandlerResult | undefined> | RuntimeToolHandlerResult | undefined
}

export interface AgentCatalogToolManager {
  inspectAgentCatalog(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  updateActiveSkills(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  updatePlan(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  startWork(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
  getWork(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  listWork(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  waitWork(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
  cancelWork(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
}

export interface RuntimeToolHandlerRegistry {
  get(toolName: string): RuntimeToolHandler | undefined
}

export function createRuntimeToolHandlerRegistry(handlers: RuntimeToolHandler[]): RuntimeToolHandlerRegistry {
  const byName = new Map<string, RuntimeToolHandler>()
  for (const handler of handlers) {
    for (const toolName of handler.toolNames) {
      if (byName.has(toolName)) {
        throw new Error(`duplicate runtime tool handler for ${toolName}`)
      }
      byName.set(toolName, handler)
    }
  }
  return {
    get(toolName: string): RuntimeToolHandler | undefined {
      return byName.get(toolName)
    },
  }
}

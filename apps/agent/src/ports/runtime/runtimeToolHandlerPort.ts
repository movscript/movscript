import type { AgentFileSystem } from '../../files/core/system/agentFileSystem.js'
import type { MemoryManager } from '../../memory/manager/memoryManager.js'
import type { AgentRun, JSONValue, ToolCall } from '../../state/shared/types.js'
import type { ToolRegistry } from '../../tools/registry/core/toolRegistry.js'
import type { RuntimeModelChatMessage } from '../../model/config/modelConfig.js'
import type { CoreImageProcessingPort } from '../media/imageProcessingPort.js'
import type { CoreResourceFilePort } from '../files/resourceFilePort.js'
import type { CoreVideoFrameExtractionPort } from '../media/videoFrameExtractionPort.js'
import type { RegisteredTool } from '../../tools/registry/core/toolRegistry.js'

export type RuntimeToolExposure = 'direct' | 'deferred' | 'direct_model_only' | 'hidden'

export interface RuntimeToolHandlerResult {
  result: JSONValue
  supplementalMessages?: RuntimeModelChatMessage[]
}

export interface RuntimeToolHandlerContext {
  call: ToolCall
  args: Record<string, JSONValue>
  run: AgentRun
  resourceFilePort: CoreResourceFilePort
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  fileSystem: AgentFileSystem
  registry: ToolRegistry
  memoryManager?: MemoryManager
  catalogManager?: AgentCatalogToolManager
  sandboxMode: boolean
  signal?: AbortSignal
}

export interface RuntimeToolHandler {
  readonly toolNames: readonly string[]
  readonly toolDefinitions?: readonly RegisteredTool[]
  readonly exposure?: RuntimeToolExposure
  readonly supportsParallelToolCalls?: boolean
  execute(context: RuntimeToolHandlerContext): Promise<RuntimeToolHandlerResult | undefined> | RuntimeToolHandlerResult | undefined
}

export interface RuntimeToolExecutor {
  readonly toolName: string
  readonly definition?: RegisteredTool
  readonly exposure: RuntimeToolExposure
  readonly supportsParallelToolCalls: boolean
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
  get(toolName: string): RuntimeToolExecutor | undefined
  listExecutors(): RuntimeToolExecutor[]
}

export function createRuntimeToolHandlerRegistry(handlers: RuntimeToolHandler[]): RuntimeToolHandlerRegistry {
  const byName = new Map<string, RuntimeToolExecutor>()
  for (const handler of handlers) {
    for (const toolName of handler.toolNames) {
      if (byName.has(toolName)) {
        throw new Error(`duplicate runtime tool handler for ${toolName}`)
      }
      byName.set(toolName, runtimeToolExecutorFromHandler(handler, toolName))
    }
  }
  return {
    get(toolName: string): RuntimeToolExecutor | undefined {
      return byName.get(toolName)
    },
    listExecutors(): RuntimeToolExecutor[] {
      return Array.from(byName.values())
    },
  }
}

function runtimeToolExecutorFromHandler(handler: RuntimeToolHandler, toolName: string): RuntimeToolExecutor {
  return {
    toolName,
    definition: handler.toolDefinitions?.find((definition) => definition.name === toolName),
    exposure: handler.exposure ?? 'direct',
    supportsParallelToolCalls: handler.supportsParallelToolCalls ?? false,
    execute(context) {
      return handler.execute(context)
    },
  }
}

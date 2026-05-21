import { generationBackendErrorData } from '../generation/generationBackendError.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { MCPClient } from '../mcpClient.js'
import {
  executeTool,
  type AgentCatalogToolManager,
  type ToolExecutionResult,
} from '../orchestration/toolExecutor.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { AgentRun, JSONValue } from '../state/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'

export type RuntimeLocalGenerationToolCall = {
  name: 'agent_io_start' | 'agent_io_wait' | 'agent_io_get'
  args: Record<string, JSONValue>
}

export async function executeRuntimeLocalGenerationTool(input: {
  call: RuntimeLocalGenerationToolCall
  run: AgentRun
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  registry: ToolRegistry
  memoryManager?: MemoryManager
  knowledgeManager?: KnowledgeManager
  catalogManager?: AgentCatalogToolManager
  signal?: AbortSignal
}): Promise<ToolExecutionResult> {
  try {
    return await executeTool(input.call, {
      run: input.run,
      mcpClient: input.mcpClient,
      draftStore: input.draftStore,
      backendApplyClient: input.backendApplyClient,
      registry: input.registry,
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

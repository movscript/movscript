import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentMemoryStore } from '../memory/memoryStore.js'
import type { AgentMemory, MemoryQuery } from '../memory/types.js'
import {
  createRuntimeMemory,
  deleteRuntimeMemory,
  getRuntimeMemory,
  listRuntimeMemories,
  listRuntimeMemorySummaries,
} from './runtimeMemoryOperations.js'

export interface RuntimeMemoryOperationsBridge {
  listMemories: (query: MemoryQuery) => AgentMemory[]
  listMemorySummaries: (query: Parameters<MemoryManager['listMemorySummaries']>[0]) => ReturnType<MemoryManager['listMemorySummaries']>
  getMemory: (projectId: number, id: string) => AgentMemory | undefined
  createMemory: (input: Parameters<AgentMemoryStore['createMemory']>[0]) => AgentMemory
  deleteMemory: (projectId: number, id: string) => boolean
}

export function createRuntimeMemoryOperationsBridge(input: {
  memoryStore: AgentMemoryStore
  memoryManager: MemoryManager
}): RuntimeMemoryOperationsBridge {
  return {
    listMemories: (query) => listRuntimeMemories({ memoryStore: input.memoryStore, query }),
    listMemorySummaries: (query) => listRuntimeMemorySummaries({ memoryManager: input.memoryManager, query }),
    getMemory: (projectId, id) => getRuntimeMemory({ memoryManager: input.memoryManager, projectId, id }),
    createMemory: (memoryInput) => createRuntimeMemory({ memoryManager: input.memoryManager, memoryInput }),
    deleteMemory: (projectId, id) => deleteRuntimeMemory({ memoryManager: input.memoryManager, projectId, id }),
  }
}

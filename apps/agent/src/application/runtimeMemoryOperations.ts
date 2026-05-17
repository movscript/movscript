import type { MemoryManager } from '../memory/memoryManager.js'
import { isValidMemoryProjectId, type AgentMemory, type MemoryQuery } from '../memory/types.js'
import type { AgentMemoryStore } from '../memory/memoryStore.js'

export function listRuntimeMemories(input: {
  memoryStore: AgentMemoryStore
  query: MemoryQuery
}): AgentMemory[] {
  return input.memoryStore.listMemories(input.query)
}

export function listRuntimeMemorySummaries(input: {
  memoryManager: MemoryManager
  query: Parameters<MemoryManager['listMemorySummaries']>[0]
}): ReturnType<MemoryManager['listMemorySummaries']> {
  return input.memoryManager.listMemorySummaries(input.query)
}

export function getRuntimeMemory(input: {
  memoryManager: MemoryManager
  projectId: number
  id: string
}): AgentMemory | undefined {
  if (!isValidMemoryProjectId(input.projectId)) return undefined
  return input.memoryManager.getMemory({ projectId: input.projectId, id: input.id })
}

export function createRuntimeMemory(input: {
  memoryManager: MemoryManager
  memoryInput: Parameters<AgentMemoryStore['createMemory']>[0]
}): AgentMemory {
  return input.memoryManager.createMemory(input.memoryInput)
}

export function deleteRuntimeMemory(input: {
  memoryManager: MemoryManager
  projectId: number
  id: string
}): boolean {
  if (!isValidMemoryProjectId(input.projectId)) return false
  return input.memoryManager.deleteMemory({ projectId: input.projectId, id: input.id })
}

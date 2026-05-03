import type { AgentMemory, CreateMemoryInput, MemoryQuery } from './types.js'

export interface AgentMemoryStore {
  listMemories(query?: MemoryQuery): AgentMemory[]
  getMemory(id: string): AgentMemory | undefined
  createMemory(input: CreateMemoryInput): AgentMemory
  deleteMemory(id: string): boolean
}

export class InMemoryAgentMemoryStore implements AgentMemoryStore {
  private readonly memories = new Map<string, AgentMemory>()

  listMemories(query: MemoryQuery = {}): AgentMemory[] {
    return Array.from(this.memories.values())
      .filter((memory) => matchesQuery(memory, query))
      .map((memory) => clone(memory))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getMemory(id: string): AgentMemory | undefined {
    const memory = this.memories.get(id)
    return memory ? clone(memory) : undefined
  }

  createMemory(input: CreateMemoryInput): AgentMemory {
    const now = new Date().toISOString()
    const memory: AgentMemory = {
      id: makeId('mem'),
      scope: input.scope,
      ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      kind: input.kind,
      content: input.content.trim(),
      ...(input.sourceRunId ? { sourceRunId: input.sourceRunId } : {}),
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      createdAt: now,
      updatedAt: now,
    }
    this.memories.set(memory.id, clone(memory))
    return memory
  }

  deleteMemory(id: string): boolean {
    return this.memories.delete(id)
  }

  protected replaceMemories(memories: AgentMemory[]): void {
    this.memories.clear()
    for (const memory of memories) this.memories.set(memory.id, clone(memory))
  }
}

export function matchesQuery(memory: AgentMemory, query: MemoryQuery): boolean {
  if (query.scope && memory.scope !== query.scope) return false
  if (typeof query.projectId === 'number' && memory.projectId !== query.projectId) return false
  if (query.threadId && memory.threadId !== query.threadId) return false
  if (query.kind && memory.kind !== query.kind) return false
  return true
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

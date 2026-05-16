import type { AgentMemory, CreateMemoryInput, MemoryQuery } from './types.js'

export interface AgentMemoryStore {
  listMemories(query?: MemoryQuery): AgentMemory[]
  getMemory(id: string): AgentMemory | undefined
  createMemory(input: CreateMemoryInput): AgentMemory
  deleteMemory(id: string): boolean
}

export class InMemoryAgentMemoryStore implements AgentMemoryStore {
  private readonly memories = new Map<string, AgentMemory>()

  listMemories(query: MemoryQuery): AgentMemory[] {
    const limit = typeof query.limit === 'number' && Number.isFinite(query.limit)
      ? Math.max(1, Math.min(100, Math.floor(query.limit)))
      : undefined
    return Array.from(this.memories.values())
      .filter((memory) => matchesQuery(memory, query))
      .map((memory) => clone(memory))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
  }

  getMemory(id: string): AgentMemory | undefined {
    const memory = this.memories.get(id)
    return memory ? clone(memory) : undefined
  }

  createMemory(input: CreateMemoryInput): AgentMemory {
    const now = new Date().toISOString()
    const memory: AgentMemory = {
      id: makeId('mem'),
      projectId: input.projectId,
      title: input.title.trim(),
      kind: input.kind,
      content: input.content.trim(),
      ...(input.sourceThreadId ? { sourceThreadId: input.sourceThreadId } : {}),
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

  protected snapshotMemories(): AgentMemory[] {
    return Array.from(this.memories.values())
      .map((memory) => clone(memory))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}

export function memoryStorePath(store: AgentMemoryStore): string | undefined {
  const candidate = store as { filePath?: unknown }
  return typeof candidate.filePath === 'string' && candidate.filePath.trim()
    ? candidate.filePath
    : undefined
}

export function matchesQuery(memory: AgentMemory, query: MemoryQuery): boolean {
  if (memory.projectId !== query.projectId) return false
  if (query.kind && memory.kind !== query.kind) return false
  if (query.query) {
    const haystack = `${memory.title}\n${memory.content}`.toLowerCase()
    const needle = normalizeQueryText(query.query)
    if (needle && haystack.includes(needle)) return true
    const terms = tokenizeSearchText(needle || query.query)
    if (terms.length === 0 || !terms.some((term) => haystack.includes(term))) return false
  }
  return true
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeQueryText(value: string): string {
  return value.trim().replace(/^\/\S+\s+/, '').trim().toLowerCase()
}

function tokenizeSearchText(input: string): string[] {
  if (!input) return []
  const terms = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length >= 2)
  const cjkTerms = Array.from(input.matchAll(/[\p{Script=Han}]{2,}/gu))
    .flatMap((match) => cjkNgrams(match[0]))
  return Array.from(new Set([...terms, ...cjkTerms])).slice(0, 32)
}

function cjkNgrams(input: string): string[] {
  const grams: string[] = []
  for (let size = 2; size <= Math.min(6, input.length); size += 1) {
    for (let index = 0; index <= input.length - size; index += 1) {
      grams.push(input.slice(index, index + size))
    }
  }
  return grams
}

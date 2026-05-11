import { existsSync, readFileSync } from 'node:fs'
import { atomicWriteJSON, resolveAgentMemoryPath } from '../state/fileStore.js'
import type { AgentMemory, CreateMemoryInput } from './types.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from './memoryStore.js'

interface MemoryStateFile {
  version: 2
  memories: AgentMemory[]
}

export class FileAgentMemoryStore extends InMemoryAgentMemoryStore implements AgentMemoryStore {
  readonly filePath: string

  constructor(filePath = resolveAgentMemoryPath()) {
    super()
    this.filePath = filePath
    this.load()
  }

  override createMemory(input: CreateMemoryInput): AgentMemory {
    const memory = super.createMemory(input)
    this.persist()
    return memory
  }

  override deleteMemory(id: string): boolean {
    const deleted = super.deleteMemory(id)
    if (deleted) this.persist()
    return deleted
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<MemoryStateFile & { memories?: unknown[] }>
    this.replaceMemories((parsed.memories ?? []).flatMap((memory) => normalizeMemory(memory)))
  }

  private persist(): void {
    atomicWriteJSON(this.filePath, {
      version: 2,
      memories: this.snapshotMemories(),
    } satisfies MemoryStateFile)
  }
}

function normalizeMemory(memory: unknown): AgentMemory[] {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return []
  const record = memory as Record<string, unknown>
  const projectId = typeof record.projectId === 'number'
    ? record.projectId
    : typeof record.project_id === 'number'
      ? record.project_id
      : undefined
  const title = typeof record.title === 'string' && record.title.trim()
    ? record.title.trim()
    : typeof record.content === 'string' && record.content.trim()
      ? record.content.trim().slice(0, 40)
      : undefined
  const content = typeof record.content === 'string' ? record.content.trim() : undefined
  const kind = normalizeKind(record.kind)
  if (projectId === undefined || !title || !content || !kind) return []
  return [{
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : makeFallbackMemoryId(projectId),
    projectId,
    title,
    kind,
    content,
    ...(typeof record.sourceThreadId === 'string' ? { sourceThreadId: record.sourceThreadId } : typeof record.threadId === 'string' ? { sourceThreadId: record.threadId } : {}),
    ...(typeof record.sourceRunId === 'string' ? { sourceRunId: record.sourceRunId } : {}),
    ...(typeof record.sourceMessageId === 'string' ? { sourceMessageId: record.sourceMessageId } : {}),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  }]
}

function normalizeKind(value: unknown): AgentMemory['kind'] | undefined {
  return value === 'preference'
    || value === 'fact'
    || value === 'item_ref'
    || value === 'entity_ref'
    || value === 'draft'
    || value === 'decision'
    || value === 'warning'
    ? value
    : undefined
}

function makeFallbackMemoryId(projectId: number): string {
  return `mem_${projectId.toString(36)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

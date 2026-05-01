import { existsSync, readFileSync } from 'node:fs'
import { atomicWriteJSON, resolveAgentMemoryPath } from '../fileStore.js'
import type { AgentMemory, CreateMemoryInput } from './types.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from './memoryStore.js'

interface MemoryStateFile {
  version: 1
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
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<MemoryStateFile>
    this.replaceMemories(parsed.memories ?? [])
  }

  private persist(): void {
    atomicWriteJSON(this.filePath, {
      version: 1,
      memories: this.listMemories(),
    } satisfies MemoryStateFile)
  }
}

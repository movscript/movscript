import type { KnowledgeChunk, KnowledgeCollection } from './types.js'

export interface KnowledgeStore {
  listCollections(): KnowledgeCollection[]
  listChunks(): KnowledgeChunk[]
  getChunk(id: string): KnowledgeChunk | undefined
}

export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly collections: KnowledgeCollection[]
  private readonly chunks: KnowledgeChunk[]
  private readonly chunksById: Map<string, KnowledgeChunk>

  constructor(input: { collections: KnowledgeCollection[]; chunks: KnowledgeChunk[] }) {
    this.collections = input.collections
    this.chunks = input.chunks
    this.chunksById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]))
  }

  listCollections(): KnowledgeCollection[] {
    return this.collections.map((collection) => ({ ...collection, tags: [...collection.tags], chunkIds: [...collection.chunkIds] }))
  }

  listChunks(): KnowledgeChunk[] {
    return this.chunks.map(cloneChunk)
  }

  getChunk(id: string): KnowledgeChunk | undefined {
    const chunk = this.chunksById.get(id)
    return chunk ? cloneChunk(chunk) : undefined
  }
}

export const EMPTY_KNOWLEDGE_STORE = new InMemoryKnowledgeStore({ collections: [], chunks: [] })

function cloneChunk(chunk: KnowledgeChunk): KnowledgeChunk {
  return { ...chunk, tags: [...chunk.tags] }
}

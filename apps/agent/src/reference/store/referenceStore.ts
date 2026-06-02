import type { LocalReferenceChunk, LocalReferenceSet } from '../shared/types.js'

export interface ReferenceStore {
  listLocalReferenceSets(): LocalReferenceSet[]
  listChunks(): LocalReferenceChunk[]
  getChunk(id: string): LocalReferenceChunk | undefined
}

export class InMemoryReferenceStore implements ReferenceStore {
  private readonly referenceSets: LocalReferenceSet[]
  private readonly chunks: LocalReferenceChunk[]
  private readonly chunksById: Map<string, LocalReferenceChunk>

  constructor(input: { referenceSets: LocalReferenceSet[]; chunks: LocalReferenceChunk[] }) {
    this.referenceSets = input.referenceSets
    this.chunks = input.chunks
    this.chunksById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]))
  }

  listLocalReferenceSets(): LocalReferenceSet[] {
    return this.referenceSets.map((referenceSet) => ({
      ...referenceSet,
      tags: [...referenceSet.tags],
      chunkIds: [...referenceSet.chunkIds],
      ...(referenceSet.chunks ? { chunks: referenceSet.chunks.map((chunk) => ({ ...chunk })) } : {}),
    }))
  }

  listChunks(): LocalReferenceChunk[] {
    return this.chunks.map(cloneChunk)
  }

  getChunk(id: string): LocalReferenceChunk | undefined {
    const chunk = this.chunksById.get(id)
    return chunk ? cloneChunk(chunk) : undefined
  }
}

export const EMPTY_REFERENCE_STORE = new InMemoryReferenceStore({ referenceSets: [], chunks: [] })

function cloneChunk(chunk: LocalReferenceChunk): LocalReferenceChunk {
  return { ...chunk, tags: [...chunk.tags] }
}

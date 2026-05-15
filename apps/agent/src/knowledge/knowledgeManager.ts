import type { JSONValue } from '../types.js'
import { searchKnowledgeChunks } from './knowledgeSearch.js'
import type { KnowledgeSearchResult } from './types.js'
import type { KnowledgeStore } from './knowledgeStore.js'

export class KnowledgeManager {
  constructor(private readonly store: KnowledgeStore) {}

  search(input: Record<string, JSONValue>): { results: KnowledgeSearchResult[] } {
    return {
      results: searchKnowledgeChunks({
        chunks: this.store.listChunks(),
        query: stringField(input.query),
        domain: stringField(input.domain),
        tags: stringArray(input.tags),
        limit: numberField(input.limit),
      }),
    }
  }

  get(input: Record<string, JSONValue>): JSONValue {
    const id = stringField(input.id)
    if (!id) throw new Error('get_knowledge requires id')
    const chunk = this.store.getChunk(id)
    if (!chunk) throw new Error(`knowledge chunk not found: ${id}`)
    const maxChars = numberField(input.maxChars) ?? 4000
    const content = chunk.content.slice(0, Math.max(0, maxChars))
    return {
      id: chunk.id,
      collectionId: chunk.collectionId,
      domain: chunk.domain,
      title: chunk.title,
      summary: chunk.summary,
      tags: chunk.tags,
      content,
      contentHash: chunk.contentHash,
      truncated: content.length < chunk.content.length,
      sourcePath: chunk.sourcePath ?? null,
      charCount: chunk.charCount,
    } as unknown as JSONValue
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  return items.length > 0 ? items : undefined
}

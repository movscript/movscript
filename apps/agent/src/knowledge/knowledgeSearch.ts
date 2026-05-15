import type { KnowledgeChunk, KnowledgeSearchResult } from './types.js'

export function searchKnowledgeChunks(input: {
  chunks: KnowledgeChunk[]
  query?: string
  domain?: string
  tags?: string[]
  limit?: number
}): KnowledgeSearchResult[] {
  const queryTokens = tokenize(input.query ?? '')
  const wantedTags = new Set((input.tags ?? []).map((tag) => tag.toLowerCase()))
  const limit = normalizeLimit(input.limit)
  return input.chunks
    .filter((chunk) => !input.domain || chunk.domain === input.domain)
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, wantedTags) }))
    .filter(({ score }) => score > 0 || (queryTokens.length === 0 && wantedTags.size === 0))
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      id: chunk.id,
      collectionId: chunk.collectionId,
      domain: chunk.domain,
      title: chunk.title,
      summary: chunk.summary,
      score,
      tags: [...chunk.tags],
      contentHash: chunk.contentHash,
      ...(chunk.sourcePath ? { sourcePath: chunk.sourcePath } : {}),
      charCount: chunk.charCount,
    }))
}

function scoreChunk(chunk: KnowledgeChunk, queryTokens: string[], wantedTags: Set<string>): number {
  let score = 0
  const haystack = [
    chunk.id,
    chunk.domain,
    chunk.title,
    chunk.summary,
    chunk.tags.join(' '),
    chunk.content.slice(0, 2000),
  ].join(' ').toLowerCase()
  for (const token of queryTokens) {
    if (chunk.tags.some((tag) => tag.toLowerCase() === token)) score += 8
    if (chunk.title.toLowerCase().includes(token)) score += 6
    if (chunk.summary.toLowerCase().includes(token)) score += 4
    if (haystack.includes(token)) score += 1
  }
  for (const tag of wantedTags) {
    if (chunk.tags.some((candidate) => candidate.toLowerCase() === tag)) score += 10
  }
  return score
}

function tokenize(query: string): string[] {
  const normalized = query.toLowerCase().trim()
  if (!normalized) return []
  const ascii = normalized.match(/[a-z0-9_]+/g) ?? []
  const cjk = Array.from(normalized.matchAll(/[\p{Script=Han}]{2,}/gu))
    .flatMap((match) => cjkNgrams(match[0]))
  return Array.from(new Set([...ascii, ...cjk])).filter((token) => token.length > 0)
}

function cjkNgrams(value: string): string[] {
  const chars = Array.from(value)
  const tokens = new Set<string>()
  for (let size = 2; size <= Math.min(4, chars.length); size += 1) {
    for (let index = 0; index <= chars.length - size; index += 1) {
      tokens.add(chars.slice(index, index + size).join(''))
    }
  }
  tokens.add(value)
  return Array.from(tokens)
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 5
  return Math.min(20, Math.max(1, Math.floor(value)))
}

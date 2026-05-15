export interface KnowledgeCollection {
  id: string
  version: string
  domain: string
  name: string
  description?: string
  tags: string[]
  chunkIds: string[]
  chunks?: KnowledgeChunkSummary[]
}

export interface KnowledgeChunkSummary {
  id: string
  title: string
  charCount: number
  contentHash: string
  sourcePath?: string
}

export interface KnowledgeChunk {
  id: string
  collectionId: string
  domain: string
  title: string
  tags: string[]
  summary: string
  content: string
  version?: string
  sourcePath?: string
  contentHash: string
  charCount: number
}

export interface KnowledgeSearchResult {
  id: string
  collectionId: string
  domain: string
  title: string
  summary: string
  score: number
  tags: string[]
  contentHash: string
  sourcePath?: string
  charCount: number
}

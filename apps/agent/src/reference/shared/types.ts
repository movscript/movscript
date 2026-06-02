export interface LocalReferenceSet {
  id: string
  version: string
  domain: string
  name: string
  description?: string
  tags: string[]
  chunkIds: string[]
  chunks?: LocalReferenceChunkSummary[]
}

export interface LocalReferenceChunkSummary {
  id: string
  title: string
  charCount: number
  contentHash: string
  sourcePath?: string
}

export interface LocalReferenceChunk {
  id: string
  localReferenceSetId: string
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

export interface LocalReferenceSearchResult {
  id: string
  localReferenceSetId: string
  domain: string
  title: string
  summary: string
  score: number
  tags: string[]
  contentHash: string
  sourcePath?: string
  charCount: number
}

export type ReferenceKind = 'image' | 'video' | 'text'

export type ReferenceRetrievalMethod = 'keyword' | 'semantic' | 'native'

export interface ReferenceHit {
  id: string
  kind: ReferenceKind
  source: string
  retrievalMethod: ReferenceRetrievalMethod
  title?: string
  summary?: string
  previewUrl?: string
  sourceUrl?: string
  resourceId?: number
  score?: number
  metadata?: Record<string, unknown>
}

export interface ReferenceSearchResponse {
  results: ReferenceHit[]
  warnings?: string[]
}

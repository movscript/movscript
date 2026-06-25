export interface WorkspaceArtifact {
  id: string
  title: string
  kind: string
  status: 'workspace' | 'accepted' | 'rejected' | 'applied' | 'superseded'
  content: string
  metadata?: unknown
  updatedAt?: string
  createdByRunId?: string
  createdByThreadId?: string
}

export interface RawResource {
  ID: number
  id?: number | string
  name?: string
  title?: string
  url?: string
  file_url?: string
  thumbnail_url?: string
  mime_type?: string
  [key: string]: unknown
}

export type SemanticEntityRecord = Record<string, unknown> & {
  ID?: number
  id?: number | string
  name?: string
}

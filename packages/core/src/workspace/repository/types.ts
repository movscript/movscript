import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceDocument,
} from '../domain/index.js'

export interface MovScriptWorkspaceRepositoryFileEntry {
  path: string
  kind: 'file' | 'directory'
  size?: number
  updatedAt?: string
}

export interface MovScriptWorkspaceRepositoryReadResult {
  path: string
  content: string
  size?: number
  updatedAt?: string
}

export interface MovScriptWorkspaceRepositoryWriteInput {
  path: string
  content: string
}

export interface MovScriptWorkspaceRepositoryListResult {
  path: string
  entries: MovScriptWorkspaceRepositoryFileEntry[]
}

export interface MovScriptWorkspaceFileRepository {
  list(input?: { path?: string }): Promise<MovScriptWorkspaceRepositoryListResult>
  read(input: { path: string }): Promise<MovScriptWorkspaceRepositoryReadResult>
  write(input: MovScriptWorkspaceRepositoryWriteInput): Promise<MovScriptWorkspaceRepositoryReadResult>
  delete(input: { path: string }): Promise<void>
}

export interface MovScriptWorkspaceDomainRepository {
  loadDocuments(input?: { path?: string }): Promise<MovScriptWorkspaceDocument[]>
  loadIndex(input?: { path?: string }): Promise<MovScriptWorkspaceDomainIndex>
}

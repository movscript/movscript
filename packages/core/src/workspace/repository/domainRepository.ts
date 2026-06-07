import {
  buildMovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDocument,
} from '../indexer/index.js'
import {
  isMovScriptNonSourceRootDirectory,
  isMovScriptSourcePath,
  normalizeWorkspacePath,
} from '../layout/index.js'
import type {
  MovScriptWorkspaceDomainRepository,
  MovScriptWorkspaceFileRepository,
} from './types.js'

export interface CreateMovScriptWorkspaceDomainRepositoryOptions {
  fileRepository: MovScriptWorkspaceFileRepository
  includeFile?: (path: string) => boolean
}

export function createMovScriptWorkspaceDomainRepository(
  options: CreateMovScriptWorkspaceDomainRepositoryOptions,
): MovScriptWorkspaceDomainRepository {
  const includeFile = options.includeFile ?? defaultWorkspaceDomainFileFilter
  return {
    async loadDocuments(input = {}) {
      return loadWorkspaceDocuments(options.fileRepository, input.path ?? '', includeFile)
    },
    async loadIndex(input = {}) {
      const documents = await loadWorkspaceDocuments(options.fileRepository, input.path ?? '', includeFile)
      return buildMovScriptWorkspaceDomainIndex(documents)
    },
  }
}

async function loadWorkspaceDocuments(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
  includeFile: (path: string) => boolean,
): Promise<MovScriptWorkspaceDocument[]> {
  const out: MovScriptWorkspaceDocument[] = []
  await collectWorkspaceDocuments(fileRepository, normalizeWorkspacePath(rootPath), includeFile, out)
  return out.sort((left, right) => left.path.localeCompare(right.path))
}

async function collectWorkspaceDocuments(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  includeFile: (path: string) => boolean,
  out: MovScriptWorkspaceDocument[],
): Promise<void> {
  const listed = await fileRepository.list({ path })
  for (const entry of listed.entries) {
    if (entry.kind === 'directory') {
      if (!path && isMovScriptNonSourceRootDirectory(entry.path)) continue
      await collectWorkspaceDocuments(fileRepository, entry.path, includeFile, out)
      continue
    }
    if (!includeFile(entry.path)) continue
    const file = await fileRepository.read({ path: entry.path })
    out.push({ path: file.path, data: parseWorkspaceDocument(file.path, file.content) })
  }
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (path.endsWith('.json')) {
    try {
      return JSON.parse(content) as unknown
    } catch {
      return undefined
    }
  }
  return content
}

function defaultWorkspaceDomainFileFilter(path: string): boolean {
  return isMovScriptSourcePath(path)
}

import { createHash } from 'node:crypto'
import {
  buildMovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDocument,
} from '../domain/index.js'
import type { MovScriptWorkspaceFileRepository } from '../repository/types.js'
import {
  MOVSCRIPT_BUILD_CURRENT_DIR,
  MOVSCRIPT_BUILD_INDEXES_DIR,
  MOVSCRIPT_BUILD_MANIFESTS_DIR,
  MOVSCRIPT_DOMAIN_INDEX_PATH,
  MOVSCRIPT_EDIT_DIR,
  normalizeWorkspacePath,
} from '../ontology.js'

export type MovScriptWorkspaceChangeState = 'added' | 'modified' | 'deleted' | 'unchanged'
export type MovScriptWorkspaceIssueSeverity = 'error' | 'warning'

export interface MovScriptWorkspaceChangedFile {
  path: string
  buildPath: string
  state: MovScriptWorkspaceChangeState
  contentHash?: string
  buildContentHash?: string
}

export interface MovScriptWorkspaceReviewIssue {
  path: string
  severity: MovScriptWorkspaceIssueSeverity
  message: string
}

export interface MovScriptWorkspaceChangedEntity {
  entityType: string
  path: string
  id?: string | number
  clientId?: string
  state: MovScriptWorkspaceChangeState
}

export interface MovScriptWorkspaceReviewResult {
  schema: 'movscript.workspace-review.v1'
  operation: 'review'
  basePath: typeof MOVSCRIPT_BUILD_CURRENT_DIR
  editPath: typeof MOVSCRIPT_EDIT_DIR
  createdAt: string
  changedFiles: MovScriptWorkspaceChangedFile[]
  changedEntities: MovScriptWorkspaceChangedEntity[]
  issues: MovScriptWorkspaceReviewIssue[]
  readyToBuild: boolean
  summary: {
    total: number
    added: number
    modified: number
    deleted: number
    errors: number
    warnings: number
  }
}

export interface MovScriptWorkspaceBuildManifest {
  schema: 'movscript.workspace-build.v1'
  buildId: string
  builtAt: string
  source: {
    editPath: typeof MOVSCRIPT_EDIT_DIR
    sourceFileHashes: Record<string, string>
  }
  output: {
    currentPath: typeof MOVSCRIPT_BUILD_CURRENT_DIR
    domainIndexPath: typeof MOVSCRIPT_DOMAIN_INDEX_PATH
  }
  review: MovScriptWorkspaceReviewResult
}

export interface MovScriptWorkspaceBuildResult {
  schema: 'movscript.workspace-build-result.v1'
  operation: 'build'
  status: 'built' | 'failed'
  review: MovScriptWorkspaceReviewResult
  index?: MovScriptWorkspaceDomainIndex
  manifest?: MovScriptWorkspaceBuildManifest
}

export interface MovScriptWorkspaceBuildInput {
  fileRepository: MovScriptWorkspaceFileRepository
  now?: Date
}

interface WorkspaceFileSnapshot {
  path: string
  relativePath: string
  content: string
  hash: string
}

export async function reviewMovScriptBuildWorkspace(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceReviewResult> {
  const now = input.now ?? new Date()
  const editFiles = await loadWorkspaceFileSnapshots(input.fileRepository, MOVSCRIPT_EDIT_DIR)
  const currentFiles = await loadWorkspaceFileSnapshots(input.fileRepository, MOVSCRIPT_BUILD_CURRENT_DIR)
  const changedFiles = diffWorkspaceFiles(editFiles, currentFiles)
  const issues = validateEditableFiles(editFiles)
  const changedEntities = changedEntitiesFromFiles(changedFiles, editFiles)
  const summary = summarizeReview(changedFiles, issues)
  return {
    schema: 'movscript.workspace-review.v1',
    operation: 'review',
    basePath: MOVSCRIPT_BUILD_CURRENT_DIR,
    editPath: MOVSCRIPT_EDIT_DIR,
    createdAt: now.toISOString(),
    changedFiles,
    changedEntities,
    issues,
    readyToBuild: summary.errors === 0,
    summary,
  }
}

export async function buildMovScriptWorkspace(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceBuildResult> {
  const now = input.now ?? new Date()
  const review = await reviewMovScriptBuildWorkspace({ ...input, now })
  if (!review.readyToBuild) {
    return {
      schema: 'movscript.workspace-build-result.v1',
      operation: 'build',
      status: 'failed',
      review,
    }
  }

  const editFiles = await loadWorkspaceFileSnapshots(input.fileRepository, MOVSCRIPT_EDIT_DIR)
  for (const file of editFiles) {
    await input.fileRepository.write({
      path: `${MOVSCRIPT_BUILD_CURRENT_DIR}/${file.relativePath}`,
      content: file.content,
    })
  }

  const documents = editFiles.map((file): MovScriptWorkspaceDocument => ({
    path: file.relativePath,
    data: parseWorkspaceDocument(file.path, file.content),
  }))
  const index = buildMovScriptWorkspaceDomainIndex(documents)
  const buildId = buildIdFor(now)
  const manifest: MovScriptWorkspaceBuildManifest = {
    schema: 'movscript.workspace-build.v1',
    buildId,
    builtAt: now.toISOString(),
    source: {
      editPath: MOVSCRIPT_EDIT_DIR,
      sourceFileHashes: Object.fromEntries(editFiles.map((file) => [file.relativePath, file.hash])),
    },
    output: {
      currentPath: MOVSCRIPT_BUILD_CURRENT_DIR,
      domainIndexPath: MOVSCRIPT_DOMAIN_INDEX_PATH,
    },
    review,
  }

  await input.fileRepository.write({
    path: MOVSCRIPT_DOMAIN_INDEX_PATH,
    content: `${JSON.stringify(serializableDomainIndex(index), null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: `${MOVSCRIPT_BUILD_MANIFESTS_DIR}/${buildId}.json`,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  })

  return {
    schema: 'movscript.workspace-build-result.v1',
    operation: 'build',
    status: 'built',
    review,
    index,
    manifest,
  }
}

async function loadWorkspaceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
): Promise<WorkspaceFileSnapshot[]> {
  const files: WorkspaceFileSnapshot[] = []
  await collectWorkspaceFileSnapshots(fileRepository, rootPath, rootPath, files)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

async function collectWorkspaceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
  path: string,
  out: WorkspaceFileSnapshot[],
): Promise<void> {
  let listed: Awaited<ReturnType<MovScriptWorkspaceFileRepository['list']>>
  try {
    listed = await fileRepository.list({ path })
  } catch {
    return
  }
  for (const entry of listed.entries) {
    if (entry.kind === 'directory') {
      await collectWorkspaceFileSnapshots(fileRepository, rootPath, entry.path, out)
      continue
    }
    if (!isWorkspaceSourceFile(entry.path)) continue
    const file = await fileRepository.read({ path: entry.path })
    const normalizedPath = normalizeWorkspacePath(file.path)
    out.push({
      path: normalizedPath,
      relativePath: relativeWorkspacePath(rootPath, normalizedPath),
      content: file.content,
      hash: contentHash(file.content),
    })
  }
}

function diffWorkspaceFiles(
  editFiles: WorkspaceFileSnapshot[],
  currentFiles: WorkspaceFileSnapshot[],
): MovScriptWorkspaceChangedFile[] {
  const editByRelativePath = new Map(editFiles.map((file) => [file.relativePath, file]))
  const currentByRelativePath = new Map(currentFiles.map((file) => [file.relativePath, file]))
  const keys = [...new Set([...editByRelativePath.keys(), ...currentByRelativePath.keys()])].sort()
  return keys.flatMap((relativePath): MovScriptWorkspaceChangedFile[] => {
    const edit = editByRelativePath.get(relativePath)
    const current = currentByRelativePath.get(relativePath)
    if (edit && !current) {
      return [{
        path: edit.path,
        buildPath: `${MOVSCRIPT_BUILD_CURRENT_DIR}/${relativePath}`,
        state: 'added' as const,
        contentHash: edit.hash,
      }]
    }
    if (!edit && current) {
      return [{
        path: `${MOVSCRIPT_EDIT_DIR}/${relativePath}`,
        buildPath: current.path,
        state: 'deleted' as const,
        buildContentHash: current.hash,
      }]
    }
    if (edit && current && edit.hash !== current.hash) {
      return [{
        path: edit.path,
        buildPath: current.path,
        state: 'modified' as const,
        contentHash: edit.hash,
        buildContentHash: current.hash,
      }]
    }
    return []
  })
}

function validateEditableFiles(files: WorkspaceFileSnapshot[]): MovScriptWorkspaceReviewIssue[] {
  const issues: MovScriptWorkspaceReviewIssue[] = []
  for (const file of files) {
    if (file.path.endsWith('.json')) {
      try {
        JSON.parse(file.content)
      } catch (error) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }
  }
  return issues
}

function changedEntitiesFromFiles(
  changedFiles: MovScriptWorkspaceChangedFile[],
  editFiles: WorkspaceFileSnapshot[],
): MovScriptWorkspaceChangedEntity[] {
  const editByPath = new Map(editFiles.map((file) => [file.path, file]))
  return changedFiles.map((file) => {
    const edit = editByPath.get(file.path)
    const record = edit ? parseWorkspaceDocument(edit.path, edit.content) : undefined
    const entity = isRecord(record) ? record : {}
    return {
      entityType: entityTypeFromFilePath(file.path, entity),
      path: file.path,
      ...(idField(entity.id ?? entity.ID) !== undefined ? { id: idField(entity.id ?? entity.ID) } : {}),
      ...(typeof entity.client_id === 'string' ? { clientId: entity.client_id } : {}),
      state: file.state,
    }
  })
}

function summarizeReview(
  changedFiles: MovScriptWorkspaceChangedFile[],
  issues: MovScriptWorkspaceReviewIssue[],
): MovScriptWorkspaceReviewResult['summary'] {
  return {
    total: changedFiles.length,
    added: changedFiles.filter((file) => file.state === 'added').length,
    modified: changedFiles.filter((file) => file.state === 'modified').length,
    deleted: changedFiles.filter((file) => file.state === 'deleted').length,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  }
}

function serializableDomainIndex(index: MovScriptWorkspaceDomainIndex): Record<string, unknown> {
  const byType: Record<string, unknown[]> = {}
  for (const entity of index.entities) {
    byType[entity.entityType] = [...(byType[entity.entityType] ?? []), {
      path: entity.path,
      index: entity.index,
      ...(entity.id !== undefined ? { id: entity.id } : {}),
      ...(entity.clientId ? { clientId: entity.clientId } : {}),
      ...(entity.schema ? { schema: entity.schema } : {}),
    }]
  }
  return {
    schema: 'movscript.domain-index.v1',
    documents: index.documents.map((document) => ({ path: document.path })),
    entities: index.entities,
    byType,
  }
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (!path.endsWith('.json')) return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}

function entityTypeFromFilePath(path: string, record: Record<string, unknown>): string {
  const schema = typeof record.schema === 'string' ? record.schema : undefined
  if (schema) return schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
  const fileName = path.split('/').pop() ?? path
  const prefix = /^([a-z_]+)_/.exec(fileName)?.[1]
  return prefix ?? fileName.replace(/\.[^.]+$/, '')
}

function relativeWorkspacePath(rootPath: string, path: string): string {
  const root = normalizeWorkspacePath(rootPath)
  const normalized = normalizeWorkspacePath(path)
  return normalized === root ? '' : normalized.replace(new RegExp(`^${escapeRegExp(root)}/?`), '')
}

function isWorkspaceSourceFile(path: string): boolean {
  return path.endsWith('.json') || path.endsWith('.md')
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function buildIdFor(date: Date): string {
  return `build_${date.toISOString().replace(/[^0-9]/g, '')}`
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

import { createHash } from 'node:crypto'
import type {
  MovScriptWorkspaceFileRepository,
} from '@movscript/workspace/repository'
import {
  commitNodeMovScriptGitCheckpoint,
  currentNodeMovScriptGitHead,
  getNodeMovScriptWorkspaceFileRepositoryRoot,
  inspectNodeMovScriptGitWorkspace,
  readNodeMovScriptGitSourceFiles,
} from '@movscript/workspace/node'
import {
  MOVSCRIPT_INTERPRET_CURRENT_DIR,
  isMovScriptNonSourceRootDirectory,
  isMovScriptSourceDocumentPath,
  isMovScriptSourcePath,
  normalizeWorkspacePath,
} from '@movscript/workspace/layout'
import type {
  MovScriptFileSnapshot,
} from '../fileChanges/index.js'

export const MOVSCRIPT_CHECKPOINT_DIR = '.movscript/checkpoints'
export const MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR = `${MOVSCRIPT_CHECKPOINT_DIR}/current/source`
export const MOVSCRIPT_CHECKPOINT_CURRENT_MANIFEST_PATH = `${MOVSCRIPT_CHECKPOINT_DIR}/current/manifest.json`

export interface WorkspaceFileSnapshot extends MovScriptFileSnapshot {
  content: string
}

export interface WorkspaceSourceSnapshot {
  rootPath: string
  mode: 'source'
  files: WorkspaceFileSnapshot[]
}

export interface CheckpointSourceSnapshot {
  basePath: string
  checkpointHash?: string
  source: 'git' | 'snapshot' | 'empty'
  files: WorkspaceFileSnapshot[]
}

export interface CheckpointCommitOptions {
  now: Date
  message: string
  initGitIfMissing?: boolean
}

export interface CheckpointCommitResult {
  id: string
  source: 'git' | 'snapshot'
}

export async function resolveWorkspaceSource(
  fileRepository: MovScriptWorkspaceFileRepository,
): Promise<WorkspaceSourceSnapshot> {
  const sourceFiles = await loadWorkspaceSourceFileSnapshots(fileRepository)
  return { rootPath: '', mode: 'source', files: sourceFiles }
}

export async function loadWorkspaceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
): Promise<WorkspaceFileSnapshot[]> {
  const files: WorkspaceFileSnapshot[] = []
  await collectWorkspaceFileSnapshots(fileRepository, rootPath, rootPath, files)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

export async function loadInterpretedCurrentSourceSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  _sourceMode: WorkspaceSourceSnapshot['mode'],
): Promise<WorkspaceFileSnapshot[]> {
  const files = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_INTERPRET_CURRENT_DIR)
  return files.filter((file) => isMovScriptSourceRelativePath(file.relativePath))
}

export async function loadCheckpointSourceSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  checkpointHash?: string,
): Promise<CheckpointSourceSnapshot> {
  const rootDir = getNodeMovScriptWorkspaceFileRepositoryRoot(fileRepository)
  if (rootDir && (await inspectNodeMovScriptGitWorkspace(rootDir)).insideWorkTree) {
    const gitRef = checkpointHash ?? await currentNodeMovScriptGitHead(rootDir)
    if (gitRef) {
      return {
        basePath: gitRef,
        checkpointHash: gitRef,
        source: 'git',
        files: (await readNodeMovScriptGitSourceFiles(rootDir, gitRef)).map((file) => ({
          path: file.path,
          relativePath: file.path,
          content: file.content,
          hash: contentHash(file.content),
        })),
      }
    }
  }

  const snapshotFiles = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR)
  const normalizedSnapshotFiles = normalizeCheckpointSnapshotFiles(snapshotFiles)
  if (normalizedSnapshotFiles.length > 0) {
    const manifest = await readJsonFile<{ checkpointHash?: string }>(fileRepository, MOVSCRIPT_CHECKPOINT_CURRENT_MANIFEST_PATH)
    return {
      basePath: MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR,
      ...(manifest?.checkpointHash ? { checkpointHash: manifest.checkpointHash } : {}),
      source: 'snapshot',
      files: normalizedSnapshotFiles.filter((file) => isMovScriptSourceRelativePath(file.relativePath)),
    }
  }

  return {
    basePath: 'empty',
    source: 'empty',
    files: [],
  }
}

export async function commitCheckpoint(
  fileRepository: MovScriptWorkspaceFileRepository,
  files: WorkspaceFileSnapshot[],
  options: CheckpointCommitOptions,
): Promise<CheckpointCommitResult> {
  const rootDir = getNodeMovScriptWorkspaceFileRepositoryRoot(fileRepository)
  if (rootDir) {
    const gitState = await inspectNodeMovScriptGitWorkspace(rootDir)
    if (gitState.insideWorkTree || options.initGitIfMissing) {
      const id = await commitNodeMovScriptGitCheckpoint(rootDir, {
        message: options.message,
        initIfMissing: options.initGitIfMissing,
      })
      return { id, source: 'git' }
    }
  }
  const checkpointHash = sha256(files.map((file) => `${file.relativePath}:${file.hash}`).join('\n'))
  await writeSnapshotCheckpoint(fileRepository, files, checkpointHash, options.now)
  return { id: checkpointHash, source: 'snapshot' }
}

export function workspaceSnapshotId(files: readonly WorkspaceFileSnapshot[]): string {
  return files.length === 0 ? 'empty-working-tree' : sha256(files.map((file) => `${file.relativePath}:${file.hash}`).join('\n'))
}

function normalizeCheckpointSnapshotFiles(files: WorkspaceFileSnapshot[]): WorkspaceFileSnapshot[] {
  return files.map((file) => {
    const normalizedPath = normalizeWorkspacePath(file.path)
    const relativePath = normalizedPath
      .replace(new RegExp(`^${escapeRegExp(MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR)}/`), '')
      .replace(/^checkpoints\/current\/source\//, '')
    return {
      ...file,
      relativePath,
    }
  })
}

async function loadWorkspaceSourceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
): Promise<WorkspaceFileSnapshot[]> {
  const files: WorkspaceFileSnapshot[] = []
  await collectWorkspaceFileSnapshots(fileRepository, '', '', files)
  return files
    .filter((file) => isMovScriptSourceRelativePath(file.relativePath))
    .sort((left, right) => left.path.localeCompare(right.path))
}

async function writeSnapshotCheckpoint(
  fileRepository: MovScriptWorkspaceFileRepository,
  files: WorkspaceFileSnapshot[],
  checkpointHash: string,
  now: Date,
): Promise<void> {
  const existingFiles = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR)
  const nextPaths = new Set(files.map((file) => `${MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR}/${file.relativePath}`))
  for (const file of existingFiles) {
    if (!nextPaths.has(file.path)) await fileRepository.delete({ path: file.path })
  }
  for (const file of files) {
    await fileRepository.write({
      path: `${MOVSCRIPT_CHECKPOINT_CURRENT_SOURCE_DIR}/${file.relativePath}`,
      content: file.content,
    })
  }
  await fileRepository.write({
    path: MOVSCRIPT_CHECKPOINT_CURRENT_MANIFEST_PATH,
    content: `${JSON.stringify({
      schema: 'movscript.checkpoint.v1',
      checkpointHash,
      committedAt: now.toISOString(),
      sourceFileHashes: Object.fromEntries(files.map((file) => [file.relativePath, file.hash])),
    }, null, 2)}\n`,
  })
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
      if (rootPath === '' && isMovScriptNonSourceRootDirectory(entry.path)) continue
      await collectWorkspaceFileSnapshots(fileRepository, rootPath, entry.path, out)
      continue
    }
    if (!isMovScriptSourceDocumentPath(entry.path)) continue
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

async function readJsonFile<T>(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
): Promise<T | undefined> {
  try {
    const file = await fileRepository.read({ path })
    return JSON.parse(file.content) as T
  } catch {
    return undefined
  }
}

function relativeWorkspacePath(rootPath: string, path: string): string {
  const root = normalizeWorkspacePath(rootPath)
  const normalized = normalizeWorkspacePath(path)
  if (!root) return normalized
  return normalized === root ? '' : normalized.replace(new RegExp(`^${escapeRegExp(root)}/?`), '')
}

function isMovScriptSourceRelativePath(path: string): boolean {
  return isMovScriptSourcePath(path)
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

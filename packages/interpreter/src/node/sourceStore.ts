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
  MOVSCRIPT_ASSET_INDEX_PATH,
  MOVSCRIPT_DOMAIN_INDEX_PATH,
  MOVSCRIPT_DOMAIN_TREE_PATH,
  MOVSCRIPT_EDITOR_STATE_PATH,
  MOVSCRIPT_INTERPRET_CURRENT_DIR,
  MOVSCRIPT_INTERPRET_MANIFESTS_DIR,
  MOVSCRIPT_RELATION_GRAPH_PATH,
  isMovScriptContentUnitDecisionPath,
  isMovScriptNonSourceRootDirectory,
  isMovScriptSourceDocumentPath,
  isMovScriptSourcePath,
  normalizeWorkspacePath,
} from '@movscript/workspace/layout'
import type {
  MovScriptWorkspaceDomainIndex,
} from '@movscript/workspace/indexer'
import type {
  MovScriptFileSnapshot,
} from '../fileChanges/index.js'
import type {
  MovScriptWorkspaceDerivedArtifacts,
} from '../artifacts/index.js'
import type {
  MovScriptWorkspaceInterpretManifest,
} from './types.js'

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

export interface WorkspaceSourceOptions {
  includeContentUnitDecisionDocuments?: boolean
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
  pathspecs?: readonly string[]
}

export interface CheckpointCommitResult {
  id: string
  source: 'git' | 'snapshot'
}

export async function resolveWorkspaceSource(
  fileRepository: MovScriptWorkspaceFileRepository,
  options: WorkspaceSourceOptions = {},
): Promise<WorkspaceSourceSnapshot> {
  const sourceFiles = filterWorkspaceSourceFiles(
    await loadWorkspaceSourceFileSnapshots(fileRepository),
    options,
  )
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
  options: WorkspaceSourceOptions = {},
): Promise<CheckpointSourceSnapshot> {
  const rootDir = getNodeMovScriptWorkspaceFileRepositoryRoot(fileRepository)
  if (rootDir && (await inspectNodeMovScriptGitWorkspace(rootDir)).insideWorkTree) {
    const gitRef = checkpointHash ?? await currentNodeMovScriptGitHead(rootDir)
    if (gitRef) {
      return {
        basePath: gitRef,
        checkpointHash: gitRef,
        source: 'git',
        files: filterWorkspaceSourceFiles((await readNodeMovScriptGitSourceFiles(rootDir, gitRef)).map((file) => ({
          path: file.path,
          relativePath: file.path,
          content: file.content,
          hash: contentHash(file.content),
        })), options),
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
      files: filterWorkspaceSourceFiles(
        normalizedSnapshotFiles.filter((file) => isMovScriptSourceRelativePath(file.relativePath)),
        options,
      ),
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
        pathspecs: options.pathspecs,
      })
      return { id, source: 'git' }
    }
  }
  const checkpointHash = sha256(files.map((file) => `${file.relativePath}:${file.hash}`).join('\n'))
  await writeSnapshotCheckpoint(fileRepository, files, checkpointHash, options.now)
  return { id: checkpointHash, source: 'snapshot' }
}

export async function writeDebugArtifacts(
  fileRepository: MovScriptWorkspaceFileRepository,
  artifacts: MovScriptWorkspaceDerivedArtifacts,
  index: MovScriptWorkspaceDomainIndex,
  manifest: MovScriptWorkspaceInterpretManifest,
  impactReportPath: string,
): Promise<void> {
  const files = new Map<string, string>()
  for (const document of index.documents) {
    files.set(`${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${normalizeWorkspacePath(document.path)}`, serializeWorkspaceDocument(document.data))
  }
  files.set(MOVSCRIPT_DOMAIN_INDEX_PATH, serializeWorkspaceDocument(index))
  files.set(MOVSCRIPT_DOMAIN_TREE_PATH, serializeWorkspaceDocument(artifacts.domainTree))
  files.set(MOVSCRIPT_ASSET_INDEX_PATH, serializeWorkspaceDocument(artifacts.assetIndex))
  files.set(MOVSCRIPT_RELATION_GRAPH_PATH, serializeWorkspaceDocument(artifacts.relationGraph))
  files.set(MOVSCRIPT_EDITOR_STATE_PATH, serializeWorkspaceDocument({
    schema: 'movscript.editor-state.v1',
    interpretation_id: manifest.interpretationId,
    interpreted_at: manifest.interpretedAt,
    source_status: {
      ready_to_interpret: manifest.review.readyToInterpret ?? true,
      issue_count: manifest.review.issues?.length ?? 0,
    },
    summary: manifest.review.summary,
    contentUnitRuntimePanels: artifacts.contentUnitArtifacts.map(editorStateRuntimePanel),
    content_unit_runtime_panels: artifacts.contentUnitArtifacts.map(editorStateRuntimePanel),
  }))

  for (const previewTimeline of artifacts.previewTimelines) {
    files.set(`${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${normalizeWorkspacePath(previewTimeline.productionPath)}/preview_timeline.json`, serializeWorkspaceDocument(previewTimeline))
  }
  for (const editPlan of artifacts.editPlans) {
    files.set(`${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${normalizeWorkspacePath(editPlan.sceneMomentPath)}/edit_plan.json`, serializeWorkspaceDocument(editPlan))
  }
  for (const bundle of artifacts.contentUnitArtifacts) {
    const contentUnitDir = normalizeWorkspacePath(bundle.contentUnitPath).replace(/\/content_unit\.json$/, '')
    files.set(`${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${contentUnitDir}/runtime_panel.json`, serializeWorkspaceDocument(bundle.runtimePanel))
    files.set(`${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${contentUnitDir}/generation_prompt.json`, serializeWorkspaceDocument(bundle.generationPrompt))
    files.set(`${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${contentUnitDir}/dependency_report.json`, serializeWorkspaceDocument(bundle.dependencyReport))
    files.set(`${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${contentUnitDir}/selection_validity.json`, serializeWorkspaceDocument(bundle.selectionValidity))
  }

  for (const path of await listRepositoryFiles(fileRepository, MOVSCRIPT_INTERPRET_CURRENT_DIR)) {
    if (!files.has(path)) await fileRepository.delete({ path })
  }
  for (const [path, content] of files) {
    await fileRepository.write({ path, content })
  }
  await fileRepository.write({ path: impactReportPath, content: serializeWorkspaceDocument(artifacts.impactReport) })
  await fileRepository.write({
    path: `${MOVSCRIPT_INTERPRET_MANIFESTS_DIR}/${manifest.interpretationId}.json`,
    content: serializeWorkspaceDocument(manifest),
  })
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

function filterWorkspaceSourceFiles(
  files: WorkspaceFileSnapshot[],
  options: WorkspaceSourceOptions,
): WorkspaceFileSnapshot[] {
  if (options.includeContentUnitDecisionDocuments !== false) return files
  return files.filter((file) => !isMovScriptContentUnitDecisionPath(file.relativePath))
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

async function listRepositoryFiles(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
): Promise<string[]> {
  const files: string[] = []
  await collectRepositoryFiles(fileRepository, normalizeWorkspacePath(rootPath), files)
  return files.sort((left, right) => left.localeCompare(right))
}

async function collectRepositoryFiles(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  out: string[],
): Promise<void> {
  let listed: Awaited<ReturnType<MovScriptWorkspaceFileRepository['list']>>
  try {
    listed = await fileRepository.list({ path })
  } catch {
    return
  }
  for (const entry of listed.entries) {
    if (entry.kind === 'directory') {
      await collectRepositoryFiles(fileRepository, entry.path, out)
      continue
    }
    out.push(normalizeWorkspacePath(entry.path))
  }
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

function serializeWorkspaceDocument(value: unknown): string {
  if (typeof value === 'string') return value
  return `${JSON.stringify(jsonSerializable(value), null, 2)}\n`
}

function editorStateRuntimePanel(bundle: MovScriptWorkspaceDerivedArtifacts['contentUnitArtifacts'][number]): Record<string, unknown> {
  return {
    ...bundle.runtimePanel,
    contentUnitId: bundle.contentUnitId,
    contentUnitPath: bundle.contentUnitPath,
    content_unit_id: bundle.runtimePanel.content_unit_id ?? bundle.contentUnitId,
    content_unit_path: bundle.contentUnitPath,
  }
}

function jsonSerializable(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries()).map(([key, item]) => [String(key), jsonSerializable(item)]))
  }
  if (Array.isArray(value)) return value.map(jsonSerializable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSerializable(item)]))
  }
  return value
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

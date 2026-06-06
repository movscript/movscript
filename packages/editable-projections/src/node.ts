import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createEditableProjectionWorkspace, type EditableProjectionWorkspace } from './workspace.js'
import { createEditableProjectionWorkflow, type EditableProjectionWorkflow } from './workflow.js'
import { createProjectionRegistry } from './registry.js'
import { assertKitOptions } from './kit.js'
import {
  MissingApplyReviewArtifactError,
  MissingWorkspaceUpdateTargetArtifactError,
  MissingWorkspaceFileError,
  WorkspacePathEscapeError,
} from './errors.js'
import type { FormatOptions } from './format.js'
import { parseWorkspaceManifestJson, validateWorkspaceManifest } from './manifest.js'
import { parseApplyReviewJson, serializeApplyReviewJson } from './applyReview.js'
import {
  parseWorkspaceUpdateTargetsJson,
  serializeWorkspaceUpdateTargetsJson,
} from './updateTarget.js'
import type {
  ApplyReview,
  ApplyReviewStore,
  BackendStore,
  CommandExecutor,
  ManifestStore,
  ProjectionAdapter,
  ProjectionRegistryLike,
  SnapshotStore,
  WorkspaceFileSystem,
  WorkspaceManifest,
  WorkspaceUpdateTarget,
  WorkspaceUpdateTargetStore,
} from './types.js'
import { normalizePath, pathHasCurrentSegment, pathHasParentSegment, pathIsAbsolute } from './paths.js'

export interface NodeEditableProjectionWorkspaceOptions {
  backendStore: BackendStore
  registry: ProjectionRegistryLike
  ignorePaths?: string[]
  manifestPath?: string
  snapshotRoot?: string
  reviewRoot?: string
  updateTargetRoot?: string
}

export interface NodeEditableProjectionWorkflowOptions<TCommand = unknown> extends NodeEditableProjectionWorkspaceOptions {
  executor?: CommandExecutor<TCommand>
  format?: FormatOptions
}

export interface NodeEditableProjectionKitOptions<TCommand = unknown>
  extends Omit<NodeEditableProjectionWorkflowOptions<TCommand>, 'registry'> {
  adapters?: ProjectionAdapter[]
  registry?: ProjectionRegistryLike
}

export interface NodeEditableProjectionWorkspace {
  workspace: EditableProjectionWorkspace
  fs: LocalWorkspaceFileSystem
  manifestStore: JsonManifestStore
  snapshotStore: FileSnapshotStore
}

export interface NodeEditableProjectionWorkflow<TCommand = unknown> extends NodeEditableProjectionWorkspace {
  workflow: EditableProjectionWorkflow<TCommand>
  reviewStore: FileApplyReviewStore<TCommand>
  updateTargetStore: FileWorkspaceUpdateTargetStore
}

export interface NodeEditableProjectionKit<TCommand = unknown> extends NodeEditableProjectionWorkflow<TCommand> {
  registry: ProjectionRegistryLike
}

export function createNodeEditableProjectionWorkspace(
  root: string,
  options: NodeEditableProjectionWorkspaceOptions,
): NodeEditableProjectionWorkspace {
  const fs = new LocalWorkspaceFileSystem(root)
  const manifestStore = new JsonManifestStore(fs, options.manifestPath)
  const snapshotStore = new FileSnapshotStore(fs, options.snapshotRoot)
  return {
    fs,
    manifestStore,
    snapshotStore,
    workspace: createEditableProjectionWorkspace({
      fs,
      manifestStore,
      snapshotStore,
      backendStore: options.backendStore,
      registry: options.registry,
      ignorePaths: options.ignorePaths,
    }),
  }
}

export function createNodeEditableProjectionWorkflow<TCommand = unknown>(
  root: string,
  options: NodeEditableProjectionWorkflowOptions<TCommand>,
): NodeEditableProjectionWorkflow<TCommand> {
  const workspaceBundle = createNodeEditableProjectionWorkspace(root, options)
  const reviewStore = new FileApplyReviewStore<TCommand>(workspaceBundle.fs, options.reviewRoot)
  const updateTargetStore = new FileWorkspaceUpdateTargetStore(workspaceBundle.fs, options.updateTargetRoot)
  return {
    ...workspaceBundle,
    reviewStore,
    updateTargetStore,
    workflow: createEditableProjectionWorkflow({
      workspace: workspaceBundle.workspace,
      executor: options.executor,
      reviewStore,
      updateTargetStore,
      format: options.format,
    }),
  }
}

export function createNodeEditableProjectionKit<TCommand = unknown>(
  root: string,
  options: NodeEditableProjectionKitOptions<TCommand>,
): NodeEditableProjectionKit<TCommand> {
  assertKitOptions(options)
  const { adapters, registry = createProjectionRegistry(adapters ?? []), ...workflowOptions } = options
  return {
    registry,
    ...createNodeEditableProjectionWorkflow(root, {
      ...workflowOptions,
      registry,
    }),
  }
}

export class LocalWorkspaceFileSystem implements WorkspaceFileSystem {
  constructor(readonly root: string) {}

  async readFile(filePath: string): Promise<string> {
    try {
      return await readFile(this.resolve(filePath), 'utf8')
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new MissingWorkspaceFileError(normalizePath(filePath))
      }
      throw error
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const absolutePath = this.resolve(filePath)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, content)
  }

  async deleteFile(filePath: string): Promise<void> {
    await rm(this.resolve(filePath), { force: true })
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await stat(this.resolve(filePath))
      return true
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error
      }
      return false
    }
  }

  async listFiles(filePath: string): Promise<string[]> {
    const root = this.resolve(filePath)
    const workspaceRoot = this.root
    const files: string[] = []

    async function walk(directory: string): Promise<void> {
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch (error) {
        if (isMissingFileError(error)) {
          return
        }
        throw error
      }
      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          await walk(absolutePath)
        } else if (entry.isFile()) {
          files.push(path.relative(workspaceRoot, absolutePath).split(path.sep).join('/'))
        }
      }
    }

    await walk(root)
    return files.sort()
  }

  private resolve(filePath: string): string {
    if (pathIsAbsolute(filePath) || pathHasParentSegment(filePath)) {
      throw new WorkspacePathEscapeError(filePath)
    }
    const resolved = path.resolve(this.root, normalizePath(filePath))
    const root = path.resolve(this.root)
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new WorkspacePathEscapeError(filePath)
    }
    return resolved
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error.code === 'ENOENT' || error.code === 'ENOTDIR'),
  )
}

export class JsonManifestStore implements ManifestStore {
  constructor(private readonly fs: WorkspaceFileSystem, private readonly path = 'meta/manifest.json') {}

  async load(): Promise<WorkspaceManifest> {
    const manifestPath = this.manifestPath()
    if (!(await this.fs.exists(manifestPath))) {
      return { version: 1, files: {} }
    }
    return parseWorkspaceManifestJson(await this.fs.readFile(manifestPath), manifestPath)
  }

  async save(manifest: WorkspaceManifest): Promise<void> {
    const manifestPath = this.manifestPath()
    await this.fs.writeFile(manifestPath, `${JSON.stringify(validateWorkspaceManifest(manifest, manifestPath), null, 2)}\n`)
  }

  private manifestPath(): string {
    return controlPath(this.path)
  }
}

export class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly fs: WorkspaceFileSystem, private readonly root = 'meta/base') {}

  async readBase(filePath: string): Promise<string | undefined> {
    const snapshotPath = this.snapshotPath(filePath)
    return await this.fs.exists(snapshotPath) ? this.fs.readFile(snapshotPath) : undefined
  }

  async writeBase(filePath: string, content: string): Promise<void> {
    await this.fs.writeFile(this.snapshotPath(filePath), content)
  }

  async deleteBase(filePath: string): Promise<void> {
    if (this.fs.deleteFile) {
      await this.fs.deleteFile(this.snapshotPath(filePath))
    }
  }

  private snapshotPath(filePath: string): string {
    const root = controlPath(this.root)
    if (pathIsAbsolute(filePath) || pathHasParentSegment(filePath)) {
      throw new WorkspacePathEscapeError(filePath)
    }
    return `${root}/${encodeURIComponent(normalizePath(filePath))}.base`
  }
}

export class FileApplyReviewStore<TCommand = unknown> implements ApplyReviewStore<TCommand> {
  constructor(private readonly fs: WorkspaceFileSystem, private readonly root = 'reviews') {}

  async load(path: string): Promise<ApplyReview<TCommand>> {
    const reviewPath = this.reviewPath(path)
    if (!(await this.fs.exists(reviewPath))) {
      throw new MissingApplyReviewArtifactError(reviewPath)
    }
    return parseApplyReviewJson<TCommand>(await this.fs.readFile(reviewPath), reviewPath)
  }

  async save(path: string, review: ApplyReview<TCommand>): Promise<void> {
    const reviewPath = this.reviewPath(path)
    await this.fs.writeFile(reviewPath, serializeApplyReviewJson(review))
  }

  private reviewPath(path: string): string {
    const root = controlPath(this.root)
    if (pathIsAbsolute(path) || pathHasParentSegment(path)) {
      throw new WorkspacePathEscapeError(path)
    }
    const normalized = normalizePath(path)
    if (normalized === '.' || pathHasCurrentSegment(normalized)) {
      throw new WorkspacePathEscapeError(path)
    }
    const withExtension = normalized.endsWith('.json') ? normalized : `${normalized}.json`
    return normalizePath(`${root}/${withExtension}`)
  }
}

export class FileWorkspaceUpdateTargetStore implements WorkspaceUpdateTargetStore {
  constructor(private readonly fs: WorkspaceFileSystem, private readonly root = 'update-targets') {}

  async load(path: string): Promise<WorkspaceUpdateTarget[]> {
    const artifactPath = this.artifactPath(path)
    if (!(await this.fs.exists(artifactPath))) {
      throw new MissingWorkspaceUpdateTargetArtifactError(artifactPath)
    }
    return parseWorkspaceUpdateTargetsJson(await this.fs.readFile(artifactPath))
  }

  async save(path: string, targets: WorkspaceUpdateTarget[]): Promise<void> {
    await this.fs.writeFile(this.artifactPath(path), serializeWorkspaceUpdateTargetsJson(targets))
  }

  private artifactPath(path: string): string {
    const root = controlPath(this.root)
    if (pathIsAbsolute(path) || pathHasParentSegment(path)) {
      throw new WorkspacePathEscapeError(path)
    }
    const normalized = normalizePath(path)
    if (normalized === '.' || pathHasCurrentSegment(normalized)) {
      throw new WorkspacePathEscapeError(path)
    }
    const withExtension = normalized.endsWith('.json') ? normalized : `${normalized}.json`
    return normalizePath(`${root}/${withExtension}`)
  }
}

function controlPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WorkspacePathEscapeError(String(value))
  }
  const normalized = normalizePath(value)
  if (
    normalized !== value
    || normalized === '.'
    || pathIsAbsolute(value)
    || pathHasParentSegment(value)
    || pathHasCurrentSegment(value)
  ) {
    throw new WorkspacePathEscapeError(value)
  }
  return normalized
}

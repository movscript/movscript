import type {
  ApplyReview,
  ApplyReviewStore,
  BackendEntitySnapshot,
  BackendStore,
  EntityRef,
  ManifestStore,
  SnapshotStore,
  WorkspaceFileSystem,
  WorkspaceManifest,
  WorkspaceUpdateTarget,
  WorkspaceUpdateTargetStore,
} from './types.js'
import { validateApplyReview } from './applyReview.js'
import {
  MissingApplyReviewArtifactError,
  MissingWorkspaceUpdateTargetArtifactError,
  MissingWorkspaceFileError,
  WorkspacePathEscapeError,
} from './errors.js'
import { validateWorkspaceManifest } from './manifest.js'
import {
  parseWorkspaceUpdateTargetsJson,
  serializeWorkspaceUpdateTargetsJson,
} from './updateTarget.js'
import { normalizePath, pathHasCurrentSegment, pathHasParentSegment, pathIsAbsolute, pathIsInside } from './paths.js'

export class MemoryWorkspaceFileSystem implements WorkspaceFileSystem {
  readonly files = new Map<string, string>()

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(memoryStorePath(path), content)
    }
  }

  async readFile(path: string): Promise<string> {
    const normalized = memoryStorePath(path)
    const content = this.files.get(normalized)
    if (content === undefined) {
      throw new MissingWorkspaceFileError(normalized)
    }
    return content
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(memoryStorePath(path), content)
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(memoryStorePath(path))
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(memoryStorePath(path))
  }

  async listFiles(path: string): Promise<string[]> {
    const root = memoryStorePath(path)
    return [...this.files.keys()]
      .filter((file) => pathIsInside(file, root))
      .sort()
  }
}

export class MemoryManifestStore implements ManifestStore {
  constructor(private manifest: WorkspaceManifest = { version: 1, files: {} }) {
    this.manifest = validateWorkspaceManifest(manifest)
  }

  async load(): Promise<WorkspaceManifest> {
    return validateWorkspaceManifest(JSON.parse(JSON.stringify(this.manifest)) as WorkspaceManifest)
  }

  async save(manifest: WorkspaceManifest): Promise<void> {
    this.manifest = validateWorkspaceManifest(JSON.parse(JSON.stringify(manifest)) as WorkspaceManifest)
  }
}

export class MemorySnapshotStore implements SnapshotStore {
  readonly bases = new Map<string, string>()

  constructor(initialBases: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialBases)) {
      this.bases.set(memoryStorePath(path), content)
    }
  }

  async readBase(path: string): Promise<string | undefined> {
    return this.bases.get(memoryStorePath(path))
  }

  async writeBase(path: string, content: string): Promise<void> {
    this.bases.set(memoryStorePath(path), content)
  }

  async deleteBase(path: string): Promise<void> {
    this.bases.delete(memoryStorePath(path))
  }
}

export class MemoryBackendStore implements BackendStore {
  readonly entities = new Map<string, BackendEntitySnapshot>()

  constructor(initialEntities: BackendEntitySnapshot[] = []) {
    for (const entity of initialEntities) {
      this.setEntity(entity)
    }
  }

  async getEntity(ref: Required<EntityRef>): Promise<BackendEntitySnapshot | undefined> {
    const entity = this.entities.get(entityKey(ref))
    return entity ? clone(entity) : undefined
  }

  setEntity(entity: BackendEntitySnapshot): void {
    this.entities.set(entityKey(entity), clone(entity))
  }

  deleteEntity(ref: EntityRef): boolean {
    return this.entities.delete(entityKey(ref))
  }

  listEntities(): BackendEntitySnapshot[] {
    return [...this.entities.values()].map(clone)
  }

  clear(): void {
    this.entities.clear()
  }
}

export class MemoryApplyReviewStore<TCommand = unknown> implements ApplyReviewStore<TCommand> {
  readonly reviews = new Map<string, ApplyReview<TCommand>>()

  constructor(initialReviews: Record<string, ApplyReview<TCommand>> = {}) {
    for (const [path, review] of Object.entries(initialReviews)) {
      const normalized = reviewStorePath(path)
      this.reviews.set(normalized, validateApplyReview<TCommand>(review, normalized))
    }
  }

  async load(path: string): Promise<ApplyReview<TCommand>> {
    const normalized = reviewStorePath(path)
    const review = this.reviews.get(normalized)
    if (!review) {
      throw new MissingApplyReviewArtifactError(normalized)
    }
    return validateApplyReview<TCommand>(JSON.parse(JSON.stringify(review)), normalized)
  }

  async save(path: string, review: ApplyReview<TCommand>): Promise<void> {
    const normalized = reviewStorePath(path)
    this.reviews.set(normalized, validateApplyReview<TCommand>(JSON.parse(JSON.stringify(review)), normalized))
  }
}

export class MemoryWorkspaceUpdateTargetStore implements WorkspaceUpdateTargetStore {
  readonly artifacts = new Map<string, WorkspaceUpdateTarget[]>()

  constructor(initialArtifacts: Record<string, WorkspaceUpdateTarget[]> = {}) {
    for (const [path, targets] of Object.entries(initialArtifacts)) {
      const normalized = updateTargetStorePath(path)
      this.artifacts.set(normalized, parseWorkspaceUpdateTargetsJson(serializeWorkspaceUpdateTargetsJson(targets)))
    }
  }

  async load(path: string): Promise<WorkspaceUpdateTarget[]> {
    const normalized = updateTargetStorePath(path)
    const targets = this.artifacts.get(normalized)
    if (!targets) {
      throw new MissingWorkspaceUpdateTargetArtifactError(normalized)
    }
    return parseWorkspaceUpdateTargetsJson(serializeWorkspaceUpdateTargetsJson(targets))
  }

  async save(path: string, targets: WorkspaceUpdateTarget[]): Promise<void> {
    const normalized = updateTargetStorePath(path)
    this.artifacts.set(normalized, parseWorkspaceUpdateTargetsJson(serializeWorkspaceUpdateTargetsJson(targets)))
  }
}

function reviewStorePath(path: string): string {
  return memoryArtifactStorePath(path)
}

function updateTargetStorePath(path: string): string {
  return memoryArtifactStorePath(path)
}

function memoryArtifactStorePath(path: string): string {
  const normalized = memoryStorePath(path)
  if (normalized === '.' || pathHasCurrentSegment(normalized)) {
    throw new WorkspacePathEscapeError(path)
  }
  return normalized
}

function memoryStorePath(path: string): string {
  if (pathIsAbsolute(path) || pathHasParentSegment(path)) {
    throw new WorkspacePathEscapeError(path)
  }
  return normalizePath(path)
}

function entityKey(ref: EntityRef): string {
  return `${ref.entityType}:${String(ref.entityId)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

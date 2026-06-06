import { diffJson } from './jsonDiff.js'
import {
  validateApplyReview,
  validateWorkspaceApplyOptions,
  validateWorkspaceReviewOptions,
  type WorkspaceApplyOptions,
  type WorkspaceReviewOptions,
} from './applyReview.js'
import { validateWorkspaceUpdateOptions, validateWorkspaceUpdateTargets } from './updateTarget.js'
import { validateProjectionCommandResult } from './adapter.js'
import {
  InvalidApplyReviewError,
  InvalidEditableProjectionWorkspaceOptionsError,
  StaleApplyReviewError,
  WorkspacePathEscapeError,
  type WorkspaceOptionsValidationIssue,
} from './errors.js'
import { mergeJson } from './jsonMerge.js'
import { assertApplyReviewReady } from './reviewGate.js'
import { sha256 } from './hash.js'
import { normalizePath, pathHasCurrentSegment, pathHasParentSegment, pathIsAbsolute, pathIsInside } from './paths.js'
import type {
  ApplyPlanOperation,
  ApplyResult,
  ApplyReview,
  CommandExecutor,
  EditableProjectionWorkspaceOptions,
  EntityRef,
  FileSyncState,
  ProjectionAdapter,
  ProjectionAction,
  ProjectionCommandInput,
  ProjectionFileKind,
  ProjectionMergeResult,
  ValidationIssue,
  WorkspaceStatus,
  WorkspaceStatusFile,
  WorkspaceManifest,
  WorkspaceUpdateMode,
  WorkspaceUpdateOptions,
  WorkspaceUpdateOperation,
  WorkspaceUpdateResult,
  WorkspaceUpdateTarget,
} from './types.js'

interface LocalArtifactState {
  path: string
  fileExists: boolean
  fileContent?: string
  baseContent?: string
  manifestEntry?: FileSyncState
}

export const defaultEditableProjectionIgnorePaths = [
  'meta',
  'reviews',
  'update-targets',
  '.git',
  'node_modules',
  'dist',
] as const

export class EditableProjectionWorkspace {
  constructor(private readonly options: EditableProjectionWorkspaceOptions) {}

  async status(path = '.'): Promise<WorkspaceStatus> {
    const rootPath = workspaceInputPath(path)
    const manifest = await this.options.manifestStore.load()
    const files = new Map<string, WorkspaceStatusFile>()

    for (const [filePath, entry] of Object.entries(manifest.files)) {
      const normalizedFilePath = normalizePath(filePath)
      if (!pathIsInside(normalizedFilePath, rootPath)) continue
      if (this.isIgnoredPath(normalizedFilePath)) continue
      files.set(normalizedFilePath, await this.statusForManifestFile(normalizedFilePath, entry))
    }

    for (const filePath of await this.options.fs.listFiles(rootPath)) {
      const normalizedFilePath = normalizePath(filePath)
      if (this.isIgnoredPath(normalizedFilePath)) continue
      if (!files.has(normalizedFilePath)) {
        files.set(normalizedFilePath, {
          path: normalizedFilePath,
          state: 'untracked',
        })
      }
    }

    return {
      rootPath,
      files: [...files.values()].sort((left, right) => left.path.localeCompare(right.path)),
    }
  }

  async diff(path = '.'): Promise<ApplyReview> {
    return this.applyReview(path, { includeNoop: false })
  }

  async applyReview(path = '.', options: WorkspaceReviewOptions = {}): Promise<ApplyReview> {
    const rootPath = workspaceInputPath(path)
    const reviewOptions = validateWorkspaceReviewOptions(options)
    const manifest = await this.options.manifestStore.load()
    const operations: ApplyPlanOperation[] = []
    const seen = new Set<string>()

    for (const [filePath, entry] of Object.entries(manifest.files)) {
      const normalizedFilePath = normalizePath(filePath)
      if (!pathIsInside(normalizedFilePath, rootPath)) continue
      if (this.isIgnoredPath(normalizedFilePath)) continue
      seen.add(normalizedFilePath)
      const operation = await this.planManifestFile(normalizedFilePath, entry)
      if (reviewOptions.includeNoop || operation.state !== 'noop') {
        operations.push(operation)
      }
    }

    for (const filePath of await this.options.fs.listFiles(rootPath)) {
      const normalizedFilePath = normalizePath(filePath)
      if (this.isIgnoredPath(normalizedFilePath)) continue
      if (seen.has(normalizedFilePath)) continue
      const operation = await this.planUntrackedFile(normalizedFilePath)
      if (operation && (reviewOptions.includeNoop || operation.state !== 'noop')) {
        operations.push(operation)
      }
    }

    return summarizeReview(rootPath, operations)
  }

  async apply(review: ApplyReview, options: WorkspaceApplyOptions):
    Promise<ApplyResult> {
    const validatedReview = validateApplyReview(review)
    const applyOptions = validateWorkspaceApplyOptions(options)

    if (!applyOptions.allowConflicts) {
      assertApplyReviewReady(validatedReview)
    }

    let appliedOperations = 0
    let appliedCommands = 0
    const refreshTargets: WorkspaceUpdateTarget[] = []
    for (const operation of validatedReview.operations) {
      if (operation.state !== 'planned' || operation.commands.length === 0) continue
      if (!applyOptions.allowStaleReview) {
        await this.assertApplyOperationCurrent(operation)
      }
      const executionResult = await applyOptions.executor.execute(operation.commands, { operation })
      refreshTargets.push(...normalizeExecutionUpdateTargets(executionResult))
      appliedOperations += 1
      appliedCommands += operation.commands.length
    }

    const refresh = refreshTargets.length > 0
      ? await this.update(refreshTargets, { mode: applyOptions.refreshMode ?? 'overwrite' })
      : undefined

    return { appliedOperations, appliedCommands, refresh }
  }

  async update(
    targets: WorkspaceUpdateTarget[],
    options: WorkspaceUpdateOptions = {},
  ): Promise<WorkspaceUpdateResult> {
    const validatedTargets = validateWorkspaceUpdateTargets(targets)
    const updateOptions = validateWorkspaceUpdateOptions(options)
    const mode = updateOptions.mode ?? 'safe'
    const manifest = await this.options.manifestStore.load()
    const previousBackendRevision = manifest.backendRevision
    const operations: WorkspaceUpdateOperation[] = []
    const previousStates = new Map<string, LocalArtifactState>()

    for (const target of validatedTargets) {
      const path = normalizePath(target.path)
      if (!previousStates.has(path)) {
        previousStates.set(path, await this.artifactState(manifest, path))
      }
    }

    try {
      for (const target of validatedTargets) {
        operations.push(await this.updateTarget(manifest, target, mode))
      }
      const completedBackendRevision = updateOperationsAreComplete(operations)
        ? updateOptions.backendRevision
        : undefined
      if (completedBackendRevision !== undefined) {
        manifest.backendRevision = completedBackendRevision
      }
      await this.options.manifestStore.save(manifest)
    } catch (error) {
      restoreManifestBackendRevision(manifest, previousBackendRevision)
      await this.restoreArtifactStates(manifest, [...previousStates.values()].reverse())
      throw error
    }

    return summarizeUpdate(
      operations,
      updateOperationsAreComplete(operations) ? updateOptions.backendRevision : undefined,
    )
  }

  private async statusForManifestFile(path: string, entry: FileSyncState): Promise<WorkspaceStatusFile> {
    const adapter = this.options.registry.get(entry.schema)
    const exists = await this.options.fs.exists(path)
    const localHash = exists ? sha256(await this.options.fs.readFile(path)) : undefined
    const remote = entry.kind === 'writable_projection' && entityRefIsComplete(entry)
      ? await this.options.backendStore.getEntity(entry)
      : undefined
    const remoteChanged = Boolean(
      entry.kind === 'writable_projection'
        && entry.baseBackendHash
        && ((remote?.hash ?? undefined) !== entry.baseBackendHash),
    )
    const localChanged = Boolean(exists && entry.baseHash && localHash !== entry.baseHash)

    let state: WorkspaceStatusFile['state'] = 'clean'
    if (!adapter && entry.kind === 'writable_projection') {
      state = 'missing_adapter'
    } else if (!exists) {
      state = remoteChanged ? 'remote_deleted' : 'deleted'
    } else if (entry.kind !== 'writable_projection' && localChanged) {
      state = 'readonly_modified'
    } else if (localChanged && remoteChanged) {
      state = 'both_modified'
    } else if (localChanged) {
      state = 'modified'
    } else if (remoteChanged) {
      state = 'remote_modified'
    }

    return {
      path,
      state,
      kind: entry.kind,
      schema: entry.schema,
      entityType: entry.entityType,
      entityId: entry.entityId,
      localHash,
      baseHash: entry.baseHash,
      backendHash: remote?.hash ?? entry.backendHash,
      baseBackendHash: entry.baseBackendHash,
    }
  }

  private async planManifestFile(path: string, entry: FileSyncState): Promise<ApplyPlanOperation> {
    const adapter = this.options.registry.get(entry.schema)
    const exists = await this.options.fs.exists(path)
    const localText = exists ? await this.options.fs.readFile(path) : undefined
    const localHash = localText === undefined ? undefined : sha256(localText)
    const localChanged = Boolean(entry.baseHash && localHash !== entry.baseHash)
    const remote = entry.kind === 'writable_projection' && entityRefIsComplete(entry)
      ? await this.options.backendStore.getEntity(entry)
      : undefined
    const remoteChanged = Boolean(
      entry.kind === 'writable_projection'
        && entry.baseBackendHash
        && ((remote?.hash ?? undefined) !== entry.baseBackendHash),
    )

    if (entry.kind !== 'writable_projection' || !entry.writable) {
      if (localChanged || !exists) {
        return blocked(path, entry, 'Local changes to generated index or materialized view cannot be applied.')
      }
      return noop(path, entry)
    }

    if (!adapter) {
      return blocked(path, entry, `No projection adapter registered for schema ${entry.schema}.`)
    }

    if (!exists) {
      if (remoteChanged) {
        return conflict(path, entry, 'Local delete conflicts with remote changes.')
      }
      const base = await this.parseBase(adapter, path, entry)
      if (base.issues.length > 0) {
        return blocked(path, entry, 'Base snapshot is invalid.', base.issues)
      }
      return this.commandsOperation(adapter, {
        action: 'delete',
        filePath: path,
        entity: entry,
        base: base.value,
        patch: [],
      }, {
        manifestTracked: true,
        localHash,
        baseHash: entry.baseHash,
        backendHash: remote?.hash ?? entry.backendHash,
        baseBackendHash: entry.baseBackendHash,
      })
    }

    const local = parseAndValidate(adapter, localText ?? '', path, entry)
    if (local.issues.length > 0) {
      return blocked(path, entry, 'Local projection is invalid.', local.issues)
    }

    if (!localChanged && !remoteChanged) return noop(path, entry)

    const base = await this.parseBase(adapter, path, entry)
    if (base.issues.length > 0) {
      return blocked(path, entry, 'Base snapshot is invalid.', base.issues)
    }
    if (!base.exists && entry.entityId !== undefined) {
      return blocked(path, entry, 'Missing base snapshot for existing projection.')
    }

    if (!localChanged && remoteChanged) {
      return blocked(path, entry, 'Remote changed while local projection is unchanged. Run update before apply.')
    }

    if (remoteChanged) {
      if (!remote) {
        return conflict(path, entry, 'Remote entity was deleted while local projection changed.')
      }
      const remoteProjection = materializeProjectionValue(adapter, remote.value, path, entry)
      if (remoteProjection.issues.length > 0) {
        return blocked(path, entry, 'Remote projection could not be materialized.', remoteProjection.issues)
      }
      const remoteIssues = validateProjectionValue(adapter, remoteProjection.value, path, entry)
      if (remoteIssues.length > 0) {
        return blocked(path, entry, 'Remote projection is invalid.', remoteIssues)
      }
      const merge = mergeProjection(adapter, base.value, local.value, remoteProjection.value, path, entry)
      if (merge.status === 'conflict') {
        return {
          state: 'conflict',
          filePath: path,
          kind: entry.kind,
          schema: entry.schema,
          entityType: entry.entityType,
          entityId: entry.entityId,
          localHash,
          baseHash: entry.baseHash,
          backendHash: remote?.hash ?? entry.backendHash,
          baseBackendHash: entry.baseBackendHash,
          commands: [],
          issues: [],
          conflicts: merge.conflicts,
        }
      }
      return this.commandsOperation(adapter, {
        action: 'update',
        filePath: path,
        entity: entry,
        base: remoteProjection.value,
        local: local.value,
        remote: remoteProjection.value,
        target: merge.value,
        patch: diffJson(remoteProjection.value, merge.value),
      }, {
        manifestTracked: true,
        localHash,
        baseHash: entry.baseHash,
        backendHash: remote.hash,
        baseBackendHash: entry.baseBackendHash,
      })
    }

    const action: ProjectionAction = entry.entityId === undefined ? 'create' : 'update'
    return this.commandsOperation(adapter, {
      action,
      filePath: path,
      entity: entry,
      base: base.value,
      local: local.value,
      target: local.value,
      patch: diffJson(base.value ?? {}, local.value),
    }, {
      manifestTracked: true,
      localHash,
      baseHash: entry.baseHash,
      backendHash: remote?.hash ?? entry.backendHash,
      baseBackendHash: entry.baseBackendHash,
    })
  }

  private async planUntrackedFile(path: string): Promise<ApplyPlanOperation | undefined> {
    const text = await this.options.fs.readFile(path)
    const schema = detectSchema(text)
    if (!schema) return undefined
    const adapter = this.options.registry.get(schema)
    if (!adapter) {
      return blocked(path, {
        schema,
        kind: 'writable_projection',
        writable: true,
        entityType: 'unknown',
      }, `No projection adapter registered for schema ${schema}.`)
    }
    const entry: FileSyncState = {
      schema,
      kind: 'writable_projection',
      writable: true,
      entityType: adapter.entityType,
    }
    const local = parseAndValidate(adapter, text, path, entry)
    if (local.issues.length > 0) {
      return blocked(path, entry, 'Local projection is invalid.', local.issues)
    }
    return this.commandsOperation(adapter, {
      action: 'create',
      filePath: path,
      entity: entry,
      local: local.value,
      target: local.value,
      patch: diffJson({}, local.value),
    }, {
      manifestTracked: false,
      localHash: sha256(text),
    })
  }

  private async parseBase(
    adapter: ProjectionAdapter,
    path: string,
    entry: FileSyncState,
  ): Promise<{ exists: boolean; value?: unknown; issues: ValidationIssue[] }> {
    const baseText = await this.options.snapshotStore.readBase(path)
    if (baseText === undefined) {
      return { exists: false, issues: [] }
    }
    const base = parseAndValidate(adapter, baseText, path, entry)
    return { exists: true, value: base.value, issues: base.issues }
  }

  private commandsOperation(
    adapter: ProjectionAdapter,
    input: ProjectionCommandInput,
    sync: Pick<
      ApplyPlanOperation,
      'manifestTracked' | 'localHash' | 'baseHash' | 'backendHash' | 'baseBackendHash'
    >,
  ): ApplyPlanOperation {
    let commandResult: ReturnType<ProjectionAdapter['createCommands']>
    try {
      commandResult = adapter.createCommands(input)
    } catch (error) {
      return blocked(input.filePath, {
        schema: adapter.schema,
        kind: 'writable_projection',
        writable: true,
        entityType: input.entity.entityType,
        entityId: input.entity.entityId,
      }, 'Projection commands could not be created.', [{
        severity: 'error',
        message: `Projection adapter createCommands failed: ${errorMessage(error)}`,
      }])
    }
    const result = validateProjectionCommandResult(adapter.schema, input.filePath, commandResult)
    const operation: ApplyPlanOperation = {
      state: 'planned',
      action: input.action,
      filePath: input.filePath,
      kind: 'writable_projection',
      schema: adapter.schema,
      entityType: input.entity.entityType,
      entityId: input.entity.entityId,
      manifestTracked: sync.manifestTracked,
      localHash: sync.localHash,
      baseHash: sync.baseHash,
      backendHash: sync.backendHash,
      baseBackendHash: sync.baseBackendHash,
      patch: input.patch,
      commands: result.commands,
      issues: result.warnings ?? [],
    }
    const artifactIssues = validateReviewOperationArtifact(operation)
    if (artifactIssues.length > 0) {
      return blocked(input.filePath, {
        schema: adapter.schema,
        kind: 'writable_projection',
        writable: true,
        entityType: input.entity.entityType,
        entityId: input.entity.entityId,
      }, 'Projection commands are not valid apply review artifacts.', artifactIssues)
    }
    return operation
  }

  private async assertApplyOperationCurrent(operation: ApplyPlanOperation): Promise<void> {
    const path = normalizePath(operation.filePath)
    const manifest = await this.options.manifestStore.load()
    const entry = manifest.files[path]
    const mismatches: ConstructorParameters<typeof StaleApplyReviewError>[1] = []
    const exists = await this.options.fs.exists(path)
    const currentLocalHash = exists ? sha256(await this.options.fs.readFile(path)) : undefined

    if (currentLocalHash !== operation.localHash) {
      mismatches.push({
        field: 'localHash',
        expected: operation.localHash,
        actual: currentLocalHash,
        message: 'Local file content changed after the review was created.',
      })
    }

    if (!operation.manifestTracked && entry) {
      mismatches.push({
        field: 'manifestEntry',
        message: 'A manifest entry now exists for a create operation that was reviewed as untracked.',
      })
    }

    if (operation.manifestTracked) {
      if (!entry) {
        mismatches.push({
          field: 'manifestEntry',
          message: 'The manifest entry no longer exists.',
        })
      } else {
        if (entry.baseHash !== operation.baseHash) {
          mismatches.push({
            field: 'baseHash',
            expected: operation.baseHash,
            actual: entry.baseHash,
            message: 'The synced base snapshot changed after the review was created.',
          })
        } else {
          const currentBaseText = await this.options.snapshotStore.readBase(path)
          const currentBaseHash = currentBaseText === undefined ? undefined : sha256(currentBaseText)
          if (currentBaseHash !== operation.baseHash) {
            mismatches.push({
              field: 'baseHash',
              expected: operation.baseHash,
              actual: currentBaseHash,
              message: 'The synced base snapshot content changed after the review was created.',
            })
          }
        }

        if (entry.kind === 'writable_projection' && entityRefIsComplete(entry)) {
          const remote = await this.options.backendStore.getEntity(entry)
          const currentBackendHash = remote?.hash
          if (currentBackendHash !== operation.backendHash) {
            mismatches.push({
              field: 'backendHash',
              expected: operation.backendHash,
              actual: currentBackendHash,
              message: 'The backend entity changed after the review was created.',
            })
          }
        }
      }
    }

    if (mismatches.length > 0) {
      throw new StaleApplyReviewError(path, mismatches)
    }
  }

  private async updateTarget(
    manifest: WorkspaceManifest,
    target: WorkspaceUpdateTarget,
    mode: WorkspaceUpdateMode,
  ): Promise<WorkspaceUpdateOperation> {
    const path = normalizePath(target.path)
    const currentEntry = manifest.files[path]
    const entry: FileSyncState = {
      schema: target.schema,
      kind: target.kind,
      writable: target.writable ?? target.kind === 'writable_projection',
      entityType: target.entityType,
      entityId: target.entityId,
      baseHash: currentEntry?.baseHash,
      baseBackendHash: currentEntry?.baseBackendHash,
      localHash: currentEntry?.localHash,
      backendHash: currentEntry?.backendHash,
    }

    if (target.operation === 'delete') {
      return this.deleteTarget(manifest, path, entry, mode)
    }

    const materialized = await this.materializeTarget(path, entry, target)
    if (materialized.issues.length > 0 || materialized.content === undefined) {
      return updateBlocked(path, entry, mode, materialized.issues)
    }

    const exists = await this.options.fs.exists(path)
    const localText = exists ? await this.options.fs.readFile(path) : undefined
    const localHash = localText === undefined ? undefined : sha256(localText)
    const localDirty = Boolean(exists && currentEntry?.baseHash && localHash !== currentEntry.baseHash)
    const remoteHash = sha256(materialized.content)

    if (localDirty && mode === 'safe') {
      return updateBlocked(path, entry, mode, [{
        severity: 'error',
        message: 'Local projection has uncommitted changes; safe update will not overwrite it.',
      }])
    }

    let nextContent = materialized.content
    let nextLocalHash = remoteHash

    if (localDirty && mode === 'merge') {
      const adapter = this.options.registry.get(entry.schema)
      const baseText = await this.options.snapshotStore.readBase(path)
      if (!adapter || !baseText || !localText) {
        return updateBlocked(path, entry, mode, [{
          severity: 'error',
          message: 'Cannot merge update without adapter, base snapshot, and local content.',
        }])
      }
      const base = parseAndValidate(adapter, baseText, path, entry)
      const local = parseAndValidate(adapter, localText, path, entry)
      const remote = parseAndValidate(adapter, materialized.content, path, entry)
      const issues = [...base.issues, ...local.issues, ...remote.issues]
      if (issues.length > 0) {
        return updateBlocked(path, entry, mode, issues)
      }
      const merge = mergeProjection(adapter, base.value, local.value, remote.value, path, entry)
      if (merge.status === 'conflict') {
        return {
          state: 'conflict',
          path,
          kind: entry.kind,
          schema: entry.schema,
          entityType: entry.entityType,
          entityId: entry.entityId,
          mode,
          localHash,
          baseHash: currentEntry?.baseHash,
          backendHash: materialized.backendHash,
          issues: [],
          conflicts: merge.conflicts,
        }
      }
      const serialized = serializeProjectionSafe(adapter, merge.value)
      if (serialized.issues.length > 0 || serialized.content === undefined) {
        return updateBlocked(path, entry, mode, serialized.issues)
      }
      nextContent = serialized.content
      nextLocalHash = sha256(nextContent)
    }

    if (exists && localHash === nextLocalHash && currentEntry?.baseHash === remoteHash) {
      const previousState = await this.artifactState(manifest, path)
      try {
        manifest.files[path] = nextEntry(entry, remoteHash, nextLocalHash, materialized.backendHash)
        await this.options.snapshotStore.writeBase(path, materialized.content)
      } catch (error) {
        await this.restoreArtifactState(manifest, previousState)
        throw error
      }
      return {
        state: 'noop',
        path,
        kind: entry.kind,
        schema: entry.schema,
        entityType: entry.entityType,
        entityId: entry.entityId,
        mode,
        localHash: nextLocalHash,
        baseHash: remoteHash,
        backendHash: materialized.backendHash,
        issues: [],
      }
    }

    const previousState = await this.artifactState(manifest, path)
    try {
      await this.options.fs.writeFile(path, nextContent)
      await this.options.snapshotStore.writeBase(path, materialized.content)
      manifest.files[path] = nextEntry(entry, remoteHash, nextLocalHash, materialized.backendHash)
    } catch (error) {
      await this.restoreArtifactState(manifest, previousState)
      throw error
    }

    return {
      state: 'updated',
      path,
      kind: entry.kind,
      schema: entry.schema,
      entityType: entry.entityType,
      entityId: entry.entityId,
      mode,
      localHash: nextLocalHash,
      baseHash: remoteHash,
      backendHash: materialized.backendHash,
      issues: [],
    }
  }

  private async deleteTarget(
    manifest: WorkspaceManifest,
    path: string,
    entry: FileSyncState,
    mode: WorkspaceUpdateMode,
  ): Promise<WorkspaceUpdateOperation> {
    const exists = await this.options.fs.exists(path)
    const localText = exists ? await this.options.fs.readFile(path) : undefined
    const localHash = localText === undefined ? undefined : sha256(localText)
    const localDirty = Boolean(exists && entry.baseHash && localHash !== entry.baseHash)

    if (localDirty && mode === 'safe') {
      return updateBlocked(path, entry, mode, [{
        severity: 'error',
        message: 'Local projection has uncommitted changes; safe update will not delete it.',
      }])
    }

    if (!this.options.fs.deleteFile) {
      return updateBlocked(path, entry, mode, [{
        severity: 'error',
        message: 'Workspace filesystem does not support deleting files.',
      }])
    }

    const previousState = await this.artifactState(manifest, path)
    const hadManifestEntry = Object.hasOwn(manifest.files, path)
    try {
      if (exists) {
        await this.options.fs.deleteFile(path)
      }
      if (this.options.snapshotStore.deleteBase) {
        await this.options.snapshotStore.deleteBase(path)
      }
      delete manifest.files[path]
    } catch (error) {
      await this.restoreArtifactState(manifest, previousState)
      throw error
    }

    return {
      state: exists || hadManifestEntry ? 'deleted' : 'noop',
      path,
      kind: entry.kind,
      schema: entry.schema,
      entityType: entry.entityType,
      entityId: entry.entityId,
      mode,
      localHash,
      baseHash: entry.baseHash,
      backendHash: entry.backendHash,
      issues: [],
    }
  }

  private async materializeTarget(
    path: string,
    entry: FileSyncState,
    target: WorkspaceUpdateTarget,
  ): Promise<{ content?: string; backendHash?: string; issues: ValidationIssue[] }> {
    const adapter = this.options.registry.get(entry.schema)

    if (target.content !== undefined) {
      if (typeof target.content === 'string') {
        const issues = adapter && entry.kind === 'writable_projection'
          ? parseAndValidate(adapter, target.content, path, entry).issues
          : []
        return {
          content: target.content,
          backendHash: target.backendHash,
          issues,
        }
      }
      if (!adapter || entry.kind !== 'writable_projection') {
        const serialized = serializeJsonContentSafe(target.content)
        return {
          content: serialized.content,
          backendHash: target.backendHash,
          issues: serialized.issues,
        }
      }
      const issues = validateProjectionValue(adapter, target.content, path, entry)
      if (issues.length > 0) {
        return {
          backendHash: target.backendHash,
          issues,
        }
      }
      const serialized = serializeProjectionSafe(adapter, target.content)
      return {
        content: serialized.content,
        backendHash: target.backendHash,
        issues: serialized.issues,
      }
    }

    if (!adapter) {
      return {
        issues: [{
          severity: 'error',
          message: `No projection adapter registered for schema ${entry.schema}.`,
        }],
      }
    }
    if (!entityRefIsComplete(entry)) {
      return {
        issues: [{
          severity: 'error',
          message: 'Cannot update from backend without an entity id.',
        }],
      }
    }
    const remote = await this.options.backendStore.getEntity(entry)
    if (!remote) {
      return {
        issues: [{
          severity: 'error',
          message: `Remote entity ${entry.entityType}:${String(entry.entityId)} was not found.`,
        }],
      }
    }
    const projection = materializeProjectionValue(adapter, remote.value, path, entry)
    if (projection.issues.length > 0) {
      return {
        backendHash: remote.hash,
        issues: projection.issues,
      }
    }
    const issues = validateProjectionValue(adapter, projection.value, path, entry)
    if (issues.length > 0) {
      return {
        backendHash: remote.hash,
        issues,
      }
    }
    const serialized = serializeProjectionSafe(adapter, projection.value)
    return {
      content: serialized.content,
      backendHash: remote.hash,
      issues: serialized.issues,
    }
  }

  private async artifactState(
    manifest: WorkspaceManifest,
    path: string,
  ): Promise<LocalArtifactState> {
    const fileExists = await this.options.fs.exists(path)
    return {
      path,
      fileExists,
      fileContent: fileExists ? await this.options.fs.readFile(path) : undefined,
      baseContent: await this.options.snapshotStore.readBase(path),
      manifestEntry: manifest.files[path] ? { ...manifest.files[path] } : undefined,
    }
  }

  private async restoreArtifactState(
    manifest: WorkspaceManifest,
    state: LocalArtifactState,
  ): Promise<void> {
    try {
      if (state.fileExists && state.fileContent !== undefined) {
        await this.options.fs.writeFile(state.path, state.fileContent)
      } else if (this.options.fs.deleteFile) {
        await this.options.fs.deleteFile(state.path)
      }

      if (state.baseContent !== undefined) {
        await this.options.snapshotStore.writeBase(state.path, state.baseContent)
      } else if (this.options.snapshotStore.deleteBase) {
        await this.options.snapshotStore.deleteBase(state.path)
      }
    } finally {
      if (state.manifestEntry) {
        manifest.files[state.path] = state.manifestEntry
      } else {
        delete manifest.files[state.path]
      }
    }
  }

  private async restoreArtifactStates(
    manifest: WorkspaceManifest,
    states: LocalArtifactState[],
  ): Promise<void> {
    for (const state of states) {
      await this.restoreArtifactState(manifest, state)
    }
  }

  private isIgnoredPath(path: string): boolean {
    return defaultIgnoredPaths(this.options.ignorePaths).some((ignoredPath) =>
      pathIsInside(path, ignoredPath),
    )
  }
}

export function createEditableProjectionWorkspace(options: EditableProjectionWorkspaceOptions): EditableProjectionWorkspace {
  return new EditableProjectionWorkspace(validateEditableProjectionWorkspaceOptions(options))
}

export function validateEditableProjectionWorkspaceOptions(
  options: unknown,
): EditableProjectionWorkspaceOptions {
  if (!isRecord(options)) {
    throw new InvalidEditableProjectionWorkspaceOptionsError([{
      path: '/',
      message: 'workspace options must be an object.',
    }])
  }

  const issues: WorkspaceOptionsValidationIssue[] = []
  validateDependency(options.fs, '/fs', ['readFile', 'writeFile', 'exists', 'listFiles'], issues, {
    deleteFile: 'deleteFile must be a function when present.',
  })
  validateDependency(options.manifestStore, '/manifestStore', ['load', 'save'], issues)
  validateDependency(options.snapshotStore, '/snapshotStore', ['readBase', 'writeBase'], issues, {
    deleteBase: 'deleteBase must be a function when present.',
  })
  validateDependency(options.backendStore, '/backendStore', ['getEntity'], issues)
  validateDependency(options.registry, '/registry', ['get', 'getByEntityType'], issues)

  try {
    validateWorkspaceIgnorePaths(options.ignorePaths)
  } catch (error) {
    if (error instanceof InvalidEditableProjectionWorkspaceOptionsError) {
      issues.push(...error.issues)
    } else {
      issues.push({
        path: '/ignorePaths',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (issues.length > 0) {
    throw new InvalidEditableProjectionWorkspaceOptionsError(issues)
  }
  return options as unknown as EditableProjectionWorkspaceOptions
}

function workspaceInputPath(path: string): string {
  if (pathIsAbsolute(path) || pathHasParentSegment(path)) {
    throw new WorkspacePathEscapeError(path)
  }
  return normalizePath(path)
}

function parseAndValidate(
  adapter: ProjectionAdapter,
  text: string,
  filePath: string,
  entry: FileSyncState,
): { value: unknown; issues: ValidationIssue[] } {
  try {
    const value = adapter.parseFile(text, { filePath, manifestEntry: entry })
    const validation = adapter.validateFile(value, { filePath, manifestEntry: entry })
    return { value, issues: validation.ok ? [] : validation.issues }
  } catch (error) {
    return {
      value: undefined,
      issues: [{
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      }],
    }
  }
}

function validateProjectionValue(
  adapter: ProjectionAdapter,
  value: unknown,
  filePath: string,
  entry: FileSyncState,
): ValidationIssue[] {
  try {
    const validation = adapter.validateFile(value, { filePath, manifestEntry: entry })
    return validation.ok ? [] : validation.issues
  } catch (error) {
    return [{
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    }]
  }
}

function mergeProjection(
  adapter: ProjectionAdapter,
  base: unknown,
  local: unknown,
  remote: unknown,
  filePath: string,
  manifestEntry: FileSyncState,
): ProjectionMergeResult {
  if (adapter.merge) {
    return adapter.merge(base, local, remote, { filePath, manifestEntry })
  }
  return mergeJson(base, local, remote)
}

function materializeProjectionValue(
  adapter: ProjectionAdapter,
  entity: unknown,
  filePath: string,
  manifestEntry: FileSyncState,
): { value?: unknown; issues: ValidationIssue[] } {
  try {
    return {
      value: adapter.toProjection(entity, { filePath, manifestEntry }),
      issues: [],
    }
  } catch (error) {
    return {
      issues: [{
        severity: 'error',
        message: `Projection adapter toProjection failed: ${errorMessage(error)}`,
      }],
    }
  }
}

function serializeProjectionSafe(
  adapter: ProjectionAdapter,
  value: unknown,
): { content?: string; issues: ValidationIssue[] } {
  try {
    return {
      content: serializeProjection(adapter, value),
      issues: [],
    }
  } catch (error) {
    return {
      issues: [{
        severity: 'error',
        message: `Projection adapter serializeFile failed: ${errorMessage(error)}`,
      }],
    }
  }
}

function serializeProjection(adapter: ProjectionAdapter, value: unknown): string {
  if (adapter.serializeFile) {
    return adapter.serializeFile(value)
  }
  return `${JSON.stringify(value, null, 2)}\n`
}

function serializeJsonContentSafe(value: unknown): { content?: string; issues: ValidationIssue[] } {
  try {
    const serialized = JSON.stringify(value, null, 2)
    if (typeof serialized !== 'string') {
      return {
        issues: [{
          severity: 'error',
          message: 'Projection content must be JSON-compatible.',
        }],
      }
    }
    return {
      content: `${serialized}\n`,
      issues: [],
    }
  } catch {
    return {
      issues: [{
        severity: 'error',
        message: 'Projection content must be JSON-compatible.',
      }],
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function detectSchema(text: string): string | undefined {
  try {
    const value = JSON.parse(text) as unknown
    if (value && typeof value === 'object' && 'schema' in value) {
      const schema = (value as { schema?: unknown }).schema
      return typeof schema === 'string' ? schema : undefined
    }
  } catch {}
  return undefined
}

function entityRefIsComplete(ref: EntityRef): ref is Required<EntityRef> {
  return ref.entityId !== undefined
}

function blocked(path: string, entry: FileSyncState, message: string, issues: ValidationIssue[] = []): ApplyPlanOperation {
  return {
    state: 'blocked',
    filePath: path,
    kind: entry.kind,
    schema: entry.schema,
    entityType: entry.entityType,
    entityId: entry.entityId,
    commands: [],
    issues: [{ severity: 'error', message }, ...issues],
  }
}

function conflict(path: string, entry: FileSyncState, message: string): ApplyPlanOperation {
  return {
    state: 'conflict',
    filePath: path,
    kind: entry.kind,
    schema: entry.schema,
    entityType: entry.entityType,
    entityId: entry.entityId,
    commands: [],
    issues: [],
    conflicts: [{
      path: '',
      base: undefined,
      local: undefined,
      remote: undefined,
      message,
    }],
  }
}

function noop(path: string, entry: FileSyncState): ApplyPlanOperation {
  return {
    state: 'noop',
    filePath: path,
    kind: entry.kind,
    schema: entry.schema,
    entityType: entry.entityType,
    entityId: entry.entityId,
    commands: [],
    issues: [],
  }
}

function nextEntry(
  entry: FileSyncState,
  baseHash: string,
  localHash: string,
  backendHash: string | undefined,
): FileSyncState {
  return {
    ...entry,
    baseHash,
    localHash,
    baseBackendHash: backendHash,
    backendHash,
  }
}

function updateBlocked(
  path: string,
  entry: FileSyncState,
  mode: WorkspaceUpdateMode,
  issues: ValidationIssue[],
): WorkspaceUpdateOperation {
  return {
    state: 'blocked',
    path,
    kind: entry.kind,
    schema: entry.schema,
    entityType: entry.entityType,
    entityId: entry.entityId,
    mode,
    issues,
  }
}

function validateReviewOperationArtifact(operation: ApplyPlanOperation): ValidationIssue[] {
  try {
    validateApplyReview({
      rootPath: '.',
      summary: {
        create: operation.state === 'planned' && operation.action === 'create' ? 1 : 0,
        update: operation.state === 'planned' && operation.action === 'update' ? 1 : 0,
        delete: operation.state === 'planned' && operation.action === 'delete' ? 1 : 0,
        noop: operation.state === 'noop' ? 1 : 0,
        blocked: operation.state === 'blocked' ? 1 : 0,
        conflicts: operation.state === 'conflict' ? 1 : 0,
      },
      operations: [operation],
    })
    return []
  } catch (error) {
    if (!(error instanceof InvalidApplyReviewError)) throw error
    return error.issues.map((issue) => ({
      severity: 'error',
      path: stripOperationIssuePath(issue.path),
      message: issue.message,
    }))
  }
}

function stripOperationIssuePath(path: string): string {
  return path.startsWith('/operations/0') ? path.slice('/operations/0'.length) || '/' : path
}

function summarizeReview(rootPath: string, operations: ApplyPlanOperation[]): ApplyReview {
  const summary = {
    create: 0,
    update: 0,
    delete: 0,
    noop: 0,
    blocked: 0,
    conflicts: 0,
  }
  for (const operation of operations) {
    if (operation.state === 'blocked') summary.blocked += 1
    if (operation.state === 'conflict') summary.conflicts += 1
    if (operation.state === 'noop') summary.noop += 1
    if (operation.state === 'planned' && operation.action) {
      summary[operation.action] += 1
    }
  }
  return {
    rootPath,
    summary,
    operations: operations.sort((left, right) => left.filePath.localeCompare(right.filePath)),
  }
}

function summarizeUpdate(
  operations: WorkspaceUpdateOperation[],
  backendRevision?: string,
): WorkspaceUpdateResult {
  const summary = {
    updated: 0,
    deleted: 0,
    noop: 0,
    blocked: 0,
    conflicts: 0,
  }
  for (const operation of operations) {
    if (operation.state === 'updated') summary.updated += 1
    if (operation.state === 'deleted') summary.deleted += 1
    if (operation.state === 'noop') summary.noop += 1
    if (operation.state === 'blocked') summary.blocked += 1
    if (operation.state === 'conflict') summary.conflicts += 1
  }
  return {
    backendRevision,
    summary,
    operations: operations.sort((left, right) => left.path.localeCompare(right.path)),
  }
}

function restoreManifestBackendRevision(manifest: WorkspaceManifest, backendRevision: string | undefined): void {
  if (backendRevision === undefined) {
    delete manifest.backendRevision
    return
  }
  manifest.backendRevision = backendRevision
}

function updateOperationsAreComplete(operations: WorkspaceUpdateOperation[]): boolean {
  return operations.every((operation) => operation.state !== 'blocked' && operation.state !== 'conflict')
}

export function validateWorkspaceIgnorePaths(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  const issues: WorkspaceOptionsValidationIssue[] = []
  if (!Array.isArray(value)) {
    throw new InvalidEditableProjectionWorkspaceOptionsError([{
      path: '/ignorePaths',
      message: 'ignorePaths must be an array when present.',
    }])
  }
  const paths = value.map((path, index) => validateIgnoredPath(path, `/ignorePaths/${index}`, issues))
  if (issues.length > 0) {
    throw new InvalidEditableProjectionWorkspaceOptionsError(issues)
  }
  return paths
}

export function mergeWorkspaceIgnorePaths(
  ...groups: Array<readonly string[] | undefined>
): string[] {
  const merged: string[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    const paths = validateWorkspaceIgnorePaths(group)
    for (const path of paths ?? []) {
      if (seen.has(path)) continue
      seen.add(path)
      merged.push(path)
    }
  }
  return merged
}

function validateIgnoredPath(
  value: unknown,
  path: string,
  issues: WorkspaceOptionsValidationIssue[],
): string {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, message: 'ignore path must be a non-empty normalized relative path.' })
    return ''
  }
  const normalized = normalizePath(value)
  if (normalized !== value || normalized === '.' || pathHasCurrentSegment(value)) {
    issues.push({ path, message: 'ignore path must be a non-empty normalized relative path.' })
  }
  if (pathIsAbsolute(value)) {
    issues.push({ path, message: 'ignore path must be relative.' })
  }
  if (pathHasParentSegment(value)) {
    issues.push({ path, message: 'ignore path must not contain parent-directory segments.' })
  }
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateDependency(
  value: unknown,
  path: string,
  requiredMethods: string[],
  issues: WorkspaceOptionsValidationIssue[],
  optionalMethods: Record<string, string> = {},
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: `${path.slice(1)} must be an object.` })
    return
  }
  for (const method of requiredMethods) {
    if (typeof value[method] !== 'function') {
      issues.push({ path: `${path}/${method}`, message: `${method} must be a function.` })
    }
  }
  for (const [method, message] of Object.entries(optionalMethods)) {
    if (value[method] !== undefined && typeof value[method] !== 'function') {
      issues.push({ path: `${path}/${method}`, message })
    }
  }
}

function defaultIgnoredPaths(ignorePaths: string[] | undefined): string[] {
  return validateWorkspaceIgnorePaths(ignorePaths) ?? [...defaultEditableProjectionIgnorePaths]
}

function normalizeExecutionUpdateTargets(
  result: Awaited<ReturnType<CommandExecutor['execute']>>,
): WorkspaceUpdateTarget[] {
  if (!result) return []
  if (Array.isArray(result)) return result
  return result.updateTargets ?? []
}

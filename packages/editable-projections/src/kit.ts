import { createProjectionRegistry } from './registry.js'
import { InvalidEditableProjectionKitOptionsError } from './errors.js'
import {
  createEditableProjectionWorkspace,
  type EditableProjectionWorkspace,
} from './workspace.js'
import {
  createEditableProjectionWorkflow,
  type EditableProjectionWorkflow,
} from './workflow.js'
import {
  MemoryApplyReviewStore,
  MemoryManifestStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  MemoryWorkspaceUpdateTargetStore,
} from './memory.js'
import { validateFormatOptions, type FormatOptions } from './format.js'
import type {
  ApplyReview,
  ApplyReviewStore,
  BackendStore,
  CommandExecutor,
  EditableProjectionWorkspaceOptions,
  ManifestStore,
  ProjectionAdapter,
  ProjectionRegistryLike,
  SnapshotStore,
  WorkspaceFileSystem,
  WorkspaceManifest,
  WorkspaceUpdateTarget,
  WorkspaceUpdateTargetStore,
} from './types.js'

export interface EditableProjectionKitOptions<TCommand = unknown> {
  adapters?: ProjectionAdapter[]
  registry?: ProjectionRegistryLike
  backendStore: BackendStore
  executor?: CommandExecutor<TCommand>
  format?: FormatOptions
  ignorePaths?: string[]
}

export interface EditableProjectionKitWorkspaceOptions {
  fs: WorkspaceFileSystem
  manifestStore: ManifestStore
  snapshotStore: SnapshotStore
  backendStore?: BackendStore
  registry?: ProjectionRegistryLike
  ignorePaths?: string[]
}

export interface EditableProjectionKitWorkflowOptions<TCommand = unknown>
  extends EditableProjectionKitWorkspaceOptions {
  executor?: CommandExecutor<TCommand>
  reviewStore?: ApplyReviewStore<TCommand>
  updateTargetStore?: WorkspaceUpdateTargetStore
  format?: FormatOptions
}

export interface EditableProjectionKitMemoryWorkspaceOptions {
  initialFiles?: Record<string, string>
  manifest?: WorkspaceManifest
  bases?: Record<string, string>
  backendStore?: BackendStore
  registry?: ProjectionRegistryLike
  ignorePaths?: string[]
}

export interface EditableProjectionKitMemoryWorkflowOptions<TCommand = unknown>
  extends EditableProjectionKitMemoryWorkspaceOptions {
  initialReviews?: Record<string, ApplyReview<TCommand>>
  initialUpdateTargets?: Record<string, WorkspaceUpdateTarget[]>
  executor?: CommandExecutor<TCommand>
  format?: FormatOptions
}

export interface EditableProjectionKitMemoryWorkspace {
  workspace: EditableProjectionWorkspace
  fs: MemoryWorkspaceFileSystem
  manifestStore: MemoryManifestStore
  snapshotStore: MemorySnapshotStore
}

export interface EditableProjectionKitMemoryWorkflow<TCommand = unknown>
  extends EditableProjectionKitMemoryWorkspace {
  workflow: EditableProjectionWorkflow<TCommand>
  reviewStore: MemoryApplyReviewStore<TCommand>
  updateTargetStore: MemoryWorkspaceUpdateTargetStore
}

export interface EditableProjectionKit<TCommand = unknown> {
  registry: ProjectionRegistryLike
  backendStore: BackendStore
  executor?: CommandExecutor<TCommand>
  createWorkspace(options: EditableProjectionKitWorkspaceOptions): EditableProjectionWorkspace
  createWorkflow(options: EditableProjectionKitWorkflowOptions<TCommand>): EditableProjectionWorkflow<TCommand>
  createMemoryWorkspace(options?: EditableProjectionKitMemoryWorkspaceOptions): EditableProjectionKitMemoryWorkspace
  createMemoryWorkflow(options?: EditableProjectionKitMemoryWorkflowOptions<TCommand>): EditableProjectionKitMemoryWorkflow<TCommand>
}

export function createEditableProjectionKit<TCommand = unknown>(
  options: EditableProjectionKitOptions<TCommand>,
): EditableProjectionKit<TCommand> {
  assertKitOptions(options)
  const baseFormat = options.format === undefined ? undefined : validateFormatOptions(options.format)
  const registry = options.registry ?? createProjectionRegistry(options.adapters ?? [])

  function workspaceOptions(
    workspaceOptions: EditableProjectionKitWorkspaceOptions,
  ): EditableProjectionWorkspaceOptions {
    return {
      fs: workspaceOptions.fs,
      manifestStore: workspaceOptions.manifestStore,
      snapshotStore: workspaceOptions.snapshotStore,
      backendStore: workspaceOptions.backendStore ?? options.backendStore,
      registry: workspaceOptions.registry ?? registry,
      ignorePaths: workspaceOptions.ignorePaths ?? options.ignorePaths,
    }
  }

  function createWorkspace(
    createOptions: EditableProjectionKitWorkspaceOptions,
  ): EditableProjectionWorkspace {
    return createEditableProjectionWorkspace(workspaceOptions(createOptions))
  }

  function createWorkflow(
    createOptions: EditableProjectionKitWorkflowOptions<TCommand>,
  ): EditableProjectionWorkflow<TCommand> {
    const {
      executor,
      reviewStore,
      updateTargetStore,
      format,
      ...workspaceCreateOptions
    } = createOptions
    return createEditableProjectionWorkflow({
      workspace: createWorkspace(workspaceCreateOptions),
      executor: executor ?? options.executor,
      reviewStore,
      updateTargetStore,
      format: mergeFormatOptions(baseFormat, format),
    })
  }

  function createMemoryWorkspace(
    createOptions: EditableProjectionKitMemoryWorkspaceOptions = {},
  ): EditableProjectionKitMemoryWorkspace {
    const fs = new MemoryWorkspaceFileSystem(createOptions.initialFiles)
    const manifestStore = new MemoryManifestStore(createOptions.manifest)
    const snapshotStore = new MemorySnapshotStore(createOptions.bases)
    return {
      fs,
      manifestStore,
      snapshotStore,
      workspace: createWorkspace({
        fs,
        manifestStore,
        snapshotStore,
        backendStore: createOptions.backendStore,
        registry: createOptions.registry,
        ignorePaths: createOptions.ignorePaths,
      }),
    }
  }

  function createMemoryWorkflow(
    createOptions: EditableProjectionKitMemoryWorkflowOptions<TCommand> = {},
  ): EditableProjectionKitMemoryWorkflow<TCommand> {
    const workspaceBundle = createMemoryWorkspace(createOptions)
    const reviewStore = new MemoryApplyReviewStore<TCommand>(createOptions.initialReviews)
    const updateTargetStore = new MemoryWorkspaceUpdateTargetStore(createOptions.initialUpdateTargets)
    return {
      ...workspaceBundle,
      reviewStore,
      updateTargetStore,
      workflow: createEditableProjectionWorkflow({
        workspace: workspaceBundle.workspace,
        executor: createOptions.executor ?? options.executor,
        reviewStore,
        updateTargetStore,
        format: mergeFormatOptions(baseFormat, createOptions.format),
      }),
    }
  }

  return {
    registry,
    backendStore: options.backendStore,
    executor: options.executor,
    createWorkspace,
    createWorkflow,
    createMemoryWorkspace,
    createMemoryWorkflow,
  }
}

function mergeFormatOptions(
  base: FormatOptions | undefined,
  override: FormatOptions | undefined,
): FormatOptions {
  const baseFormat = base === undefined ? {} : validateFormatOptions(base)
  const overrideFormat = override === undefined ? {} : validateFormatOptions(override)
  return validateFormatOptions({
    ...baseFormat,
    ...overrideFormat,
  })
}

export function assertKitOptions(options: {
  registry?: ProjectionRegistryLike
  adapters?: ProjectionAdapter[]
  backendStore?: BackendStore
  executor?: CommandExecutor
}): void {
  const issues: string[] = []
  if (!isRecord(options)) {
    throw new InvalidEditableProjectionKitOptionsError(['kit options must be an object.'])
  }

  validateKitRegistrationOptions(options.registry, options.adapters, issues)
  if (!isRecord(options.backendStore) || typeof options.backendStore.getEntity !== 'function') {
    issues.push('backendStore must be an object with a getEntity function.')
  }
  if (options.executor !== undefined && (!isRecord(options.executor) || typeof options.executor.execute !== 'function')) {
    issues.push('executor must be an object with an execute function when present.')
  }
  if (options.registry !== undefined && (!isRecord(options.registry) || typeof options.registry.get !== 'function' || typeof options.registry.getByEntityType !== 'function')) {
    issues.push('registry must be an object with get and getByEntityType functions when present.')
  }
  if (options.adapters !== undefined && !Array.isArray(options.adapters)) {
    issues.push('adapters must be an array when present.')
  }
  if (Array.isArray(options.adapters)) {
    for (const [index, adapter] of options.adapters.entries()) {
      if (!isProjectionAdapterLike(adapter)) {
        issues.push(`adapters[${index}] must be a projection adapter with schema, entityType, parseFile, validateFile, toProjection, and createCommands.`)
      }
    }
  }
  if (issues.length > 0) {
    throw new InvalidEditableProjectionKitOptionsError(issues)
  }
}

export function assertKitRegistrationOptions(
  registry: ProjectionRegistryLike | undefined,
  adapters: ProjectionAdapter[] | undefined,
): void {
  const issues: string[] = []
  validateKitRegistrationOptions(registry, adapters, issues)
  if (issues.length > 0) {
    throw new InvalidEditableProjectionKitOptionsError(issues)
  }
}

function validateKitRegistrationOptions(
  registry: ProjectionRegistryLike | undefined,
  adapters: ProjectionAdapter[] | undefined,
  issues: string[],
): void {
  if (registry && Array.isArray(adapters) && adapters.length > 0) {
    issues.push('Pass either registry or adapters, not both. Register adapters in the supplied registry before creating the kit.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isProjectionAdapterLike(value: unknown): value is ProjectionAdapter {
  return isRecord(value)
    && typeof value.schema === 'string'
    && value.schema.length > 0
    && typeof value.entityType === 'string'
    && value.entityType.length > 0
    && typeof value.parseFile === 'function'
    && typeof value.validateFile === 'function'
    && typeof value.toProjection === 'function'
    && typeof value.createCommands === 'function'
}

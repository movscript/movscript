import { createEditableProjectionKit, type EditableProjectionKit, type EditableProjectionKitMemoryWorkflow } from './kit.js'
import { MemoryBackendStore } from './memory.js'
import type { FormatOptions } from './format.js'
import {
  runEditableProjectionIntegrationContractGate,
  type EditableProjectionIntegrationContractGateResult,
} from './integrationContract.js'
import type { ProjectionAdapterContractOptions } from './adapterContract.js'
import type { EditableProjectionWorkflowContractOptions } from './workflowContract.js'
import type {
  ApplyReview,
  BackendEntitySnapshot,
  CommandExecutor,
  EntityId,
  ProjectionAdapter,
  ProjectionRegistryLike,
  WorkspaceManifest,
  WorkspaceUpdateTarget,
} from './types.js'

export interface EditableProjectionMemoryTestHarnessOptions<TCommand = unknown> {
  adapters?: ProjectionAdapter[]
  registry?: ProjectionRegistryLike
  backendStore?: MemoryBackendStore
  backendEntities?: BackendEntitySnapshot[]
  executor?: CommandExecutor<TCommand>
  format?: FormatOptions
  ignorePaths?: string[]
  initialFiles?: Record<string, string>
  manifest?: WorkspaceManifest
  bases?: Record<string, string>
  initialReviews?: Record<string, ApplyReview<TCommand>>
  initialUpdateTargets?: Record<string, WorkspaceUpdateTarget[]>
}

export interface EditableProjectionMemoryTestHarness<TCommand = unknown>
  extends EditableProjectionKitMemoryWorkflow<TCommand> {
  backendStore: MemoryBackendStore
  kit: EditableProjectionKit<TCommand>
  registry: ProjectionRegistryLike
}

export interface EditableProjectionMemoryIntegrationContractGateOptions<TFile, TEntity, TCommand = unknown>
  extends EditableProjectionMemoryTestHarnessOptions<TCommand> {
  adapter: ProjectionAdapter<TFile, TEntity, TCommand>
  entity: TEntity
  updateTarget: WorkspaceUpdateTarget
  validFile: string
  editFile(current: string): string | Promise<string>
  invalidFile?: string
  filePath?: string
  entityId?: EntityId
  commandInput?: ProjectionAdapterContractOptions<TFile, TEntity, TCommand>['commandInput']
  rootPath?: string
  reviewPath?: string
  updateTargetPath?: string
}

export interface EditableProjectionMemoryIntegrationContractGateResult<TCommand = unknown>
  extends EditableProjectionIntegrationContractGateResult<TCommand> {
  harness: EditableProjectionMemoryTestHarness<TCommand>
}

export function createEditableProjectionMemoryTestHarness<TCommand = unknown>(
  options: EditableProjectionMemoryTestHarnessOptions<TCommand> = {},
): EditableProjectionMemoryTestHarness<TCommand> {
  const backendStore = options.backendStore ?? new MemoryBackendStore()
  for (const entity of options.backendEntities ?? []) {
    backendStore.setEntity(entity)
  }

  const kit = createEditableProjectionKit<TCommand>({
    adapters: options.adapters,
    registry: options.registry,
    backendStore,
    executor: options.executor,
    format: options.format,
    ignorePaths: options.ignorePaths,
  })
  const bundle = kit.createMemoryWorkflow({
    initialFiles: options.initialFiles,
    manifest: options.manifest,
    bases: options.bases,
    initialReviews: options.initialReviews,
    initialUpdateTargets: options.initialUpdateTargets,
  })

  return {
    ...bundle,
    backendStore,
    kit,
    registry: kit.registry,
  }
}

export async function runEditableProjectionMemoryIntegrationContractGate<TFile, TEntity, TCommand = unknown>(
  options: EditableProjectionMemoryIntegrationContractGateOptions<TFile, TEntity, TCommand>,
): Promise<EditableProjectionMemoryIntegrationContractGateResult<TCommand>> {
  const {
    adapter,
    entity,
    updateTarget,
    validFile,
    editFile,
    invalidFile,
    filePath,
    entityId,
    commandInput,
    rootPath,
    reviewPath,
    updateTargetPath,
    adapters,
    registry,
    backendStore,
    backendEntities,
    executor,
    format,
    ignorePaths,
    initialFiles,
    manifest,
    bases,
    initialReviews,
    initialUpdateTargets,
  } = options
  const harness = createEditableProjectionMemoryTestHarness<TCommand>({
    adapters: adapters ?? (registry ? undefined : [adapter]),
    registry,
    backendStore,
    backendEntities,
    executor,
    format,
    ignorePaths,
    initialFiles,
    manifest,
    bases,
    initialReviews,
    initialUpdateTargets,
  })
  const gate = await runEditableProjectionIntegrationContractGate<TFile, TEntity, TCommand>({
    adapter: {
      adapter,
      entity,
      validFile,
      invalidFile,
      filePath,
      entityId,
      commandInput,
    },
    workflow: {
      workflow: harness.workflow,
      fs: harness.fs,
      updateTarget,
      editFile,
      rootPath,
      reviewPath,
      updateTargetPath,
    } satisfies EditableProjectionWorkflowContractOptions<TCommand>,
  })

  return {
    ...gate,
    harness,
  }
}

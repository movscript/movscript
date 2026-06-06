import {
  MemoryApplyReviewStore,
  MemoryBackendStore,
  MemoryManifestStore,
  MemorySnapshotStore,
  MemoryWorkspaceFileSystem,
  MemoryWorkspaceUpdateTargetStore,
  MissingWorkspaceUpdateTargetStoreError,
  assertKitOptions,
  assertEditableProjectionIntegrationContract,
  assertEditableProjectionWorkflowContract,
  assertEditableProjectionWorkflowToolAdapterContract,
  assertProjectionAdapterContract,
  createCommandExecutor,
  createCrudCommandExecutor,
  createEditableProjectionKit,
  createEditableProjectionWorkflowBridge,
  createEditableProjectionWorkflowFromOptions,
  createEditableProjectionWorkflowOperationRouter,
  createEditableProjectionWorkflowOperationToolDefinitions,
  createEditableProjectionWorkflowToolAdapter,
  createGeneratedIndexUpdateTarget,
  createJsonProjectionAdapter,
  createMaterializedViewUpdateTarget,
  defaultEditableProjectionIgnorePaths,
  editableProjectionArtifactCompatibility,
  editableProjectionArtifactSchemas,
  editableProjectionArtifactVersions,
  editableProjectionWorkflowOperationJsonSchema,
  editableProjectionWorkflowOperationNames,
  editableProjectionWorkflowOperationSpecs,
  editableProjectionWorkflowOperationToolDefinitions,
  getEditableProjectionWorkflowOperationJsonSchema,
  getEditableProjectionWorkflowOperationNameForToolName,
  getEditableProjectionWorkflowOperationSpec,
  getEditableProjectionWorkflowOperationToolDefinition,
  parseEditableProjectionArtifactCompatibilityJson,
  mergeWorkspaceIgnorePaths,
  movscriptAssetSlotPath,
  movscriptAssetSlotProjectionSchema,
  movscriptAssetSlotUpdateTarget,
  movscriptCreativeReferenceAdapter,
  movscriptCreativeReferencePath,
  movscriptCreativeReferenceProjectionSchema,
  movscriptCreativeReferenceUpdateTarget,
  movscriptProjectAdapters,
  movscriptProjectRelativeAssetSlotPath,
  movscriptProjectRelativeCreativeReferencePath,
  noteProjectionAdapter,
  noteProjectionPath,
  noteProjectionUpdateTarget,
  runEditableProjectionBridgeOperation,
  runEditableProjectionIntegrationContractGate,
  runEditableProjectionWorkflowOperation,
  runEditableProjectionWorkflowOperationJson,
  runEditableProjectionWorkflowToolCall,
  runEditableProjectionWorkflowToolCallJson,
  runNoteProjectionExample,
  runNoteProjectionIntegrationContractExample,
  runNoteProjectionToolAdapterExample,
  createProjectionRegistry,
  createWritableProjectionDeleteTarget,
  createWritableProjectionUpdateTarget,
  createWritableProjectionUpdateTargets,
  formatEditableProjectionArtifactCompatibilityMarkdown,
  formatEditableProjectionArtifactCompatibilityReportMarkdown,
  formatEditableProjectionIntegrationContractMarkdown,
  formatSerializedEditableProjectionErrorMarkdown,
  InvalidEditableProjectionArtifactCompatibilityError,
  InvalidEditableProjectionBridgeOperationError,
  InvalidEditableProjectionKitOptionsError,
  InvalidEditableProjectionIntegrationContractError,
  InvalidEditableProjectionWorkflowContractError,
  InvalidEditableProjectionWorkflowOptionsError,
  InvalidEditableProjectionWorkspaceOptionsError,
  InvalidFormatOptionsError,
  InvalidWorkspaceApplyOptionsError,
  InvalidWorkspaceReviewOptionsError,
  InvalidWorkspaceStatusArtifactError,
  InvalidProjectionAdapterContractError,
  InvalidProjectionCommandResultError,
  InvalidWorkspaceUpdateOptionsError,
  isEditableProjectionErrorCode,
  isSerializedEditableProjectionError,
  normalizeSerializedEditableProjectionError,
  parseApplyReviewJson,
  parseApplyResultJson,
  parseEditableProjectionBridgeResultJson,
  parseEditableProjectionIntegrationContractReportJson,
  parseEditableProjectionWorkflowOperationJson,
  parseSerializedEditableProjectionErrorJson,
  parseWorkspaceStatusJson,
  parseWorkspaceUpdateResultJson,
  parseWorkspaceUpdateTargetsJson,
  pathHasCurrentSegment,
  pathIsAbsolute,
  serializeEditableProjectionArtifactCompatibilityJson,
  serializeEditableProjectionBridgeResultJson,
  serializeEditableProjectionIntegrationContractReportJson,
  serializeEditableProjectionWorkflowOperationJson,
  serializeEditableProjectionError,
  serializeEditableProjectionErrorJson,
  serializeApplyResultJson,
  serializeWorkspaceStatusJson,
  serializeWorkspaceUpdateResultJson,
  serializeWorkspaceUpdateTargetsJson,
  validateEditableProjectionArtifactCompatibility,
  validateEditableProjectionBridgeResultJson,
  validateEditableProjectionWorkflowOperation,
  validateApplyResult,
  validateFormatOptions,
  validateEditableProjectionIntegrationContractOptions,
  validateEditableProjectionIntegrationContractReport,
  validateEditableProjectionWorkflowOptions,
  validateWorkflowApplyOptions,
  validateProjectionAdapterContractOptions,
  validateEditableProjectionWorkspaceOptions,
  validateWorkspaceIgnorePaths,
  validateWorkspaceApplyOptions,
  validateWorkspaceReviewOptions,
  validateWorkspaceStatus,
  validateWorkspaceUpdateResult,
  validateWorkspaceUpdateOptions,
  validateWorkflowContractOptions,
  validateWorkflowToolAdapterContractOptions,
  verifyEditableProjectionIntegrationContract,
  validateWorkflowReviewAndApplyOptions,
  validateWorkflowReviewOptions,
  validateWorkflowStatusOptions,
  validateWorkflowUpdateAndReviewOptions,
  validateWorkflowUpdateOptions,
  verifyEditableProjectionArtifactCompatibility,
  verifyEditableProjectionWorkflowContract,
  verifyEditableProjectionWorkflowToolAdapterContract,
  type BackendStore,
  type CommandExecutor,
  type CrudCommandExecutorOptions,
  type CrudCommandTypeMatcher,
  type EditableProjectionErrorCode,
  type EditableProjectionArtifactCompatibility,
  type EditableProjectionArtifactCompatibilityReport,
  type EditableProjectionBridgeResult,
  type EditableProjectionBridgeResultJson,
  type EditableProjectionWorkflowBridge,
  type EditableProjectionWorkflowOperation,
  type EditableProjectionWorkflowOperationJsonSchema,
  type EditableProjectionWorkflowOperationSpec,
  type EditableProjectionWorkflowOperationResult,
  type EditableProjectionWorkflowOperationRouter,
  type EditableProjectionWorkflowOperationToolDefinition,
  type EditableProjectionWorkflowToolAdapter,
  type EditableProjectionArtifactKind,
  type EditableProjectionIntegrationContractGateResult,
  type WorkflowBridgeApplyOptions,
  type ApplyResult,
  type JsonObject,
  type ProjectionCommandInput,
  type SerializedEditableProjectionError,
  type WorkspaceUpdateTarget,
  type WorkspaceUpdateResult,
  type WorkspaceStatus,
  type NoteProjectionExampleResult,
  type NoteProjectionIntegrationContractExampleResult,
  type NoteProjectionToolAdapterExampleResult,
} from '@movscript/editable-projections'
import {
  createNodeEditableProjectionKit,
  createNodeEditableProjectionWorkflow,
  type NodeEditableProjectionKit,
  type NodeEditableProjectionWorkflow,
} from '@movscript/editable-projections/node'
import {
  MemoryBackendStore as TestingMemoryBackendStore,
  assertEditableProjectionIntegrationContract as assertIntegrationContractFromTesting,
  createEditableProjectionMemoryTestHarness,
  runEditableProjectionMemoryIntegrationContractGate,
  validateEditableProjectionIntegrationContractOptions as validateIntegrationContractOptionsFromTesting,
  verifyEditableProjectionIntegrationContract as verifyIntegrationContractFromTesting,
  runEditableProjectionIntegrationContractGate as runIntegrationContractGateFromTesting,
  type EditableProjectionMemoryTestHarness,
  type EditableProjectionMemoryIntegrationContractGateResult,
  type EditableProjectionIntegrationContractReport,
} from '@movscript/editable-projections/testing'
import {
  noteProjectionPath as noteProjectionSubpath,
  runNoteProjectionExample as runNoteProjectionSubpathExample,
  runNoteProjectionIntegrationContractExample as runNoteProjectionSubpathIntegrationContractExample,
  runNoteProjectionToolAdapterExample as runNoteProjectionSubpathToolAdapterExample,
} from '@movscript/editable-projections/examples/note'
import {
  movscriptCreativeReferencePath as movscriptCreativeReferenceSubpath,
  movscriptAssetSlotPath as movscriptAssetSlotSubpath,
  movscriptProjectAdapters as movscriptProjectAdaptersSubpath,
  movscriptProjectRelativeAssetSlotPath as movscriptProjectRelativeAssetSlotSubpath,
  movscriptProjectRelativeCreativeReferencePath as movscriptProjectRelativeCreativeReferenceSubpath,
} from '@movscript/editable-projections/examples/movscript-asset-slot'
import {
  createMovScriptProjectEditableProjectionKit,
  createMovScriptProjectNodeProjectionKit,
} from '@movscript/editable-projections/examples/movscript-project'

interface NoteProjection extends JsonObject {
  schema: 'example.note.v1'
  id: number | null
  title: string
}

interface NoteEntity {
  id: number
  title: string
}

interface NoteDeleteResult {
  id: number
}

interface NoteCommand {
  type: 'note.create' | 'note.update' | 'note.delete'
  entityId?: string | number
  target?: NoteProjection
}

const noteAdapter = createJsonProjectionAdapter<NoteProjection, NoteEntity, NoteCommand>({
  schema: 'example.note.v1',
  entityType: 'note',
  toProjection(entity) {
    return {
      schema: 'example.note.v1',
      id: entity.id,
      title: entity.title,
    }
  },
  validate(value) {
    return typeof value.title === 'string' && value.title.length > 0
      ? []
      : [{ severity: 'error', path: '/title', message: 'Title is required.' }]
  },
  createCommands(input: ProjectionCommandInput<NoteProjection>): NoteCommand[] {
    return [{
      type: `note.${input.action}`,
      ...(input.entity.entityId !== undefined ? { entityId: input.entity.entityId } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
    } as NoteCommand]
  },
})

const registry = createProjectionRegistry([noteAdapter])
const backendStore: BackendStore = new MemoryBackendStore([{
  entityType: 'note',
  entityId: 1,
  hash: 'note-v1',
  value: { id: 1, title: 'Draft' } satisfies NoteEntity,
}])
const mutableBackendStore = new MemoryBackendStore()
mutableBackendStore.setEntity({
  entityType: 'note',
  entityId: 2,
  hash: 'note-v1',
  value: { id: 2, title: 'Second' } satisfies NoteEntity,
})
const listedBackendEntities = mutableBackendStore.listEntities()
const deletedBackendEntity: boolean = mutableBackendStore.deleteEntity({ entityType: 'note', entityId: 2 })
mutableBackendStore.clear()
void listedBackendEntities
void deletedBackendEntity
const absolutePath: boolean = pathIsAbsolute('/tmp/note.json')
const currentSegmentPath: boolean = pathHasCurrentSegment('notes/./note_1.json')
const artifactKind: EditableProjectionArtifactKind = 'applyReview'
const artifactCompatibility: EditableProjectionArtifactCompatibility = editableProjectionArtifactCompatibility
const applyReviewSchema: string = editableProjectionArtifactSchemas.applyReview
const workspaceStatusSchema: string = editableProjectionArtifactSchemas.workspaceStatus
const manifestVersion: 1 = editableProjectionArtifactVersions.workspaceManifest
const workspaceStatusVersion: 1 = editableProjectionArtifactVersions.workspaceStatus
const artifactCompatibilityMarkdown: string = formatEditableProjectionArtifactCompatibilityMarkdown()
const serializedArtifactCompatibility: string = serializeEditableProjectionArtifactCompatibilityJson()
const parsedArtifactCompatibility: EditableProjectionArtifactCompatibility = parseEditableProjectionArtifactCompatibilityJson(
  serializedArtifactCompatibility,
)
const validatedArtifactCompatibility: EditableProjectionArtifactCompatibility = validateEditableProjectionArtifactCompatibility(
  parsedArtifactCompatibility,
)
const artifactCompatibilityReport: EditableProjectionArtifactCompatibilityReport = verifyEditableProjectionArtifactCompatibility(
  parsedArtifactCompatibility,
)
const artifactCompatibilityReportMarkdown: string = formatEditableProjectionArtifactCompatibilityReportMarkdown(
  artifactCompatibilityReport,
)
const bridgeResultPromise: Promise<EditableProjectionBridgeResult<{ count: number }>> = runEditableProjectionBridgeOperation(
  () => ({ count: 1 }),
  {
    markdown: (value) => `Count: ${value.count}.`,
    json: (value) => `${JSON.stringify(value)}\n`,
  },
)
const bridgeResultJson: string = serializeEditableProjectionBridgeResultJson({
  ok: true,
  result: { count: 1 },
  markdown: 'Count: 1.',
})
const parsedBridgeResultJson: EditableProjectionBridgeResultJson = parseEditableProjectionBridgeResultJson(bridgeResultJson)
const validatedBridgeResultJson: EditableProjectionBridgeResultJson = validateEditableProjectionBridgeResultJson(parsedBridgeResultJson)
const statusArtifact: WorkspaceStatus = validateWorkspaceStatus({
  rootPath: '.',
  files: [{
    path: 'data/notes/note_1.json',
    state: 'clean',
  }],
})
const serializedStatusArtifact: string = serializeWorkspaceStatusJson(statusArtifact)
const parsedStatusArtifact: WorkspaceStatus = parseWorkspaceStatusJson(serializedStatusArtifact)
const updateResultArtifact: WorkspaceUpdateResult = validateWorkspaceUpdateResult({
  summary: { updated: 0, deleted: 0, noop: 0, blocked: 0, conflicts: 0 },
  operations: [],
})
const serializedUpdateResultArtifact: string = serializeWorkspaceUpdateResultJson(updateResultArtifact)
const parsedUpdateResultArtifact: WorkspaceUpdateResult = parseWorkspaceUpdateResultJson(serializedUpdateResultArtifact)
const applyResultArtifact: ApplyResult = validateApplyResult({ appliedOperations: 0, appliedCommands: 0 })
const serializedApplyResultArtifact: string = serializeApplyResultJson(applyResultArtifact)
const parsedApplyResultArtifact: ApplyResult = parseApplyResultJson(serializedApplyResultArtifact)
const updateOptions = validateWorkspaceUpdateOptions({ mode: 'safe', backendRevision: 'rev-1' })
const reviewOptions = validateWorkspaceReviewOptions({ includeNoop: true })
const formatOptions = validateFormatOptions({ includeCommands: true, maxPatchOperations: 5 })
const ignorePaths = validateWorkspaceIgnorePaths(['meta', 'reviews'])
const mergedIgnorePaths: string[] = mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, ['custom/cache'])
const workspaceOptions = validateEditableProjectionWorkspaceOptions({
  fs: new MemoryWorkspaceFileSystem(),
  manifestStore: new MemoryManifestStore(),
  snapshotStore: new MemorySnapshotStore(),
  backendStore,
  registry,
  ignorePaths: ['meta', 'reviews'],
})
void absolutePath
void currentSegmentPath
void artifactKind
void artifactCompatibility
void applyReviewSchema
void workspaceStatusSchema
void manifestVersion
void workspaceStatusVersion
void artifactCompatibilityMarkdown
void serializedArtifactCompatibility
void parsedArtifactCompatibility
void validatedArtifactCompatibility
void artifactCompatibilityReport
void artifactCompatibilityReportMarkdown
void bridgeResultPromise
void bridgeResultJson
void parsedBridgeResultJson
void validatedBridgeResultJson
void statusArtifact
void serializedStatusArtifact
void parsedStatusArtifact
void updateResultArtifact
void serializedUpdateResultArtifact
void parsedUpdateResultArtifact
void applyResultArtifact
void serializedApplyResultArtifact
void parsedApplyResultArtifact
void updateOptions
void reviewOptions
void formatOptions
void ignorePaths
void mergedIgnorePaths
void workspaceOptions
void InvalidEditableProjectionWorkspaceOptionsError
void InvalidEditableProjectionArtifactCompatibilityError
void InvalidFormatOptionsError
void InvalidWorkspaceApplyOptionsError
void InvalidWorkspaceReviewOptionsError
void InvalidWorkspaceStatusArtifactError
void InvalidWorkspaceUpdateOptionsError
void InvalidEditableProjectionIntegrationContractError

const executor: CommandExecutor<NoteCommand> = createCommandExecutor<NoteCommand>({
  handlers: {
    'note.update': async (command) => ({
      updateTargets: [noteUpdateTarget({
        id: Number(command.target?.id ?? command.entityId),
        title: command.target?.title ?? 'Updated',
      })],
    }),
  },
  unknownCommand: 'ignore',
})
const crudExecutorOptions: CrudCommandExecutorOptions<NoteCommand, NoteEntity, NoteEntity, NoteDeleteResult> = {
  commandTypes: {
    create: 'note.create',
    update: ['note.update'],
    delete: 'note.delete',
  },
  create: (command) => ({ id: Number(command.entityId ?? 3), title: command.target?.title ?? 'Created' }),
  update: (command) => ({ id: Number(command.entityId ?? command.target?.id ?? 1), title: command.target?.title ?? 'Updated' }),
  delete: (command) => ({ id: Number(command.entityId ?? 1) }),
  refresh: {
    create: (result) => [noteUpdateTarget({
      id: Number(result.id),
      title: result.title,
    })],
    update: (result) => ({
      updateTargets: [noteUpdateTarget({
        id: Number(result.id),
        title: result.title,
      })],
    }),
    delete: (result) => [noteDeleteTarget(Number(result.id))],
  },
}
const crudExecutor: CommandExecutor<NoteCommand> = createCrudCommandExecutor<NoteCommand, NoteEntity, NoteEntity, NoteDeleteResult>(crudExecutorOptions)
const crudCommandTypeMatcher: CrudCommandTypeMatcher = ['note.create', 'note.update']
const applyOptions = validateWorkspaceApplyOptions<NoteCommand>({
  executor,
  allowConflicts: true,
  allowStaleReview: false,
  refreshMode: 'overwrite',
})
void applyOptions
void crudExecutor
void crudCommandTypeMatcher

const workflow = createEditableProjectionWorkflowFromOptions<NoteCommand>({
  fs: new MemoryWorkspaceFileSystem(),
  manifestStore: new MemoryManifestStore(),
  snapshotStore: new MemorySnapshotStore(),
  backendStore,
  registry,
  reviewStore: new MemoryApplyReviewStore<NoteCommand>(),
  updateTargetStore: new MemoryWorkspaceUpdateTargetStore(),
  executor,
})
const workflowOptions = validateEditableProjectionWorkflowOptions<NoteCommand>({
  workspace: {
    status() {},
    applyReview() {},
    update() {},
    apply() {},
  },
  executor,
  reviewStore: new MemoryApplyReviewStore<NoteCommand>(),
  updateTargetStore: new MemoryWorkspaceUpdateTargetStore(),
  format: { includeCommands: true },
})
void workflowOptions
const workflowStatusOptions = validateWorkflowStatusOptions({ format: { includeNoop: true } })
const workflowReviewOptions = validateWorkflowReviewOptions({ includeNoop: true })
const workflowUpdateOptions = validateWorkflowUpdateOptions({ mode: 'safe', backendRevision: 'rev-2' })
const workflowUpdateAndReviewOptions = validateWorkflowUpdateAndReviewOptions({ mode: 'overwrite', includeNoop: true })
const workflowApplyOptions = validateWorkflowApplyOptions<NoteCommand>({ executor, allowConflicts: true })
const workflowReviewAndApplyOptions = validateWorkflowReviewAndApplyOptions<NoteCommand>({ includeNoop: true, allowConflicts: true })
void workflowStatusOptions
void workflowReviewOptions
void workflowUpdateOptions
void workflowUpdateAndReviewOptions
void workflowApplyOptions
void workflowReviewAndApplyOptions

const kit = createEditableProjectionKit<NoteCommand>({
  adapters: [noteAdapter],
  backendStore,
  executor,
})
const workflowBridge: EditableProjectionWorkflowBridge<NoteCommand> = createEditableProjectionWorkflowBridge(workflow)
const workflowOperationRouter: EditableProjectionWorkflowOperationRouter<NoteCommand> = createEditableProjectionWorkflowOperationRouter(workflow)
const workflowToolAdapter: EditableProjectionWorkflowToolAdapter<NoteCommand> = createEditableProjectionWorkflowToolAdapter(workflow)
const workflowOperationName: string = editableProjectionWorkflowOperationNames[0]
const workflowOperationJsonSchema: EditableProjectionWorkflowOperationJsonSchema = editableProjectionWorkflowOperationJsonSchema
const workflowOperationStatusJsonSchema: EditableProjectionWorkflowOperationJsonSchema = getEditableProjectionWorkflowOperationJsonSchema('status')
const workflowOperationSpec: EditableProjectionWorkflowOperationSpec = getEditableProjectionWorkflowOperationSpec('status')
const workflowOperationSpecCount: number = editableProjectionWorkflowOperationSpecs.length
const workflowOperationToolDefinition: EditableProjectionWorkflowOperationToolDefinition = getEditableProjectionWorkflowOperationToolDefinition('status')
const workflowOperationToolInputSchema: EditableProjectionWorkflowOperationJsonSchema = workflowOperationToolDefinition.inputSchema
const workflowOperationToolOperationSchema: EditableProjectionWorkflowOperationJsonSchema = workflowOperationToolDefinition.operationSchema
const workflowOperationToolDefinitionCount: number = editableProjectionWorkflowOperationToolDefinitions.length
const customWorkflowOperationToolDefinitions: readonly EditableProjectionWorkflowOperationToolDefinition[] = createEditableProjectionWorkflowOperationToolDefinitions({
  namePrefix: 'workspace_',
})
const workflowOperationNameFromTool: string | undefined = getEditableProjectionWorkflowOperationNameForToolName('editable_projection_status')
const workflowOperation: EditableProjectionWorkflowOperation<NoteCommand> = validateEditableProjectionWorkflowOperation({
  operation: 'status',
  path: 'data/notes',
})
const serializedWorkflowOperation: string = serializeEditableProjectionWorkflowOperationJson(workflowOperation)
const parsedWorkflowOperation: EditableProjectionWorkflowOperation<NoteCommand> = parseEditableProjectionWorkflowOperationJson(
  serializedWorkflowOperation,
)
const workflowBridgeApplyOptions: WorkflowBridgeApplyOptions<NoteCommand> = { allowConflicts: true }
assertKitOptions({
  adapters: [noteAdapter],
  backendStore,
  executor,
})

const memoryWorkflow = kit.createMemoryWorkflow()
const exampleNotePath: string = noteProjectionPath(1)
const exampleNoteTarget: WorkspaceUpdateTarget = noteProjectionUpdateTarget({
  id: 1,
  title: 'Draft',
})
const exampleNoteAdapterSchema: string = noteProjectionAdapter.schema
const exampleCreativeReferencePath: string = movscriptCreativeReferencePath(1, 8)
const exampleCreativeReferenceTarget: WorkspaceUpdateTarget = movscriptCreativeReferenceUpdateTarget({
  ID: 8,
  projectId: 1,
  kind: 'person',
  name: 'Lina',
})
const exampleCreativeReferenceAdapterSchema: string = movscriptCreativeReferenceAdapter.schema
const exampleCreativeReferenceProjectionSchema: string = movscriptCreativeReferenceProjectionSchema
const exampleAssetSlotPath: string = movscriptAssetSlotPath(1, 12)
const exampleAssetSlotTarget: WorkspaceUpdateTarget = movscriptAssetSlotUpdateTarget({
  ID: 12,
  projectId: 1,
  owner: { type: 'creative_reference', id: 8 },
  kind: 'image',
  name: 'Hero portrait',
})
const exampleAssetSlotProjectionSchema: string = movscriptAssetSlotProjectionSchema
const exampleMovScriptAdapterCount: number = movscriptProjectAdapters.length
const exampleProjectRelativeReferencePath: string = movscriptProjectRelativeCreativeReferencePath(8)
const exampleProjectRelativeAssetSlotPath: string = movscriptProjectRelativeAssetSlotPath(12)
const exampleMovScriptProjectKitFactory: typeof createMovScriptProjectEditableProjectionKit = createMovScriptProjectEditableProjectionKit
const exampleMovScriptProjectNodeKitFactory: typeof createMovScriptProjectNodeProjectionKit = createMovScriptProjectNodeProjectionKit
void exampleNotePath
void exampleNoteTarget
void exampleNoteAdapterSchema
void exampleCreativeReferencePath
void exampleCreativeReferenceTarget
void exampleCreativeReferenceAdapterSchema
void exampleCreativeReferenceProjectionSchema
void exampleAssetSlotPath
void exampleAssetSlotTarget
void exampleAssetSlotProjectionSchema
void exampleMovScriptAdapterCount
void exampleProjectRelativeReferencePath
void exampleProjectRelativeAssetSlotPath
void exampleMovScriptProjectKitFactory
void exampleMovScriptProjectNodeKitFactory
void workflowBridge
void workflowOperationRouter
void workflowToolAdapter
void workflowOperationName
void workflowOperationJsonSchema
void workflowOperationStatusJsonSchema
void workflowOperationSpec
void workflowOperationSpecCount
void workflowOperationToolDefinition
void workflowOperationToolInputSchema
void workflowOperationToolOperationSchema
void workflowOperationToolDefinitionCount
void customWorkflowOperationToolDefinitions
void workflowOperationNameFromTool
void workflowOperation
void serializedWorkflowOperation
void parsedWorkflowOperation
void workflowBridgeApplyOptions
void InvalidEditableProjectionBridgeOperationError

async function consumeNoteExample(): Promise<void> {
  const result: NoteProjectionExampleResult = await runNoteProjectionExample()
  const integrationContractResult: NoteProjectionIntegrationContractExampleResult = await runNoteProjectionIntegrationContractExample()
  const toolAdapterResult: NoteProjectionToolAdapterExampleResult = await runNoteProjectionToolAdapterExample()
  const commandType: string = result.commands[0]?.type ?? ''
  const subpathResult: NoteProjectionExampleResult = await runNoteProjectionSubpathExample()
  const subpathIntegrationContractResult: NoteProjectionIntegrationContractExampleResult = await runNoteProjectionSubpathIntegrationContractExample()
  const subpathToolAdapterResult: NoteProjectionToolAdapterExampleResult = await runNoteProjectionSubpathToolAdapterExample()
  const subpathNotePath: string = noteProjectionSubpath(1)
  const subpathCreativeReferencePath: string = movscriptCreativeReferenceSubpath(1, 8)
  const subpathAssetSlotPath: string = movscriptAssetSlotSubpath(1, 12)
  const subpathProjectAdapterCount: number = movscriptProjectAdaptersSubpath.length
  const subpathProjectRelativeReferencePath: string = movscriptProjectRelativeCreativeReferenceSubpath(8)
  const subpathProjectRelativeAssetSlotPath: string = movscriptProjectRelativeAssetSlotSubpath(12)
  void commandType
  void integrationContractResult
  void toolAdapterResult
  void subpathResult
  void subpathIntegrationContractResult
  void subpathToolAdapterResult
  void subpathNotePath
  void subpathCreativeReferencePath
  void subpathAssetSlotPath
  void subpathProjectAdapterCount
  void subpathProjectRelativeReferencePath
  void subpathProjectRelativeAssetSlotPath
}

async function consumeWorkflow(): Promise<void> {
  const bridgedStatus = await workflowBridge.status('data/notes')
  const bridgedStatusOk: boolean = bridgedStatus.ok
  const bridgedStatusMarkdown: string | undefined = bridgedStatus.markdown
  const routedStatus = await workflowOperationRouter.run({ operation: 'status', path: 'data/notes' })
  const routedStatusOk: boolean = routedStatus.ok
  const adaptedStatus = await workflowToolAdapter.run('editable_projection_status', { path: 'data/notes' })
  const adaptedStatusOk: boolean = adaptedStatus.ok
  const adaptedOperationName: string | undefined = workflowToolAdapter.getOperationName('editable_projection_status')
  const routedJsonStatus = await workflowOperationRouter.runJson(serializeEditableProjectionWorkflowOperationJson({
    operation: 'status',
    path: 'data/notes',
  }))
  const adaptedJsonStatus = await workflowToolAdapter.runJson('editable_projection_status', JSON.stringify({
    path: 'data/notes',
  }))
  const adaptedJsonStatusOk: boolean = adaptedJsonStatus.ok
  const routedJsonStatusOk: boolean = routedJsonStatus.ok
  const directOperationResult = await runEditableProjectionWorkflowOperation(workflow, {
    operation: 'status',
    path: 'data/notes',
  })
  const directOperationResultOk: boolean = directOperationResult.ok
  const directOperationJsonResult = await runEditableProjectionWorkflowOperationJson(workflow, serializeEditableProjectionWorkflowOperationJson({
    operation: 'status',
    path: 'data/notes',
  }))
  const directOperationJsonResultOk: boolean = directOperationJsonResult.ok
  const toolOperationResult = await runEditableProjectionWorkflowToolCall(workflow, 'editable_projection_status', {
    path: 'data/notes',
  })
  const toolOperationResultOk: boolean = toolOperationResult.ok
  const toolOperationJsonResult = await runEditableProjectionWorkflowToolCallJson(
    workflow,
    'editable_projection_status',
    JSON.stringify({ path: 'data/notes' }),
  )
  const toolOperationJsonResultOk: boolean = toolOperationJsonResult.ok
  const directOperationPayload: EditableProjectionWorkflowOperationResult<NoteCommand> | undefined = directOperationResult.ok
    ? directOperationResult.result
    : undefined
  await workflow.update(noteUpdateTargets([{ id: 1, title: 'Draft' }]))
  await workflow.saveUpdateTargets('notes-refresh', noteUpdateTargets([{ id: 1, title: 'Draft' }]))
  const loadedTargets = await workflow.loadUpdateTargets('notes-refresh')
  const loadedTargetCount: number = loadedTargets.targets.length
  const loadedTargetsJson: string = loadedTargets.json
  const loadedUpdate = await workflow.loadAndUpdate('notes-refresh')
  const loadedUpdateMarkdown: string = loadedUpdate.markdown
  const loadedUpdateJson: string = loadedUpdate.json
  const parsedLoadedUpdateResult: WorkspaceUpdateResult = parseWorkspaceUpdateResultJson(loadedUpdateJson)
  const updateAndReview = await workflow.updateAndReview(noteUpdateTargets([{ id: 2, title: 'Second' }]), 'data/notes')
  const updateAndReviewMarkdown: string = updateAndReview.markdown
  const savedAfterUpdate = await workflow.updateAndSaveReview(noteUpdateTargets([{ id: 3, title: 'Third' }]), 'data/notes', 'notes-review')
  const savedReviewPath: string = savedAfterUpdate.reviewPath
  const checkedSaved = await workflow.loadAndCheckReview('notes-review')
  const checkedSavedReady: boolean = checkedSaved.gate.ready
  const checkedSavedJson: string = checkedSaved.json
  const review = await workflow.reviewAndSave('data/notes', 'note-1')
  const checkedReview = await workflow.checkReview(review.review)
  const checkedReviewMarkdown: string = checkedReview.markdown
  const checkedReviewJson: string = checkedReview.json
  const gateReady: boolean = review.gate.ready
  const markdown: string = review.markdown
  const reviewJson: string = review.json
  const applied = await workflow.loadAndApply('note-1', { allowConflicts: true })
  const appliedCommands: number = applied.result.appliedCommands
  const appliedJson: string = applied.json
  const parsedAppliedResult: ApplyResult = parseApplyResultJson(appliedJson)
  const deleteTarget: WorkspaceUpdateTarget = noteDeleteTarget(1)
  const serializedTargets: string = serializeWorkspaceUpdateTargetsJson([deleteTarget])
  const parsedTargets: WorkspaceUpdateTarget[] = parseWorkspaceUpdateTargetsJson(serializedTargets)
  const parsedReviewSummaryUpdate: number = parseApplyReviewJson(reviewJson).summary.update
  const indexTarget: WorkspaceUpdateTarget = createGeneratedIndexUpdateTarget({
    path: 'data/notes/note.index.json',
    schema: 'example.note_index.v1',
    entityType: 'note_index',
    content: {
      schema: 'example.note_index.v1',
      notes: [{ id: 1, path: 'note_1.json' }],
    },
  })
  const viewTarget: WorkspaceUpdateTarget = createMaterializedViewUpdateTarget({
    path: 'data/notes/context.md',
    schema: 'example.note_context.v1',
    entityType: 'note_context',
    content: '# Notes\n',
  })

  void bridgedStatusOk
  void bridgedStatusMarkdown
  void routedStatusOk
  void adaptedStatusOk
  void adaptedOperationName
  void routedJsonStatusOk
  void adaptedJsonStatusOk
  void directOperationResultOk
  void directOperationJsonResultOk
  void toolOperationResultOk
  void toolOperationJsonResultOk
  void directOperationPayload
  void gateReady
  void loadedTargetCount
  void loadedTargetsJson
  void loadedUpdateMarkdown
  void loadedUpdateJson
  void parsedLoadedUpdateResult
  void updateAndReviewMarkdown
  void savedReviewPath
  void checkedSavedReady
  void checkedSavedJson
  void checkedReviewMarkdown
  void checkedReviewJson
  void markdown
  void reviewJson
  void appliedCommands
  void appliedJson
  void parsedAppliedResult
  void deleteTarget
  void parsedTargets
  void parsedReviewSummaryUpdate
  void indexTarget
  void viewTarget
}

async function consumeIntegrationContract(): Promise<void> {
  const report = await verifyEditableProjectionIntegrationContract({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      entityId: 1,
      filePath: 'data/notes/note_1.json',
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    },
    workflow: {
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      editFile(current) {
        return current.replace('Draft', 'Ready')
      },
    },
  })
  const reportMarkdown: string = formatEditableProjectionIntegrationContractMarkdown(report)
  const serializedReport: string = serializeEditableProjectionIntegrationContractReportJson(report)
  const parsedReport = parseEditableProjectionIntegrationContractReportJson<NoteCommand>(serializedReport)
  const validatedReport: EditableProjectionIntegrationContractReport<NoteCommand> = validateEditableProjectionIntegrationContractReport(parsedReport)
  const gate: EditableProjectionIntegrationContractGateResult<NoteCommand> = await runEditableProjectionIntegrationContractGate({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    },
    workflow: {
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      editFile(current) {
        return current.replace('Draft', 'Ready')
      },
    },
  })
  const issues = validateEditableProjectionIntegrationContractOptions({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    },
    workflow: {
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      editFile(current: string) {
        return current
      },
    },
  })
  const asserted = await assertEditableProjectionIntegrationContract({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    },
    workflow: {
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      editFile(current) {
        return current.replace('Draft', 'Ready')
      },
    },
  })
  const testingBackendStore = new TestingMemoryBackendStore()
  const harness: EditableProjectionMemoryTestHarness<NoteCommand> = createEditableProjectionMemoryTestHarness({
    adapters: [noteAdapter],
    backendEntities: [{
      entityType: 'note',
      entityId: 1,
      hash: 'note-v1',
      value: { id: 1, title: 'Draft' } satisfies NoteEntity,
    }],
    executor,
  })
  const testingReport: EditableProjectionIntegrationContractReport<NoteCommand> = await verifyIntegrationContractFromTesting({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    },
    workflow: {
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      editFile(current) {
        return current.replace('Draft', 'Ready')
      },
    },
  })
  const testingReportMarkdown: string = formatEditableProjectionIntegrationContractMarkdown(testingReport)
  const testingGate: EditableProjectionIntegrationContractGateResult<NoteCommand> = await runIntegrationContractGateFromTesting({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    },
    workflow: {
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      editFile(current) {
        return current.replace('Draft', 'Ready')
      },
    },
  })
  const readinessBackendStore = new TestingMemoryBackendStore([{
    entityType: 'note',
    entityId: 1,
    hash: 'note-1-v1',
    value: { id: 1, title: 'Draft' } satisfies NoteEntity,
  }])
  const memoryIntegrationGate: EditableProjectionMemoryIntegrationContractGateResult<NoteCommand> =
    await runEditableProjectionMemoryIntegrationContractGate<NoteProjection, NoteEntity, NoteCommand>({
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      entityId: 1,
      filePath: 'data/notes/note_1.json',
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
      invalidFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: '' }),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      backendStore: readinessBackendStore,
      executor: {
        async execute(commands) {
          const updated = {
            id: Number(commands[0]?.target?.id ?? commands[0]?.entityId ?? 1),
            title: commands[0]?.target?.title ?? 'Ready',
          }
          readinessBackendStore.setEntity({
            entityType: 'note',
            entityId: updated.id,
            hash: 'note-1-v1',
            value: updated,
          })
          return {
            updateTargets: [noteUpdateTarget(updated)],
          }
        },
      },
      editFile(current) {
        return current.replace('Draft', 'Ready')
      },
    })
  const memoryIntegrationGateMarkdown: string = memoryIntegrationGate.markdown
  const memoryIntegrationGateJson: string = memoryIntegrationGate.json
  const memoryIntegrationHarness: EditableProjectionMemoryTestHarness<NoteCommand> = memoryIntegrationGate.harness
  const testingIssues = validateIntegrationContractOptionsFromTesting({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    },
    workflow: {
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      editFile(current: string) {
        return current
      },
    },
  })
  await assertIntegrationContractFromTesting({
    adapter: {
      adapter: noteAdapter,
      entity: { id: 1, title: 'Draft' },
      validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    },
    workflow: {
      workflow,
      fs: new MemoryWorkspaceFileSystem(),
      updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
      editFile(current) {
        return current.replace('Draft', 'Ready')
      },
    },
  })
  void report
  void reportMarkdown
  void serializedReport
  void parsedReport
  void validatedReport
  void gate
  void issues
  void asserted
  void testingBackendStore
  void harness
  void testingReport
  void testingReportMarkdown
  void testingGate
  void memoryIntegrationGate
  void memoryIntegrationGateMarkdown
  void memoryIntegrationGateJson
  void memoryIntegrationHarness
  void testingIssues
}

async function consumeWorkflowContract(): Promise<void> {
  const contractOptionIssues = validateWorkflowContractOptions({
    workflow,
    fs: new MemoryWorkspaceFileSystem(),
    updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
    editFile(current) {
      return current.replace('"Draft"', '"Edited"')
    },
  })
  const contractOptionIssueCount: number = contractOptionIssues.length
  void contractOptionIssueCount

  const report = await verifyEditableProjectionWorkflowContract<NoteCommand>({
    workflow,
    fs: new MemoryWorkspaceFileSystem(),
    updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
    editFile(current) {
      return current.replace('"Draft"', '"Edited"')
    },
  })
  const workflowContractOk: boolean = report.ok
  const workflowContractIssuePath: string | undefined = report.issues[0]?.path
  void workflowContractOk
  void workflowContractIssuePath

  const asserted = await assertEditableProjectionWorkflowContract<NoteCommand>({
    workflow,
    fs: new MemoryWorkspaceFileSystem(),
    updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
    editFile(current) {
      return current.replace('"Draft"', '"Edited"')
    },
  })
  const assertedStatusFileCount: number | undefined = asserted.status?.files.length
  void assertedStatusFileCount

  const toolAdapterContractOptionIssues = validateWorkflowToolAdapterContractOptions({
    toolAdapter: workflowToolAdapter,
    fs: new MemoryWorkspaceFileSystem(),
    updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
    editFile(current) {
      return current.replace('"Draft"', '"Edited"')
    },
  })
  const toolAdapterContractOptionIssueCount: number = toolAdapterContractOptionIssues.length
  void toolAdapterContractOptionIssueCount

  const toolAdapterReport = await verifyEditableProjectionWorkflowToolAdapterContract<NoteCommand>({
    toolAdapter: workflowToolAdapter,
    fs: new MemoryWorkspaceFileSystem(),
    updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
    editFile(current) {
      return current.replace('"Draft"', '"Edited"')
    },
  })
  const toolAdapterContractOk: boolean = toolAdapterReport.ok
  const toolAdapterToolName: string | undefined = toolAdapterReport.toolNames[0]
  void toolAdapterContractOk
  void toolAdapterToolName

  const assertedToolAdapter = await assertEditableProjectionWorkflowToolAdapterContract<NoteCommand>({
    toolAdapter: workflowToolAdapter,
    fs: new MemoryWorkspaceFileSystem(),
    updateTarget: noteUpdateTarget({ id: 1, title: 'Draft' }),
    editFile(current) {
      return current.replace('"Draft"', '"Edited"')
    },
  })
  const assertedToolAdapterStatusFileCount: number | undefined = assertedToolAdapter.status?.files.length
  void assertedToolAdapterStatusFileCount
}

function consumeAdapterContract(): void {
  const adapterContractIssues = validateProjectionAdapterContractOptions({
    adapter: noteAdapter,
    entity: { id: 1, title: 'Draft' },
    filePath: 'data/notes/note_1.json',
    validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
  })
  const adapterContractIssueCount: number = adapterContractIssues.length
  void adapterContractIssueCount

  const report = assertProjectionAdapterContract({
    adapter: noteAdapter,
    entity: { id: 1, title: 'Draft' },
    entityId: 1,
    filePath: 'data/notes/note_1.json',
    validFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: 'Draft' }),
    invalidFile: JSON.stringify({ schema: 'example.note.v1', id: 1, title: '' }),
  })
  const contractOk: boolean = report.ok
  const contractIssuePath: string | undefined = report.issues[0]?.path
  const contractErrorCode: EditableProjectionErrorCode = new InvalidProjectionAdapterContractError(
    'example.note.v1',
    [{ path: '/validFile/validate', message: 'example' }],
  ).code
  void contractOk
  void contractIssuePath
  void contractErrorCode
}

function noteUpdateTarget(entity: NoteEntity): WorkspaceUpdateTarget {
  return createWritableProjectionUpdateTarget({
    adapter: noteAdapter,
    entity,
    entityId: entity.id,
    path: `data/notes/note_${entity.id}.json`,
    backendHash: `note-${entity.id}-v1`,
  })
}

function noteUpdateTargets(entities: NoteEntity[]): WorkspaceUpdateTarget[] {
  return createWritableProjectionUpdateTargets({
    adapter: noteAdapter,
    entities,
    entityIdFor: (entity) => entity.id,
    pathFor: (entity) => `data/notes/note_${entity.id}.json`,
    backendHashFor: (entity) => `note-${entity.id}-v1`,
  })
}

function noteDeleteTarget(entityId: number): WorkspaceUpdateTarget {
  return createWritableProjectionDeleteTarget({
    adapter: noteAdapter,
    entityId,
    path: `data/notes/note_${entityId}.json`,
    backendHash: `note-${entityId}-deleted`,
  })
}

const nodeWorkflow: NodeEditableProjectionWorkflow<NoteCommand> = createNodeEditableProjectionWorkflow('/tmp/editable-projections', {
  backendStore,
  registry,
  executor,
})

const nodeKit: NodeEditableProjectionKit<NoteCommand> = createNodeEditableProjectionKit('/tmp/editable-projections-kit', {
  backendStore,
  adapters: [noteAdapter],
  executor,
})

async function consumeNodeWorkflow(): Promise<void> {
  const status = await nodeWorkflow.workflow.status('.')
  const statusMarkdown: string = status.markdown
  const statusJson: string = status.json
  const kitStatus = await nodeKit.workflow.status('.')
  const kitStatusMarkdown: string = kitStatus.markdown
  const kitStatusJson: string = kitStatus.json
  const memoryStatus = await memoryWorkflow.workflow.status('.')
  const memoryStatusMarkdown: string = memoryStatus.markdown
  const memoryStatusJson: string = memoryStatus.json
  const memoryUpdateTargetStore: MemoryWorkspaceUpdateTargetStore = memoryWorkflow.updateTargetStore
  void statusMarkdown
  void statusJson
  void kitStatusMarkdown
  void kitStatusJson
  void memoryStatusMarkdown
  void memoryStatusJson
  void memoryUpdateTargetStore
}

async function consumeErrors(error: unknown): Promise<void> {
  const serialized = serializeEditableProjectionError(error)
  const serializedTyped: SerializedEditableProjectionError = serialized
  const serializedJson: string = serializeEditableProjectionErrorJson(error)
  const parsedSerialized: SerializedEditableProjectionError = parseSerializedEditableProjectionErrorJson(serializedJson)
  const normalizedSerialized: SerializedEditableProjectionError = normalizeSerializedEditableProjectionError(parsedSerialized)
  const code: EditableProjectionErrorCode | undefined = isEditableProjectionErrorCode(serialized.code)
    ? serialized.code
    : undefined
  const serializedIsValid: boolean = isSerializedEditableProjectionError(serialized)
  const serializedMarkdown: string = formatSerializedEditableProjectionErrorMarkdown(serialized)
  const kitError = new InvalidEditableProjectionKitOptionsError(['example'])
  const kitErrorCode: EditableProjectionErrorCode = kitError.code
  const commandResultError = new InvalidProjectionCommandResultError('example.note.v1', undefined, [{
    path: '/commands',
    message: 'commands must be an array.',
  }])
  const commandResultErrorCode: EditableProjectionErrorCode = commandResultError.code
  const updateTargetStoreErrorCode: EditableProjectionErrorCode = new MissingWorkspaceUpdateTargetStoreError().code
  const workflowContractErrorCode: EditableProjectionErrorCode = new InvalidEditableProjectionWorkflowContractError([
    { path: '/status', message: 'example' },
  ]).code
  const workflowOptionsErrorCode: EditableProjectionErrorCode = new InvalidEditableProjectionWorkflowOptionsError([
    { path: '/workspace/status', message: 'status must be a function.' },
  ]).code
  void code
  void serializedTyped
  void serializedJson
  void parsedSerialized
  void normalizedSerialized
  void serializedIsValid
  void serializedMarkdown
  void kitErrorCode
  void commandResultErrorCode
  void updateTargetStoreErrorCode
  void workflowContractErrorCode
  void workflowOptionsErrorCode
}

void consumeWorkflow
void consumeWorkflowContract
void consumeAdapterContract
void consumeNodeWorkflow
void consumeErrors

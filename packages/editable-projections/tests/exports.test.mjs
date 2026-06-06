import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const rootExportNames = [
  'ApplyReviewNotReadyError',
  'DuplicateProjectionAdapterError',
  'EditableProjectionError',
  'EditableProjectionWorkflow',
  'EditableProjectionWorkspace',
  'InvalidApplyReviewError',
  'InvalidEditableProjectionArtifactCompatibilityError',
  'InvalidEditableProjectionBridgeOperationError',
  'InvalidEditableProjectionBridgeResultError',
  'InvalidEditableProjectionIntegrationContractError',
  'InvalidEditableProjectionKitOptionsError',
  'InvalidEditableProjectionResultArtifactError',
  'InvalidEditableProjectionWorkflowContractError',
  'InvalidEditableProjectionWorkflowOptionsError',
  'InvalidEditableProjectionWorkspaceOptionsError',
  'InvalidFormatOptionsError',
  'InvalidJsonProjectionError',
  'InvalidProjectionAdapterContractError',
  'InvalidProjectionCommandResultError',
  'InvalidWorkspaceApplyOptionsError',
  'InvalidWorkspaceManifestError',
  'InvalidWorkspaceReviewOptionsError',
  'InvalidWorkspaceStatusArtifactError',
  'InvalidWorkspaceUpdateOptionsError',
  'InvalidWorkspaceUpdateTargetError',
  'MemoryApplyReviewStore',
  'MemoryBackendStore',
  'MemoryManifestStore',
  'MemorySnapshotStore',
  'MemoryWorkspaceFileSystem',
  'MemoryWorkspaceUpdateTargetStore',
  'MissingApplyReviewArtifactError',
  'MissingApplyReviewStoreError',
  'MissingCommandExecutorError',
  'MissingWorkspaceFileError',
  'MissingWorkspaceUpdateTargetArtifactError',
  'MissingWorkspaceUpdateTargetStoreError',
  'ProjectionRegistry',
  'StaleApplyReviewError',
  'UnknownProjectionCommandError',
  'WorkspacePathEscapeError',
  'assertApplyReviewReady',
  'assertEditableProjectionIntegrationContract',
  'assertEditableProjectionWorkflowContract',
  'assertEditableProjectionWorkflowToolAdapterContract',
  'assertKitOptions',
  'assertKitRegistrationOptions',
  'assertProjectionAdapterContract',
  'createCommandExecutor',
  'createCrudCommandExecutor',
  'createEditableProjectionBridgeFailure',
  'createEditableProjectionBridgeSuccess',
  'createEditableProjectionKit',
  'createEditableProjectionWorkflow',
  'createEditableProjectionWorkflowBridge',
  'createEditableProjectionWorkflowFromOptions',
  'createEditableProjectionWorkflowOperationRouter',
  'createEditableProjectionWorkflowOperationToolDefinitions',
  'createEditableProjectionWorkflowToolAdapter',
  'createEditableProjectionWorkspace',
  'createGeneratedIndexUpdateTarget',
  'createJsonProjectionAdapter',
  'createMaterializedViewUpdateTarget',
  'createProjectionRegistry',
  'createWritableProjectionDeleteTarget',
  'createWritableProjectionUpdateTarget',
  'createWritableProjectionUpdateTargets',
  'deepEqual',
  'defaultEditableProjectionIgnorePaths',
  'defineProjectionAdapter',
  'diffJson',
  'diffJsonById',
  'editableProjectionArtifactCompatibility',
  'editableProjectionArtifactSchemas',
  'editableProjectionArtifactVersions',
  'editableProjectionErrorCodes',
  'editableProjectionWorkflowOperationJsonSchema',
  'editableProjectionWorkflowOperationNames',
  'editableProjectionWorkflowOperationSpecs',
  'editableProjectionWorkflowOperationToolDefinitions',
  'evaluateApplyReview',
  'formatApplyResultMarkdown',
  'formatApplyReviewMarkdown',
  'formatEditableProjectionArtifactCompatibilityMarkdown',
  'formatEditableProjectionArtifactCompatibilityReportMarkdown',
  'formatEditableProjectionIntegrationContractMarkdown',
  'formatSerializedEditableProjectionErrorMarkdown',
  'formatWorkspaceStatusMarkdown',
  'formatWorkspaceUpdateMarkdown',
  'getEditableProjectionWorkflowOperationJsonSchema',
  'getEditableProjectionWorkflowOperationNameForToolName',
  'getEditableProjectionWorkflowOperationSpec',
  'getEditableProjectionWorkflowOperationToolDefinition',
  'hashJson',
  'isEditableProjectionError',
  'isEditableProjectionErrorCode',
  'isPlainObject',
  'isSerializedEditableProjectionError',
  'jsonPointer',
  'mergeJson',
  'mergeWorkspaceIgnorePaths',
  'movscriptAssetSlotAdapter',
  'movscriptAssetSlotDeleteTarget',
  'movscriptAssetSlotPath',
  'movscriptAssetSlotProjectionSchema',
  'movscriptAssetSlotUpdateTarget',
  'movscriptCreativeReferenceAdapter',
  'movscriptCreativeReferenceDeleteTarget',
  'movscriptCreativeReferencePath',
  'movscriptCreativeReferenceProjectionSchema',
  'movscriptCreativeReferenceUpdateTarget',
  'movscriptProjectAdapters',
  'movscriptProjectRelativeAssetSlotPath',
  'movscriptProjectRelativeCreativeReferencePath',
  'normalizeMovScriptAssetSlotEntity',
  'normalizeMovScriptCreativeReferenceEntity',
  'normalizePath',
  'normalizeSerializedEditableProjectionError',
  'noteProjectionAdapter',
  'noteProjectionDeleteTarget',
  'noteProjectionPath',
  'noteProjectionSchema',
  'noteProjectionUpdateTarget',
  'parseApplyResultJson',
  'parseApplyReviewJson',
  'parseEditableProjectionArtifactCompatibilityJson',
  'parseEditableProjectionBridgeResultJson',
  'parseEditableProjectionIntegrationContractReportJson',
  'parseEditableProjectionWorkflowOperationJson',
  'parseJsonProjection',
  'parseSerializedEditableProjectionErrorJson',
  'parseWorkspaceManifestJson',
  'parseWorkspaceStatusJson',
  'parseWorkspaceUpdateResultJson',
  'parseWorkspaceUpdateTargetsJson',
  'pathHasCurrentSegment',
  'pathHasParentSegment',
  'pathIsAbsolute',
  'pathIsInside',
  'runEditableProjectionBridgeOperation',
  'runEditableProjectionIntegrationContractGate',
  'runEditableProjectionWorkflowOperation',
  'runEditableProjectionWorkflowOperationJson',
  'runEditableProjectionWorkflowToolCall',
  'runEditableProjectionWorkflowToolCallJson',
  'runNoteProjectionExample',
  'runNoteProjectionIntegrationContractExample',
  'runNoteProjectionToolAdapterExample',
  'serializeApplyResultJson',
  'serializeApplyReviewJson',
  'serializeEditableProjectionArtifactCompatibilityJson',
  'serializeEditableProjectionBridgeResultJson',
  'serializeEditableProjectionError',
  'serializeEditableProjectionErrorJson',
  'serializeEditableProjectionIntegrationContractReportJson',
  'serializeEditableProjectionWorkflowOperationJson',
  'serializeWorkspaceStatusJson',
  'serializeWorkspaceUpdateResultJson',
  'serializeWorkspaceUpdateTargetsJson',
  'sha256',
  'stableStringify',
  'validateApplyResult',
  'validateApplyReview',
  'validateEditableProjectionArtifactCompatibility',
  'validateEditableProjectionBridgeResultJson',
  'validateEditableProjectionIntegrationContractOptions',
  'validateEditableProjectionIntegrationContractReport',
  'validateEditableProjectionWorkflowOperation',
  'validateEditableProjectionWorkflowOptions',
  'validateEditableProjectionWorkspaceOptions',
  'validateFormatOptions',
  'validateProjectionAdapterContractOptions',
  'validateProjectionCommandResult',
  'validateWorkflowApplyOptions',
  'validateWorkflowContractOptions',
  'validateWorkflowReviewAndApplyOptions',
  'validateWorkflowReviewOptions',
  'validateWorkflowStatusOptions',
  'validateWorkflowToolAdapterContractOptions',
  'validateWorkflowUpdateAndReviewOptions',
  'validateWorkflowUpdateOptions',
  'validateWorkspaceApplyOptions',
  'validateWorkspaceIgnorePaths',
  'validateWorkspaceManifest',
  'validateWorkspaceReviewOptions',
  'validateWorkspaceStatus',
  'validateWorkspaceUpdateOptions',
  'validateWorkspaceUpdateResult',
  'validateWorkspaceUpdateTarget',
  'validateWorkspaceUpdateTargets',
  'verifyEditableProjectionArtifactCompatibility',
  'verifyEditableProjectionIntegrationContract',
  'verifyEditableProjectionWorkflowContract',
  'verifyEditableProjectionWorkflowToolAdapterContract',
  'verifyProjectionAdapterContract',
]

const nodeExportNames = [
  'FileApplyReviewStore',
  'FileSnapshotStore',
  'FileWorkspaceUpdateTargetStore',
  'JsonManifestStore',
  'LocalWorkspaceFileSystem',
  'createNodeEditableProjectionKit',
  'createNodeEditableProjectionWorkflow',
  'createNodeEditableProjectionWorkspace',
]

const testingExportNames = [
  'InvalidEditableProjectionIntegrationContractError',
  'InvalidEditableProjectionWorkflowContractError',
  'InvalidProjectionAdapterContractError',
  'MemoryApplyReviewStore',
  'MemoryBackendStore',
  'MemoryManifestStore',
  'MemorySnapshotStore',
  'MemoryWorkspaceFileSystem',
  'MemoryWorkspaceUpdateTargetStore',
  'assertEditableProjectionIntegrationContract',
  'assertEditableProjectionWorkflowContract',
  'assertEditableProjectionWorkflowToolAdapterContract',
  'assertProjectionAdapterContract',
  'createEditableProjectionMemoryTestHarness',
  'formatEditableProjectionIntegrationContractMarkdown',
  'parseEditableProjectionIntegrationContractReportJson',
  'runEditableProjectionIntegrationContractGate',
  'runEditableProjectionMemoryIntegrationContractGate',
  'serializeEditableProjectionIntegrationContractReportJson',
  'validateEditableProjectionIntegrationContractOptions',
  'validateEditableProjectionIntegrationContractReport',
  'validateProjectionAdapterContractOptions',
  'validateWorkflowContractOptions',
  'validateWorkflowToolAdapterContractOptions',
  'verifyEditableProjectionIntegrationContract',
  'verifyEditableProjectionWorkflowContract',
  'verifyEditableProjectionWorkflowToolAdapterContract',
  'verifyProjectionAdapterContract',
]

const noteExampleExportNames = [
  'noteProjectionAdapter',
  'noteProjectionDeleteTarget',
  'noteProjectionPath',
  'noteProjectionSchema',
  'noteProjectionUpdateTarget',
  'runNoteProjectionExample',
  'runNoteProjectionIntegrationContractExample',
  'runNoteProjectionToolAdapterExample',
]

const movscriptAssetSlotExampleExportNames = [
  'movscriptAssetSlotAdapter',
  'movscriptAssetSlotDeleteTarget',
  'movscriptAssetSlotPath',
  'movscriptAssetSlotProjectionSchema',
  'movscriptAssetSlotUpdateTarget',
  'movscriptCreativeReferenceAdapter',
  'movscriptCreativeReferenceDeleteTarget',
  'movscriptCreativeReferencePath',
  'movscriptCreativeReferenceProjectionSchema',
  'movscriptCreativeReferenceUpdateTarget',
  'movscriptProjectAdapters',
  'movscriptProjectRelativeAssetSlotPath',
  'movscriptProjectRelativeCreativeReferencePath',
  'normalizeMovScriptAssetSlotEntity',
  'normalizeMovScriptCreativeReferenceEntity',
]

const movscriptProjectExampleExportNames = [
  'createMovScriptProjectEditableProjectionKit',
  'createMovScriptProjectNodeProjectionKit',
]

test('ESM root and node entrypoints export public APIs', async () => {
  const root = await import('../dist/index.js')
  const node = await import('../dist/node.js')
  const testing = await import('../dist/testing.js')

  assert.equal(typeof root.createEditableProjectionWorkspace, 'function')
  assert.equal(typeof root.validateEditableProjectionWorkspaceOptions, 'function')
  assert.equal(typeof root.validateWorkspaceIgnorePaths, 'function')
  assert.equal(Array.isArray(root.defaultEditableProjectionIgnorePaths), true)
  assert.equal(typeof root.mergeWorkspaceIgnorePaths, 'function')
  assert.equal(typeof root.createProjectionRegistry, 'function')
  assert.equal(typeof root.createCommandExecutor, 'function')
  assert.equal(typeof root.runEditableProjectionBridgeOperation, 'function')
  assert.equal(typeof root.createEditableProjectionBridgeSuccess, 'function')
  assert.equal(typeof root.createEditableProjectionBridgeFailure, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowBridge, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowOperationRouter, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowOperationToolDefinitions, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowToolAdapter, 'function')
  assert.equal(typeof root.editableProjectionWorkflowOperationJsonSchema, 'object')
  assert.equal(Array.isArray(root.editableProjectionWorkflowOperationNames), true)
  assert.equal(Array.isArray(root.editableProjectionWorkflowOperationSpecs), true)
  assert.equal(Array.isArray(root.editableProjectionWorkflowOperationToolDefinitions), true)
  assert.equal(typeof root.getEditableProjectionWorkflowOperationJsonSchema, 'function')
  assert.equal(typeof root.getEditableProjectionWorkflowOperationNameForToolName, 'function')
  assert.equal(typeof root.getEditableProjectionWorkflowOperationSpec, 'function')
  assert.equal(typeof root.getEditableProjectionWorkflowOperationToolDefinition, 'function')
  assert.equal(typeof root.parseEditableProjectionWorkflowOperationJson, 'function')
  assert.equal(typeof root.runEditableProjectionWorkflowOperation, 'function')
  assert.equal(typeof root.runEditableProjectionWorkflowOperationJson, 'function')
  assert.equal(typeof root.runEditableProjectionWorkflowToolCall, 'function')
  assert.equal(typeof root.runEditableProjectionWorkflowToolCallJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionWorkflowOperationJson, 'function')
  assert.equal(typeof root.validateEditableProjectionWorkflowOperation, 'function')
  assert.equal(typeof root.serializeEditableProjectionBridgeResultJson, 'function')
  assert.equal(typeof root.parseEditableProjectionBridgeResultJson, 'function')
  assert.equal(typeof root.validateEditableProjectionBridgeResultJson, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflow, 'function')
  assert.equal(typeof root.validateEditableProjectionWorkflowOptions, 'function')
  assert.equal(typeof root.validateWorkflowApplyOptions, 'function')
  assert.equal(typeof root.validateWorkflowReviewAndApplyOptions, 'function')
  assert.equal(typeof root.validateWorkflowReviewOptions, 'function')
  assert.equal(typeof root.validateWorkflowStatusOptions, 'function')
  assert.equal(typeof root.validateWorkflowUpdateAndReviewOptions, 'function')
  assert.equal(typeof root.validateWorkflowUpdateOptions, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowFromOptions, 'function')
  assert.equal(typeof root.createEditableProjectionKit, 'function')
  assert.equal(typeof root.assertKitOptions, 'function')
  assert.equal(typeof root.createJsonProjectionAdapter, 'function')
  assert.equal(typeof root.validateProjectionAdapterContractOptions, 'function')
  assert.equal(typeof root.verifyProjectionAdapterContract, 'function')
  assert.equal(typeof root.assertProjectionAdapterContract, 'function')
  assert.equal(typeof root.verifyEditableProjectionIntegrationContract, 'function')
  assert.equal(typeof root.runEditableProjectionIntegrationContractGate, 'function')
  assert.equal(typeof root.assertEditableProjectionIntegrationContract, 'function')
  assert.equal(typeof root.validateEditableProjectionIntegrationContractOptions, 'function')
  assert.equal(typeof root.validateEditableProjectionIntegrationContractReport, 'function')
  assert.equal(typeof root.parseEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof root.formatEditableProjectionIntegrationContractMarkdown, 'function')
  assert.equal(typeof root.verifyEditableProjectionWorkflowContract, 'function')
  assert.equal(typeof root.verifyEditableProjectionWorkflowToolAdapterContract, 'function')
  assert.equal(typeof root.assertEditableProjectionWorkflowContract, 'function')
  assert.equal(typeof root.assertEditableProjectionWorkflowToolAdapterContract, 'function')
  assert.equal(typeof root.validateWorkflowContractOptions, 'function')
  assert.equal(typeof root.validateWorkflowToolAdapterContractOptions, 'function')
  assert.equal(typeof root.pathHasCurrentSegment, 'function')
  assert.equal(typeof root.pathIsAbsolute, 'function')
  assert.equal(typeof root.validateProjectionCommandResult, 'function')
  assert.equal(typeof root.MemoryApplyReviewStore, 'function')
  assert.equal(typeof root.diffJsonById, 'function')
  assert.equal(typeof root.formatApplyReviewMarkdown, 'function')
  assert.equal(typeof root.formatApplyResultMarkdown, 'function')
  assert.equal(typeof root.formatEditableProjectionIntegrationContractMarkdown, 'function')
  assert.equal(typeof root.formatEditableProjectionArtifactCompatibilityReportMarkdown, 'function')
  assert.equal(typeof root.validateFormatOptions, 'function')
  assert.equal(typeof root.validateApplyReview, 'function')
  assert.equal(typeof root.validateApplyResult, 'function')
  assert.equal(typeof root.validateEditableProjectionArtifactCompatibility, 'function')
  assert.equal(typeof root.validateWorkspaceApplyOptions, 'function')
  assert.equal(typeof root.validateWorkspaceReviewOptions, 'function')
  assert.equal(typeof root.MemoryWorkspaceUpdateTargetStore, 'function')
  assert.equal(typeof root.parseApplyReviewJson, 'function')
  assert.equal(typeof root.parseEditableProjectionArtifactCompatibilityJson, 'function')
  assert.equal(typeof root.serializeApplyReviewJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionArtifactCompatibilityJson, 'function')
  assert.equal(typeof root.parseEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof root.parseWorkspaceUpdateTargetsJson, 'function')
  assert.equal(typeof root.serializeWorkspaceUpdateTargetsJson, 'function')
  assert.equal(typeof root.parseWorkspaceStatusJson, 'function')
  assert.equal(typeof root.serializeWorkspaceStatusJson, 'function')
  assert.equal(typeof root.validateWorkspaceStatus, 'function')
  assert.equal(typeof root.parseApplyResultJson, 'function')
  assert.equal(typeof root.serializeApplyResultJson, 'function')
  assert.equal(typeof root.parseWorkspaceUpdateResultJson, 'function')
  assert.equal(typeof root.serializeWorkspaceUpdateResultJson, 'function')
  assert.equal(typeof root.validateWorkspaceUpdateResult, 'function')
  assert.equal(Array.isArray(root.editableProjectionErrorCodes), true)
  assert.equal(typeof root.isEditableProjectionError, 'function')
  assert.equal(typeof root.isEditableProjectionErrorCode, 'function')
  assert.equal(typeof root.isSerializedEditableProjectionError, 'function')
  assert.equal(typeof root.normalizeSerializedEditableProjectionError, 'function')
  assert.equal(typeof root.parseSerializedEditableProjectionErrorJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionError, 'function')
  assert.equal(typeof root.serializeEditableProjectionErrorJson, 'function')
  assert.equal(typeof root.formatSerializedEditableProjectionErrorMarkdown, 'function')
  assert.equal(typeof root.DuplicateProjectionAdapterError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionArtifactCompatibilityError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionBridgeOperationError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionBridgeResultError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionResultArtifactError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionKitOptionsError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionIntegrationContractError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionWorkflowContractError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionWorkflowOptionsError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionWorkspaceOptionsError, 'function')
  assert.equal(typeof root.InvalidProjectionAdapterContractError, 'function')
  assert.equal(typeof root.InvalidProjectionCommandResultError, 'function')
  assert.equal(typeof root.InvalidJsonProjectionError, 'function')
  assert.equal(typeof root.InvalidApplyReviewError, 'function')
  assert.equal(typeof root.InvalidFormatOptionsError, 'function')
  assert.equal(typeof root.InvalidWorkspaceApplyOptionsError, 'function')
  assert.equal(typeof root.InvalidWorkspaceReviewOptionsError, 'function')
  assert.equal(typeof root.InvalidWorkspaceStatusArtifactError, 'function')
  assert.equal(typeof root.MissingApplyReviewArtifactError, 'function')
  assert.equal(typeof root.MissingApplyReviewStoreError, 'function')
  assert.equal(typeof root.MissingWorkspaceUpdateTargetArtifactError, 'function')
  assert.equal(typeof root.MissingWorkspaceUpdateTargetStoreError, 'function')
  assert.equal(typeof root.MissingWorkspaceFileError, 'function')
  assert.equal(typeof root.validateWorkspaceManifest, 'function')
  assert.equal(typeof root.parseWorkspaceManifestJson, 'function')
  assert.equal(typeof root.InvalidWorkspaceManifestError, 'function')
  assert.equal(typeof root.createGeneratedIndexUpdateTarget, 'function')
  assert.equal(typeof root.createMaterializedViewUpdateTarget, 'function')
  assert.equal(typeof root.createWritableProjectionDeleteTarget, 'function')
  assert.equal(typeof root.createWritableProjectionUpdateTarget, 'function')
  assert.equal(typeof root.createWritableProjectionUpdateTargets, 'function')
  assert.equal(typeof root.validateWorkspaceUpdateTarget, 'function')
  assert.equal(typeof root.validateWorkspaceUpdateOptions, 'function')
  assert.equal(typeof root.validateWorkspaceUpdateTargets, 'function')
  assert.equal(typeof root.InvalidWorkspaceUpdateOptionsError, 'function')
  assert.equal(typeof root.InvalidWorkspaceUpdateTargetError, 'function')
  assert.equal(typeof root.StaleApplyReviewError, 'function')
  assert.equal(typeof root.verifyEditableProjectionArtifactCompatibility, 'function')
  assert.equal(typeof root.noteProjectionAdapter, 'object')
  assert.equal(typeof root.noteProjectionPath, 'function')
  assert.equal(typeof root.noteProjectionUpdateTarget, 'function')
  assert.equal(typeof root.runNoteProjectionExample, 'function')
  assert.equal(typeof root.runNoteProjectionIntegrationContractExample, 'function')
  assert.equal(typeof root.runNoteProjectionToolAdapterExample, 'function')
  assert.equal(typeof root.movscriptAssetSlotAdapter, 'object')
  assert.equal(typeof root.movscriptAssetSlotDeleteTarget, 'function')
  assert.equal(typeof root.movscriptCreativeReferenceAdapter, 'object')
  assert.equal(typeof root.movscriptCreativeReferenceUpdateTarget, 'function')
  assert.equal(Array.isArray(root.movscriptProjectAdapters), true)
  assert.equal(typeof node.createNodeEditableProjectionKit, 'function')
  assert.equal(typeof node.createNodeEditableProjectionWorkflow, 'function')
  assert.equal(typeof node.createNodeEditableProjectionWorkspace, 'function')
  assert.equal(typeof node.FileApplyReviewStore, 'function')
  assert.equal(typeof node.FileWorkspaceUpdateTargetStore, 'function')
  assert.equal(typeof node.LocalWorkspaceFileSystem, 'function')
  assert.equal(typeof testing.assertEditableProjectionIntegrationContract, 'function')
  assert.equal(typeof testing.runEditableProjectionIntegrationContractGate, 'function')
  assert.equal(typeof testing.assertEditableProjectionWorkflowContract, 'function')
  assert.equal(typeof testing.assertEditableProjectionWorkflowToolAdapterContract, 'function')
  assert.equal(typeof testing.assertProjectionAdapterContract, 'function')
  assert.equal(typeof testing.createEditableProjectionMemoryTestHarness, 'function')
  assert.equal(typeof testing.runEditableProjectionMemoryIntegrationContractGate, 'function')
  assert.equal(typeof testing.formatEditableProjectionIntegrationContractMarkdown, 'function')
  assert.equal(typeof testing.parseEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof testing.serializeEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof testing.validateEditableProjectionIntegrationContractReport, 'function')
  assert.equal(typeof testing.MemoryBackendStore, 'function')
})

test('ESM entrypoints match the public API export snapshots', async () => {
  const root = await import('../dist/index.js')
  const node = await import('../dist/node.js')
  const testing = await import('../dist/testing.js')
  const note = await import('../dist/examples/note.js')
  const assetSlot = await import('../dist/examples/movscriptAssetSlot.js')
  const movscriptProject = await import('../dist/examples/movscriptProject.js')

  assert.deepEqual(Object.keys(root).sort(), rootExportNames)
  assert.deepEqual(Object.keys(node).sort(), nodeExportNames)
  assert.deepEqual(Object.keys(testing).sort(), testingExportNames)
  assert.deepEqual(Object.keys(note).sort(), noteExampleExportNames)
  assert.deepEqual(Object.keys(assetSlot).sort(), movscriptAssetSlotExampleExportNames)
  assert.deepEqual(Object.keys(movscriptProject).sort(), movscriptProjectExampleExportNames)
})

test('CJS root and node entrypoints export public APIs', () => {
  const require = createRequire(import.meta.url)
  const root = require('../dist/index.cjs')
  const node = require('../dist/node.cjs')
  const testing = require('../dist/testing.cjs')

  assert.equal(typeof root.createEditableProjectionWorkspace, 'function')
  assert.equal(typeof root.validateEditableProjectionWorkspaceOptions, 'function')
  assert.equal(typeof root.validateWorkspaceIgnorePaths, 'function')
  assert.equal(Array.isArray(root.defaultEditableProjectionIgnorePaths), true)
  assert.equal(typeof root.mergeWorkspaceIgnorePaths, 'function')
  assert.equal(typeof root.createProjectionRegistry, 'function')
  assert.equal(typeof root.createCommandExecutor, 'function')
  assert.equal(typeof root.runEditableProjectionBridgeOperation, 'function')
  assert.equal(typeof root.createEditableProjectionBridgeSuccess, 'function')
  assert.equal(typeof root.createEditableProjectionBridgeFailure, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowBridge, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowOperationRouter, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowOperationToolDefinitions, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowToolAdapter, 'function')
  assert.equal(typeof root.editableProjectionWorkflowOperationJsonSchema, 'object')
  assert.equal(Array.isArray(root.editableProjectionWorkflowOperationNames), true)
  assert.equal(Array.isArray(root.editableProjectionWorkflowOperationSpecs), true)
  assert.equal(Array.isArray(root.editableProjectionWorkflowOperationToolDefinitions), true)
  assert.equal(typeof root.getEditableProjectionWorkflowOperationJsonSchema, 'function')
  assert.equal(typeof root.getEditableProjectionWorkflowOperationNameForToolName, 'function')
  assert.equal(typeof root.getEditableProjectionWorkflowOperationSpec, 'function')
  assert.equal(typeof root.getEditableProjectionWorkflowOperationToolDefinition, 'function')
  assert.equal(typeof root.parseEditableProjectionWorkflowOperationJson, 'function')
  assert.equal(typeof root.runEditableProjectionWorkflowOperation, 'function')
  assert.equal(typeof root.runEditableProjectionWorkflowOperationJson, 'function')
  assert.equal(typeof root.runEditableProjectionWorkflowToolCall, 'function')
  assert.equal(typeof root.runEditableProjectionWorkflowToolCallJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionWorkflowOperationJson, 'function')
  assert.equal(typeof root.validateEditableProjectionWorkflowOperation, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflow, 'function')
  assert.equal(typeof root.validateEditableProjectionWorkflowOptions, 'function')
  assert.equal(typeof root.validateWorkflowApplyOptions, 'function')
  assert.equal(typeof root.validateWorkflowReviewAndApplyOptions, 'function')
  assert.equal(typeof root.validateWorkflowReviewOptions, 'function')
  assert.equal(typeof root.validateWorkflowStatusOptions, 'function')
  assert.equal(typeof root.validateWorkflowUpdateAndReviewOptions, 'function')
  assert.equal(typeof root.validateWorkflowUpdateOptions, 'function')
  assert.equal(typeof root.createEditableProjectionWorkflowFromOptions, 'function')
  assert.equal(typeof root.createEditableProjectionKit, 'function')
  assert.equal(typeof root.assertKitOptions, 'function')
  assert.equal(typeof root.createJsonProjectionAdapter, 'function')
  assert.equal(typeof root.validateProjectionAdapterContractOptions, 'function')
  assert.equal(typeof root.verifyProjectionAdapterContract, 'function')
  assert.equal(typeof root.assertProjectionAdapterContract, 'function')
  assert.equal(typeof root.verifyEditableProjectionIntegrationContract, 'function')
  assert.equal(typeof root.runEditableProjectionIntegrationContractGate, 'function')
  assert.equal(typeof root.assertEditableProjectionIntegrationContract, 'function')
  assert.equal(typeof root.validateEditableProjectionIntegrationContractOptions, 'function')
  assert.equal(typeof root.validateEditableProjectionIntegrationContractReport, 'function')
  assert.equal(typeof root.parseEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof root.formatEditableProjectionIntegrationContractMarkdown, 'function')
  assert.equal(typeof root.verifyEditableProjectionWorkflowContract, 'function')
  assert.equal(typeof root.verifyEditableProjectionWorkflowToolAdapterContract, 'function')
  assert.equal(typeof root.assertEditableProjectionWorkflowContract, 'function')
  assert.equal(typeof root.assertEditableProjectionWorkflowToolAdapterContract, 'function')
  assert.equal(typeof root.validateWorkflowContractOptions, 'function')
  assert.equal(typeof root.validateWorkflowToolAdapterContractOptions, 'function')
  assert.equal(typeof root.pathHasCurrentSegment, 'function')
  assert.equal(typeof root.pathIsAbsolute, 'function')
  assert.equal(typeof root.validateProjectionCommandResult, 'function')
  assert.equal(typeof root.MemoryApplyReviewStore, 'function')
  assert.equal(typeof root.diffJsonById, 'function')
  assert.equal(typeof root.formatApplyReviewMarkdown, 'function')
  assert.equal(typeof root.formatApplyResultMarkdown, 'function')
  assert.equal(typeof root.formatEditableProjectionIntegrationContractMarkdown, 'function')
  assert.equal(typeof root.formatEditableProjectionArtifactCompatibilityReportMarkdown, 'function')
  assert.equal(typeof root.validateFormatOptions, 'function')
  assert.equal(typeof root.validateApplyReview, 'function')
  assert.equal(typeof root.validateEditableProjectionArtifactCompatibility, 'function')
  assert.equal(typeof root.validateWorkspaceApplyOptions, 'function')
  assert.equal(typeof root.validateWorkspaceReviewOptions, 'function')
  assert.equal(typeof root.MemoryWorkspaceUpdateTargetStore, 'function')
  assert.equal(typeof root.parseApplyReviewJson, 'function')
  assert.equal(typeof root.parseEditableProjectionArtifactCompatibilityJson, 'function')
  assert.equal(typeof root.serializeApplyReviewJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionArtifactCompatibilityJson, 'function')
  assert.equal(typeof root.parseEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof root.parseWorkspaceUpdateTargetsJson, 'function')
  assert.equal(typeof root.serializeWorkspaceUpdateTargetsJson, 'function')
  assert.equal(Array.isArray(root.editableProjectionErrorCodes), true)
  assert.equal(typeof root.isEditableProjectionError, 'function')
  assert.equal(typeof root.isEditableProjectionErrorCode, 'function')
  assert.equal(typeof root.isSerializedEditableProjectionError, 'function')
  assert.equal(typeof root.normalizeSerializedEditableProjectionError, 'function')
  assert.equal(typeof root.parseSerializedEditableProjectionErrorJson, 'function')
  assert.equal(typeof root.serializeEditableProjectionError, 'function')
  assert.equal(typeof root.serializeEditableProjectionErrorJson, 'function')
  assert.equal(typeof root.formatSerializedEditableProjectionErrorMarkdown, 'function')
  assert.equal(typeof root.DuplicateProjectionAdapterError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionArtifactCompatibilityError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionBridgeOperationError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionBridgeResultError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionKitOptionsError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionIntegrationContractError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionWorkflowContractError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionWorkflowOptionsError, 'function')
  assert.equal(typeof root.InvalidEditableProjectionWorkspaceOptionsError, 'function')
  assert.equal(typeof root.InvalidProjectionAdapterContractError, 'function')
  assert.equal(typeof root.InvalidProjectionCommandResultError, 'function')
  assert.equal(typeof root.InvalidJsonProjectionError, 'function')
  assert.equal(typeof root.InvalidApplyReviewError, 'function')
  assert.equal(typeof root.InvalidFormatOptionsError, 'function')
  assert.equal(typeof root.InvalidWorkspaceApplyOptionsError, 'function')
  assert.equal(typeof root.InvalidWorkspaceReviewOptionsError, 'function')
  assert.equal(typeof root.MissingApplyReviewArtifactError, 'function')
  assert.equal(typeof root.MissingApplyReviewStoreError, 'function')
  assert.equal(typeof root.MissingWorkspaceUpdateTargetArtifactError, 'function')
  assert.equal(typeof root.MissingWorkspaceUpdateTargetStoreError, 'function')
  assert.equal(typeof root.MissingWorkspaceFileError, 'function')
  assert.equal(typeof root.validateWorkspaceManifest, 'function')
  assert.equal(typeof root.parseWorkspaceManifestJson, 'function')
  assert.equal(typeof root.InvalidWorkspaceManifestError, 'function')
  assert.equal(typeof root.createGeneratedIndexUpdateTarget, 'function')
  assert.equal(typeof root.createMaterializedViewUpdateTarget, 'function')
  assert.equal(typeof root.createWritableProjectionDeleteTarget, 'function')
  assert.equal(typeof root.createWritableProjectionUpdateTarget, 'function')
  assert.equal(typeof root.createWritableProjectionUpdateTargets, 'function')
  assert.equal(typeof root.validateWorkspaceUpdateTarget, 'function')
  assert.equal(typeof root.validateWorkspaceUpdateOptions, 'function')
  assert.equal(typeof root.validateWorkspaceUpdateTargets, 'function')
  assert.equal(typeof root.InvalidWorkspaceUpdateOptionsError, 'function')
  assert.equal(typeof root.InvalidWorkspaceUpdateTargetError, 'function')
  assert.equal(typeof root.StaleApplyReviewError, 'function')
  assert.equal(typeof root.verifyEditableProjectionArtifactCompatibility, 'function')
  assert.equal(typeof root.noteProjectionAdapter, 'object')
  assert.equal(typeof root.noteProjectionPath, 'function')
  assert.equal(typeof root.noteProjectionUpdateTarget, 'function')
  assert.equal(typeof root.runNoteProjectionExample, 'function')
  assert.equal(typeof root.runNoteProjectionIntegrationContractExample, 'function')
  assert.equal(typeof root.runNoteProjectionToolAdapterExample, 'function')
  assert.equal(typeof root.movscriptAssetSlotAdapter, 'object')
  assert.equal(typeof root.movscriptAssetSlotDeleteTarget, 'function')
  assert.equal(typeof root.movscriptCreativeReferenceAdapter, 'object')
  assert.equal(typeof root.movscriptCreativeReferenceUpdateTarget, 'function')
  assert.equal(Array.isArray(root.movscriptProjectAdapters), true)
  assert.equal(typeof node.createNodeEditableProjectionKit, 'function')
  assert.equal(typeof node.createNodeEditableProjectionWorkflow, 'function')
  assert.equal(typeof node.createNodeEditableProjectionWorkspace, 'function')
  assert.equal(typeof node.FileApplyReviewStore, 'function')
  assert.equal(typeof node.FileWorkspaceUpdateTargetStore, 'function')
  assert.equal(typeof node.LocalWorkspaceFileSystem, 'function')
  assert.equal(typeof testing.assertEditableProjectionIntegrationContract, 'function')
  assert.equal(typeof testing.runEditableProjectionIntegrationContractGate, 'function')
  assert.equal(typeof testing.assertEditableProjectionWorkflowContract, 'function')
  assert.equal(typeof testing.assertEditableProjectionWorkflowToolAdapterContract, 'function')
  assert.equal(typeof testing.assertProjectionAdapterContract, 'function')
  assert.equal(typeof testing.createEditableProjectionMemoryTestHarness, 'function')
  assert.equal(typeof testing.runEditableProjectionMemoryIntegrationContractGate, 'function')
  assert.equal(typeof testing.formatEditableProjectionIntegrationContractMarkdown, 'function')
  assert.equal(typeof testing.parseEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof testing.serializeEditableProjectionIntegrationContractReportJson, 'function')
  assert.equal(typeof testing.validateEditableProjectionIntegrationContractReport, 'function')
  assert.equal(typeof testing.MemoryBackendStore, 'function')
})

test('CJS entrypoints match the public API export snapshots', () => {
  const require = createRequire(import.meta.url)
  const root = require('../dist/index.cjs')
  const node = require('../dist/node.cjs')
  const testing = require('../dist/testing.cjs')
  const note = require('../dist/examples/note.cjs')
  const assetSlot = require('../dist/examples/movscriptAssetSlot.cjs')
  const movscriptProject = require('../dist/examples/movscriptProject.cjs')

  assert.deepEqual(Object.keys(root).sort(), rootExportNames)
  assert.deepEqual(Object.keys(node).sort(), nodeExportNames)
  assert.deepEqual(Object.keys(testing).sort(), testingExportNames)
  assert.deepEqual(Object.keys(note).sort(), noteExampleExportNames)
  assert.deepEqual(Object.keys(assetSlot).sort(), movscriptAssetSlotExampleExportNames)
  assert.deepEqual(Object.keys(movscriptProject).sort(), movscriptProjectExampleExportNames)
})

test('ESM example subpath entrypoints export focused APIs', async () => {
  const note = await import('../dist/examples/note.js')
  const assetSlot = await import('../dist/examples/movscriptAssetSlot.js')
  const movscriptProject = await import('../dist/examples/movscriptProject.js')

  assert.equal(typeof note.noteProjectionAdapter, 'object')
  assert.equal(typeof note.noteProjectionPath, 'function')
  assert.equal(typeof note.noteProjectionUpdateTarget, 'function')
  assert.equal(typeof note.noteProjectionDeleteTarget, 'function')
  assert.equal(typeof note.runNoteProjectionExample, 'function')
  assert.equal(typeof note.runNoteProjectionIntegrationContractExample, 'function')
  assert.equal(typeof note.runNoteProjectionToolAdapterExample, 'function')
  assert.equal(typeof assetSlot.movscriptAssetSlotAdapter, 'object')
  assert.equal(typeof assetSlot.movscriptAssetSlotPath, 'function')
  assert.equal(typeof assetSlot.movscriptAssetSlotUpdateTarget, 'function')
  assert.equal(typeof assetSlot.movscriptAssetSlotDeleteTarget, 'function')
  assert.equal(typeof assetSlot.movscriptCreativeReferenceAdapter, 'object')
  assert.equal(typeof assetSlot.movscriptCreativeReferencePath, 'function')
  assert.equal(typeof assetSlot.movscriptCreativeReferenceUpdateTarget, 'function')
  assert.equal(typeof assetSlot.movscriptCreativeReferenceDeleteTarget, 'function')
  assert.equal(Array.isArray(assetSlot.movscriptProjectAdapters), true)
  assert.equal(typeof assetSlot.movscriptProjectRelativeAssetSlotPath, 'function')
  assert.equal(typeof assetSlot.movscriptProjectRelativeCreativeReferencePath, 'function')
  assert.equal(typeof movscriptProject.createMovScriptProjectEditableProjectionKit, 'function')
  assert.equal(typeof movscriptProject.createMovScriptProjectNodeProjectionKit, 'function')
})

test('CJS example subpath entrypoints export focused APIs', () => {
  const require = createRequire(import.meta.url)
  const note = require('../dist/examples/note.cjs')
  const assetSlot = require('../dist/examples/movscriptAssetSlot.cjs')
  const movscriptProject = require('../dist/examples/movscriptProject.cjs')

  assert.equal(typeof note.noteProjectionAdapter, 'object')
  assert.equal(typeof note.noteProjectionPath, 'function')
  assert.equal(typeof note.noteProjectionUpdateTarget, 'function')
  assert.equal(typeof note.noteProjectionDeleteTarget, 'function')
  assert.equal(typeof note.runNoteProjectionExample, 'function')
  assert.equal(typeof note.runNoteProjectionIntegrationContractExample, 'function')
  assert.equal(typeof note.runNoteProjectionToolAdapterExample, 'function')
  assert.equal(typeof assetSlot.movscriptAssetSlotAdapter, 'object')
  assert.equal(typeof assetSlot.movscriptAssetSlotPath, 'function')
  assert.equal(typeof assetSlot.movscriptAssetSlotUpdateTarget, 'function')
  assert.equal(typeof assetSlot.movscriptAssetSlotDeleteTarget, 'function')
  assert.equal(typeof assetSlot.movscriptCreativeReferenceAdapter, 'object')
  assert.equal(typeof assetSlot.movscriptCreativeReferencePath, 'function')
  assert.equal(typeof assetSlot.movscriptCreativeReferenceUpdateTarget, 'function')
  assert.equal(typeof assetSlot.movscriptCreativeReferenceDeleteTarget, 'function')
  assert.equal(Array.isArray(assetSlot.movscriptProjectAdapters), true)
  assert.equal(typeof assetSlot.movscriptProjectRelativeAssetSlotPath, 'function')
  assert.equal(typeof assetSlot.movscriptProjectRelativeCreativeReferencePath, 'function')
  assert.equal(typeof movscriptProject.createMovScriptProjectEditableProjectionKit, 'function')
  assert.equal(typeof movscriptProject.createMovScriptProjectNodeProjectionKit, 'function')
})

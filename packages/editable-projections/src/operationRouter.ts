import {
  InvalidEditableProjectionBridgeOperationError,
  type BridgeOperationValidationIssue,
} from './errors.js'
import {
  runEditableProjectionBridgeOperation,
  type EditableProjectionBridgeResult,
} from './bridge.js'
import type {
  ApplyReview,
  WorkspaceUpdateTarget,
} from './types.js'
import type {
  ApplyArtifactReport,
  ApplyReport,
  ApplyReviewArtifactReport,
  ApplyReviewReport,
  EditableProjectionWorkflow,
  WorkflowApplyOptions,
  WorkflowReviewOptions,
  WorkflowStatusOptions,
  WorkflowUpdateAndReviewOptions,
  WorkflowUpdateOptions,
  WorkspaceStatusReport,
  WorkspaceUpdateAndReviewArtifactReport,
  WorkspaceUpdateAndReviewReport,
  WorkspaceUpdateArtifactReport,
  WorkspaceUpdateReport,
  WorkspaceUpdateTargetArtifactReport,
} from './workflow.js'

export const editableProjectionWorkflowOperationNames = [
  'status',
  'review',
  'checkReview',
  'saveReview',
  'loadReview',
  'loadAndCheckReview',
  'reviewAndSave',
  'update',
  'saveUpdateTargets',
  'loadUpdateTargets',
  'loadAndUpdate',
  'updateAndReview',
  'updateAndSaveReview',
  'applyReview',
  'loadAndApply',
  'reviewAndApply',
] as const

export type EditableProjectionWorkflowOperationName =
  typeof editableProjectionWorkflowOperationNames[number]

export interface EditableProjectionWorkflowOperationFieldSpec {
  name: string
  required: boolean
  kind: 'string' | 'object' | 'array'
  description: string
}

export interface EditableProjectionWorkflowOperationSpec {
  name: EditableProjectionWorkflowOperationName
  summary: string
  fields: readonly EditableProjectionWorkflowOperationFieldSpec[]
  result: string
  writesWorkspace: boolean
  executesCommands: boolean
}

export type EditableProjectionWorkflowOperationJsonSchema = Record<string, unknown>

export interface EditableProjectionWorkflowOperationToolDefinition {
  name: string
  operation: EditableProjectionWorkflowOperationName
  description: string
  inputSchema: EditableProjectionWorkflowOperationJsonSchema
  operationSchema: EditableProjectionWorkflowOperationJsonSchema
  result: string
  writesWorkspace: boolean
  executesCommands: boolean
}

export interface EditableProjectionWorkflowOperationToolDefinitionOptions {
  namePrefix?: string
}

export interface EditableProjectionWorkflowToolCallOptions {
  namePrefix?: string
}

export interface EditableProjectionWorkflowToolAdapter<TCommand = unknown> {
  toolDefinitions: readonly EditableProjectionWorkflowOperationToolDefinition[]
  getOperationName(toolName: string): EditableProjectionWorkflowOperationName | undefined
  run(
    toolName: string,
    argumentsValue?: unknown,
  ): Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<TCommand>>>
  runJson(
    toolName: string,
    argumentsJson: string,
  ): Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<TCommand>>>
}

export type WorkflowBridgeApplyOptions<TCommand = unknown> =
  Omit<WorkflowApplyOptions<TCommand>, 'executor'>

export type EditableProjectionWorkflowOperation<TCommand = unknown> =
  | { operation: 'status'; path?: string; options?: WorkflowStatusOptions }
  | { operation: 'review'; path?: string; options?: WorkflowReviewOptions }
  | { operation: 'checkReview'; review: ApplyReview<TCommand>; options?: WorkflowStatusOptions }
  | { operation: 'saveReview'; reviewPath: string; review: ApplyReview<TCommand>; options?: WorkflowStatusOptions }
  | { operation: 'loadReview'; reviewPath: string; options?: WorkflowStatusOptions }
  | { operation: 'loadAndCheckReview'; reviewPath: string; options?: WorkflowStatusOptions }
  | { operation: 'reviewAndSave'; path: string; reviewPath: string; options?: WorkflowReviewOptions }
  | { operation: 'update'; targets: WorkspaceUpdateTarget[]; options?: WorkflowUpdateOptions }
  | { operation: 'saveUpdateTargets'; artifactPath: string; targets: WorkspaceUpdateTarget[] }
  | { operation: 'loadUpdateTargets'; artifactPath: string }
  | { operation: 'loadAndUpdate'; artifactPath: string; options?: WorkflowUpdateOptions }
  | { operation: 'updateAndReview'; targets: WorkspaceUpdateTarget[]; path?: string; options?: WorkflowUpdateAndReviewOptions }
  | { operation: 'updateAndSaveReview'; targets: WorkspaceUpdateTarget[]; path: string; reviewPath: string; options?: WorkflowUpdateAndReviewOptions }
  | { operation: 'applyReview'; review: ApplyReview<TCommand>; options?: WorkflowBridgeApplyOptions<TCommand> }
  | { operation: 'loadAndApply'; reviewPath: string; options?: WorkflowBridgeApplyOptions<TCommand> }
  | { operation: 'reviewAndApply'; path?: string; options?: WorkflowReviewOptions & WorkflowBridgeApplyOptions<TCommand> }

export type EditableProjectionWorkflowOperationResult<TCommand = unknown> =
  | WorkspaceStatusReport
  | ApplyReviewReport<TCommand>
  | ApplyReviewArtifactReport<TCommand>
  | WorkspaceUpdateReport
  | WorkspaceUpdateTargetArtifactReport
  | WorkspaceUpdateArtifactReport
  | WorkspaceUpdateAndReviewReport<TCommand>
  | WorkspaceUpdateAndReviewArtifactReport<TCommand>
  | ApplyReport<TCommand>
  | ApplyArtifactReport<TCommand>

export interface EditableProjectionWorkflowOperationRouter<TCommand = unknown> {
  run(
    operation: EditableProjectionWorkflowOperation<TCommand>,
  ): Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<TCommand>>>
  runJson(
    operationJson: string,
  ): Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<TCommand>>>
}

export function createEditableProjectionWorkflowOperationRouter<TCommand = unknown>(
  workflow: EditableProjectionWorkflow<TCommand>,
): EditableProjectionWorkflowOperationRouter<TCommand> {
  return {
    run(operation) {
      return runEditableProjectionWorkflowOperation(workflow, operation)
    },
    runJson(operationJson) {
      return runEditableProjectionWorkflowOperationJson(workflow, operationJson)
    },
  }
}

export function createEditableProjectionWorkflowToolAdapter<TCommand = unknown>(
  workflow: EditableProjectionWorkflow<TCommand>,
  options: EditableProjectionWorkflowToolCallOptions = {},
): EditableProjectionWorkflowToolAdapter<TCommand> {
  const toolDefinitions = createEditableProjectionWorkflowOperationToolDefinitions(options)
  const adapter: EditableProjectionWorkflowToolAdapter<TCommand> = {
    toolDefinitions,
    getOperationName(toolName: string) {
      return getEditableProjectionWorkflowOperationNameForToolName(toolName, options)
    },
    run(toolName: string, argumentsValue?: unknown) {
      return runEditableProjectionWorkflowToolCall(workflow, toolName, argumentsValue, options)
    },
    runJson(toolName: string, argumentsJson: string) {
      return runEditableProjectionWorkflowToolCallJson(workflow, toolName, argumentsJson, options)
    },
  }
  return Object.freeze(adapter)
}

export function getEditableProjectionWorkflowOperationSpec(
  name: EditableProjectionWorkflowOperationName,
): EditableProjectionWorkflowOperationSpec {
  return editableProjectionWorkflowOperationSpecByName.get(name) ?? workflowOperationSpecDefinitions[name]
}

export function getEditableProjectionWorkflowOperationJsonSchema(
  name: EditableProjectionWorkflowOperationName,
): EditableProjectionWorkflowOperationJsonSchema {
  return editableProjectionWorkflowOperationJsonSchemaByName.get(name)
    ?? createWorkflowOperationJsonSchema(workflowOperationSpecDefinitions[name])
}

export function getEditableProjectionWorkflowOperationToolDefinition(
  name: EditableProjectionWorkflowOperationName,
  options: EditableProjectionWorkflowOperationToolDefinitionOptions = {},
): EditableProjectionWorkflowOperationToolDefinition {
  const spec = getEditableProjectionWorkflowOperationSpec(name)
  return createWorkflowOperationToolDefinition(
    spec,
    getEditableProjectionWorkflowOperationToolCallArgumentsJsonSchema(spec),
    getEditableProjectionWorkflowOperationJsonSchema(name),
    options,
  )
}

export function createEditableProjectionWorkflowOperationToolDefinitions(
  options: EditableProjectionWorkflowOperationToolDefinitionOptions = {},
): readonly EditableProjectionWorkflowOperationToolDefinition[] {
  return Object.freeze(editableProjectionWorkflowOperationSpecs.map((spec) => createWorkflowOperationToolDefinition(
    spec,
    getEditableProjectionWorkflowOperationToolCallArgumentsJsonSchema(spec),
    getEditableProjectionWorkflowOperationJsonSchema(spec.name),
    options,
  )))
}

export function runEditableProjectionWorkflowOperation<TCommand = unknown>(
  workflow: EditableProjectionWorkflow<TCommand>,
  operation: EditableProjectionWorkflowOperation<TCommand>,
): Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<TCommand>>> {
  return runEditableProjectionBridgeOperation(() => dispatchWorkflowOperation(
    workflow,
    validateEditableProjectionWorkflowOperation<TCommand>(operation),
  ))
}

export function runEditableProjectionWorkflowOperationJson<TCommand = unknown>(
  workflow: EditableProjectionWorkflow<TCommand>,
  operationJson: string,
): Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<TCommand>>> {
  return runEditableProjectionBridgeOperation(() => dispatchWorkflowOperation(
    workflow,
    parseEditableProjectionWorkflowOperationJson<TCommand>(operationJson),
  ))
}

export function getEditableProjectionWorkflowOperationNameForToolName(
  toolName: string,
  options: EditableProjectionWorkflowToolCallOptions = {},
): EditableProjectionWorkflowOperationName | undefined {
  return getWorkflowOperationToolNameMap(options).get(toolName)
}

export function runEditableProjectionWorkflowToolCall<TCommand = unknown>(
  workflow: EditableProjectionWorkflow<TCommand>,
  toolName: string,
  argumentsValue: unknown = {},
  options: EditableProjectionWorkflowToolCallOptions = {},
): Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<TCommand>>> {
  return runEditableProjectionBridgeOperation(() => dispatchWorkflowOperation(
    workflow,
    createWorkflowOperationFromToolCall<TCommand>(toolName, argumentsValue, options),
  ))
}

export function runEditableProjectionWorkflowToolCallJson<TCommand = unknown>(
  workflow: EditableProjectionWorkflow<TCommand>,
  toolName: string,
  argumentsJson: string,
  options: EditableProjectionWorkflowToolCallOptions = {},
): Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<TCommand>>> {
  return runEditableProjectionBridgeOperation(() => dispatchWorkflowOperation(
    workflow,
    createWorkflowOperationFromToolCall<TCommand>(
      toolName,
      parseWorkflowToolCallArgumentsJson(argumentsJson),
      options,
    ),
  ))
}

export function validateEditableProjectionWorkflowOperation<TCommand = unknown>(
  operation: unknown,
): EditableProjectionWorkflowOperation<TCommand> {
  const issues: BridgeOperationValidationIssue[] = []
  if (!isRecord(operation)) {
    throw new InvalidEditableProjectionBridgeOperationError([{
      path: '/',
      message: 'operation request must be a JSON object.',
    }])
  }

  if (!isWorkflowOperationName(operation.operation)) {
    issues.push({
      path: '/operation',
      message: `operation must be one of: ${editableProjectionWorkflowOperationNames.join(', ')}.`,
    })
  } else {
    validateWorkflowOperationFields(operation.operation, operation, issues)
  }

  if (issues.length > 0) {
    throw new InvalidEditableProjectionBridgeOperationError(issues)
  }
  return operation as EditableProjectionWorkflowOperation<TCommand>
}

export function serializeEditableProjectionWorkflowOperationJson<TCommand = unknown>(
  operation: EditableProjectionWorkflowOperation<TCommand>,
): string {
  const validated = validateEditableProjectionWorkflowOperation<TCommand>(operation)
  const issues: BridgeOperationValidationIssue[] = []
  validateJsonCompatible(validated, '/', issues)
  if (issues.length > 0) {
    throw new InvalidEditableProjectionBridgeOperationError(issues)
  }
  return `${JSON.stringify(validated, null, 2)}\n`
}

export function parseEditableProjectionWorkflowOperationJson<TCommand = unknown>(
  content: string,
): EditableProjectionWorkflowOperation<TCommand> {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidEditableProjectionBridgeOperationError([{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateEditableProjectionWorkflowOperation<TCommand>(value)
}

async function dispatchWorkflowOperation<TCommand>(
  workflow: EditableProjectionWorkflow<TCommand>,
  operation: EditableProjectionWorkflowOperation<TCommand>,
): Promise<EditableProjectionWorkflowOperationResult<TCommand>> {
  switch (operation.operation) {
    case 'status':
      return workflow.status(operation.path, operation.options)
    case 'review':
      return workflow.review(operation.path, operation.options)
    case 'checkReview':
      return workflow.checkReview(operation.review, operation.options)
    case 'saveReview':
      return workflow.saveReview(operation.reviewPath, operation.review, operation.options)
    case 'loadReview':
      return workflow.loadReview(operation.reviewPath, operation.options)
    case 'loadAndCheckReview':
      return workflow.loadAndCheckReview(operation.reviewPath, operation.options)
    case 'reviewAndSave':
      return workflow.reviewAndSave(operation.path, operation.reviewPath, operation.options)
    case 'update':
      return workflow.update(operation.targets, operation.options)
    case 'saveUpdateTargets':
      return workflow.saveUpdateTargets(operation.artifactPath, operation.targets)
    case 'loadUpdateTargets':
      return workflow.loadUpdateTargets(operation.artifactPath)
    case 'loadAndUpdate':
      return workflow.loadAndUpdate(operation.artifactPath, operation.options)
    case 'updateAndReview':
      return workflow.updateAndReview(operation.targets, operation.path, operation.options)
    case 'updateAndSaveReview':
      return workflow.updateAndSaveReview(operation.targets, operation.path, operation.reviewPath, operation.options)
    case 'applyReview':
      return workflow.applyReview(operation.review, operation.options as WorkflowApplyOptions<TCommand> | undefined)
    case 'loadAndApply':
      return workflow.loadAndApply(operation.reviewPath, operation.options as WorkflowApplyOptions<TCommand> | undefined)
    case 'reviewAndApply':
      return workflow.reviewAndApply(operation.path, operation.options as (WorkflowReviewOptions & WorkflowApplyOptions<TCommand>) | undefined)
  }
}

function validateWorkflowOperationFields(
  name: EditableProjectionWorkflowOperationName,
  operation: Record<string, unknown>,
  issues: BridgeOperationValidationIssue[],
): void {
  validateOptionalString(operation.path, '/path', 'path', issues)
  validateOptionalObject(operation.options, '/options', 'options', issues)

  switch (name) {
    case 'checkReview':
    case 'applyReview':
      validateRequiredObject(operation.review, '/review', 'review', issues)
      rejectExecutorOption(operation.options, issues)
      break
    case 'saveReview':
      validateRequiredString(operation.reviewPath, '/reviewPath', 'reviewPath', issues)
      validateRequiredObject(operation.review, '/review', 'review', issues)
      break
    case 'loadReview':
    case 'loadAndCheckReview':
    case 'loadAndApply':
      validateRequiredString(operation.reviewPath, '/reviewPath', 'reviewPath', issues)
      rejectExecutorOption(operation.options, issues)
      break
    case 'reviewAndSave':
      validateRequiredString(operation.path, '/path', 'path', issues)
      validateRequiredString(operation.reviewPath, '/reviewPath', 'reviewPath', issues)
      break
    case 'update':
    case 'updateAndReview':
      validateRequiredArray(operation.targets, '/targets', 'targets', issues)
      break
    case 'saveUpdateTargets':
      validateRequiredString(operation.artifactPath, '/artifactPath', 'artifactPath', issues)
      validateRequiredArray(operation.targets, '/targets', 'targets', issues)
      break
    case 'loadUpdateTargets':
    case 'loadAndUpdate':
      validateRequiredString(operation.artifactPath, '/artifactPath', 'artifactPath', issues)
      break
    case 'updateAndSaveReview':
      validateRequiredArray(operation.targets, '/targets', 'targets', issues)
      validateRequiredString(operation.path, '/path', 'path', issues)
      validateRequiredString(operation.reviewPath, '/reviewPath', 'reviewPath', issues)
      break
    case 'status':
    case 'review':
    case 'reviewAndApply':
      rejectExecutorOption(operation.options, issues)
      break
  }
}

function createWorkflowOperationFromToolCall<TCommand>(
  toolName: string,
  argumentsValue: unknown,
  options: EditableProjectionWorkflowToolCallOptions,
): EditableProjectionWorkflowOperation<TCommand> {
  const operationName = getEditableProjectionWorkflowOperationNameForToolName(toolName, options)
  if (operationName === undefined) {
    throw new InvalidEditableProjectionBridgeOperationError([{
      path: '/toolName',
      message: `toolName must be one of: ${[...getWorkflowOperationToolNameMap(options).keys()].join(', ')}.`,
    }])
  }
  if (!isRecord(argumentsValue)) {
    throw new InvalidEditableProjectionBridgeOperationError([{
      path: '/arguments',
      message: 'tool call arguments must be a JSON object.',
    }])
  }
  if (argumentsValue.operation !== undefined && argumentsValue.operation !== operationName) {
    throw new InvalidEditableProjectionBridgeOperationError([{
      path: '/arguments/operation',
      message: `operation must match toolName ${toolName}.`,
    }])
  }
  return validateEditableProjectionWorkflowOperation<TCommand>({
    ...argumentsValue,
    operation: operationName,
  })
}

function parseWorkflowToolCallArgumentsJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch (error) {
    throw new InvalidEditableProjectionBridgeOperationError([{
      path: '/arguments',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
}

function isWorkflowOperationName(value: unknown): value is EditableProjectionWorkflowOperationName {
  return typeof value === 'string'
    && (editableProjectionWorkflowOperationNames as readonly string[]).includes(value)
}

function validateRequiredString(
  value: unknown,
  path: string,
  name: string,
  issues: BridgeOperationValidationIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, message: `${name} must be a non-empty string.` })
  }
}

function validateOptionalString(
  value: unknown,
  path: string,
  name: string,
  issues: BridgeOperationValidationIssue[],
): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push({ path, message: `${name} must be a string when present.` })
  }
}

function validateRequiredArray(
  value: unknown,
  path: string,
  name: string,
  issues: BridgeOperationValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${name} must be an array.` })
  }
}

function validateRequiredObject(
  value: unknown,
  path: string,
  name: string,
  issues: BridgeOperationValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: `${name} must be a JSON object.` })
  }
}

function validateOptionalObject(
  value: unknown,
  path: string,
  name: string,
  issues: BridgeOperationValidationIssue[],
): void {
  if (value !== undefined && !isRecord(value)) {
    issues.push({ path, message: `${name} must be a JSON object when present.` })
  }
}

function rejectExecutorOption(
  options: unknown,
  issues: BridgeOperationValidationIssue[],
): void {
  if (isRecord(options) && Object.hasOwn(options, 'executor')) {
    issues.push({
      path: '/options/executor',
      message: 'executor must be configured on the workflow, not supplied in a bridge operation payload.',
    })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateJsonCompatible(
  value: unknown,
  path: string,
  issues: BridgeOperationValidationIssue[],
  seen = new WeakSet<object>(),
): void {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issues.push({ path, message: 'value must be JSON-compatible.' })
    }
    return
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      issues.push({ path, message: 'value must be JSON-compatible.' })
      return
    }
    seen.add(value)
    value.forEach((item, index) => validateJsonCompatible(item, `${path === '/' ? '' : path}/${String(index)}`, issues, seen))
    seen.delete(value)
    return
  }

  if (isJsonObject(value)) {
    if (seen.has(value)) {
      issues.push({ path, message: 'value must be JSON-compatible.' })
      return
    }
    seen.add(value)
    for (const [key, item] of Object.entries(value)) {
      validateJsonCompatible(item, `${path === '/' ? '' : path}/${escapeJsonPointerToken(key)}`, issues, seen)
    }
    seen.delete(value)
    return
  }

  issues.push({ path, message: 'value must be JSON-compatible.' })
}

function escapeJsonPointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const pathField: EditableProjectionWorkflowOperationFieldSpec = Object.freeze({
  name: 'path',
  required: false,
  kind: 'string',
  description: 'Workspace-relative path to inspect or review.',
})

const requiredPathField: EditableProjectionWorkflowOperationFieldSpec = Object.freeze({
  ...pathField,
  required: true,
})

const optionsField: EditableProjectionWorkflowOperationFieldSpec = Object.freeze({
  name: 'options',
  required: false,
  kind: 'object',
  description: 'Workflow method options. Apply operations do not accept executor in transport payloads.',
})

const reviewPathField: EditableProjectionWorkflowOperationFieldSpec = Object.freeze({
  name: 'reviewPath',
  required: true,
  kind: 'string',
  description: 'Review artifact path in the configured review store.',
})

const reviewField: EditableProjectionWorkflowOperationFieldSpec = Object.freeze({
  name: 'review',
  required: true,
  kind: 'object',
  description: 'Apply review artifact object.',
})

const targetsField: EditableProjectionWorkflowOperationFieldSpec = Object.freeze({
  name: 'targets',
  required: true,
  kind: 'array',
  description: 'Workspace update target artifact array.',
})

const artifactPathField: EditableProjectionWorkflowOperationFieldSpec = Object.freeze({
  name: 'artifactPath',
  required: true,
  kind: 'string',
  description: 'Update target artifact path in the configured update target store.',
})

const workflowOperationSpecDefinitions: Record<EditableProjectionWorkflowOperationName, EditableProjectionWorkflowOperationSpec> = {
  status: {
    name: 'status',
    summary: 'Inspect local draft files and synced backend state without mutating anything.',
    fields: [pathField, optionsField],
    result: 'WorkspaceStatusReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  review: {
    name: 'review',
    summary: 'Build an apply review for local draft changes without executing commands.',
    fields: [pathField, optionsField],
    result: 'ApplyReviewReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  checkReview: {
    name: 'checkReview',
    summary: 'Validate and gate an apply review object without executing commands.',
    fields: [reviewField, optionsField],
    result: 'ApplyReviewReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  saveReview: {
    name: 'saveReview',
    summary: 'Persist an apply review artifact in the configured review store.',
    fields: [reviewPathField, reviewField, optionsField],
    result: 'ApplyReviewArtifactReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  loadReview: {
    name: 'loadReview',
    summary: 'Load and validate an apply review artifact from the configured review store.',
    fields: [reviewPathField, optionsField],
    result: 'ApplyReviewArtifactReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  loadAndCheckReview: {
    name: 'loadAndCheckReview',
    summary: 'Load, validate, and gate an apply review artifact.',
    fields: [reviewPathField, optionsField],
    result: 'ApplyReviewArtifactReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  reviewAndSave: {
    name: 'reviewAndSave',
    summary: 'Build an apply review for a path and persist it as an artifact.',
    fields: [requiredPathField, reviewPathField, optionsField],
    result: 'ApplyReviewArtifactReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  update: {
    name: 'update',
    summary: 'Materialize backend update targets into local draft files and sync metadata.',
    fields: [targetsField, optionsField],
    result: 'WorkspaceUpdateReport',
    writesWorkspace: true,
    executesCommands: false,
  },
  saveUpdateTargets: {
    name: 'saveUpdateTargets',
    summary: 'Persist update target artifacts in the configured update target store.',
    fields: [artifactPathField, targetsField],
    result: 'WorkspaceUpdateTargetArtifactReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  loadUpdateTargets: {
    name: 'loadUpdateTargets',
    summary: 'Load and validate update target artifacts from the configured update target store.',
    fields: [artifactPathField],
    result: 'WorkspaceUpdateTargetArtifactReport',
    writesWorkspace: false,
    executesCommands: false,
  },
  loadAndUpdate: {
    name: 'loadAndUpdate',
    summary: 'Load update target artifacts and materialize them into local draft files.',
    fields: [artifactPathField, optionsField],
    result: 'WorkspaceUpdateArtifactReport',
    writesWorkspace: true,
    executesCommands: false,
  },
  updateAndReview: {
    name: 'updateAndReview',
    summary: 'Refresh local draft files from update targets and then build an apply review.',
    fields: [targetsField, pathField, optionsField],
    result: 'WorkspaceUpdateAndReviewReport',
    writesWorkspace: true,
    executesCommands: false,
  },
  updateAndSaveReview: {
    name: 'updateAndSaveReview',
    summary: 'Refresh local draft files, build an apply review, and persist the review artifact.',
    fields: [targetsField, requiredPathField, reviewPathField, optionsField],
    result: 'WorkspaceUpdateAndReviewArtifactReport',
    writesWorkspace: true,
    executesCommands: false,
  },
  applyReview: {
    name: 'applyReview',
    summary: 'Execute planned commands from an apply review through the configured workflow executor.',
    fields: [reviewField, optionsField],
    result: 'ApplyReport',
    writesWorkspace: true,
    executesCommands: true,
  },
  loadAndApply: {
    name: 'loadAndApply',
    summary: 'Load an apply review artifact and execute its planned commands through the configured workflow executor.',
    fields: [reviewPathField, optionsField],
    result: 'ApplyArtifactReport',
    writesWorkspace: true,
    executesCommands: true,
  },
  reviewAndApply: {
    name: 'reviewAndApply',
    summary: 'Build an apply review for local draft changes and execute its planned commands in one operation.',
    fields: [pathField, optionsField],
    result: 'ApplyReport',
    writesWorkspace: true,
    executesCommands: true,
  },
}

function freezeOperationSpec(
  spec: EditableProjectionWorkflowOperationSpec,
): EditableProjectionWorkflowOperationSpec {
  return Object.freeze({
    ...spec,
    fields: Object.freeze([...spec.fields]),
  })
}

export const editableProjectionWorkflowOperationSpecs = Object.freeze(
  editableProjectionWorkflowOperationNames.map((name) => freezeOperationSpec(workflowOperationSpecDefinitions[name])),
)

const editableProjectionWorkflowOperationSpecByName = new Map<EditableProjectionWorkflowOperationName, EditableProjectionWorkflowOperationSpec>(
  editableProjectionWorkflowOperationSpecs.map((spec) => [spec.name, spec]),
)

function createWorkflowOperationFieldJsonSchema(
  field: EditableProjectionWorkflowOperationFieldSpec,
): EditableProjectionWorkflowOperationJsonSchema {
  const schema: EditableProjectionWorkflowOperationJsonSchema = {
    type: field.kind,
    description: field.description,
  }
  if (field.kind === 'string' && field.required) {
    schema.minLength = 1
  }
  if (field.name === 'options') {
    schema.not = { required: ['executor'] }
  }
  return Object.freeze(schema)
}

function createWorkflowOperationJsonSchema(
  spec: EditableProjectionWorkflowOperationSpec,
): EditableProjectionWorkflowOperationJsonSchema {
  const properties: Record<string, EditableProjectionWorkflowOperationJsonSchema> = {
    operation: Object.freeze({
      const: spec.name,
      description: spec.summary,
    }),
  }
  const required = ['operation']
  for (const field of spec.fields) {
    properties[field.name] = createWorkflowOperationFieldJsonSchema(field)
    if (field.required) {
      required.push(field.name)
    }
  }

  return Object.freeze({
    type: 'object',
    description: spec.summary,
    properties: Object.freeze(properties),
    required: Object.freeze(required),
  })
}

function createWorkflowOperationToolCallArgumentsJsonSchema(
  spec: EditableProjectionWorkflowOperationSpec,
): EditableProjectionWorkflowOperationJsonSchema {
  const properties: Record<string, EditableProjectionWorkflowOperationJsonSchema> = {
    operation: Object.freeze({
      const: spec.name,
      description: `Optional operation discriminator. When present it must match ${spec.name}.`,
    }),
  }
  const required: string[] = []
  for (const field of spec.fields) {
    properties[field.name] = createWorkflowOperationFieldJsonSchema(field)
    if (field.required) {
      required.push(field.name)
    }
  }

  const schema: EditableProjectionWorkflowOperationJsonSchema = {
    type: 'object',
    description: `Arguments for ${spec.name}. The tool name supplies the operation discriminator.`,
    properties: Object.freeze(properties),
  }
  if (required.length > 0) {
    schema.required = Object.freeze(required)
  }
  return Object.freeze(schema)
}

function getEditableProjectionWorkflowOperationToolCallArgumentsJsonSchema(
  spec: EditableProjectionWorkflowOperationSpec,
): EditableProjectionWorkflowOperationJsonSchema {
  return editableProjectionWorkflowOperationToolCallArgumentsJsonSchemaByName.get(spec.name)
    ?? createWorkflowOperationToolCallArgumentsJsonSchema(spec)
}

const workflowOperationJsonSchemaDefinitions = Object.freeze(
  editableProjectionWorkflowOperationSpecs.map((spec) => createWorkflowOperationJsonSchema(spec)),
)

const workflowOperationToolCallArgumentsJsonSchemaDefinitions = Object.freeze(
  editableProjectionWorkflowOperationSpecs.map((spec) => createWorkflowOperationToolCallArgumentsJsonSchema(spec)),
)

export const editableProjectionWorkflowOperationJsonSchema = Object.freeze({
  type: 'object',
  description: 'Editable projection workflow operation request. Runtime validation remains authoritative.',
  oneOf: workflowOperationJsonSchemaDefinitions,
})

const editableProjectionWorkflowOperationJsonSchemaByName = new Map<EditableProjectionWorkflowOperationName, EditableProjectionWorkflowOperationJsonSchema>()
for (let index = 0; index < editableProjectionWorkflowOperationSpecs.length; index += 1) {
  const spec = editableProjectionWorkflowOperationSpecs[index]
  const schema = workflowOperationJsonSchemaDefinitions[index]
  if (spec !== undefined && schema !== undefined) {
    editableProjectionWorkflowOperationJsonSchemaByName.set(spec.name, schema)
  }
}

const editableProjectionWorkflowOperationToolCallArgumentsJsonSchemaByName = new Map<EditableProjectionWorkflowOperationName, EditableProjectionWorkflowOperationJsonSchema>()
for (let index = 0; index < editableProjectionWorkflowOperationSpecs.length; index += 1) {
  const spec = editableProjectionWorkflowOperationSpecs[index]
  const schema = workflowOperationToolCallArgumentsJsonSchemaDefinitions[index]
  if (spec !== undefined && schema !== undefined) {
    editableProjectionWorkflowOperationToolCallArgumentsJsonSchemaByName.set(spec.name, schema)
  }
}

function createWorkflowOperationToolDefinition(
  spec: EditableProjectionWorkflowOperationSpec,
  inputSchema: EditableProjectionWorkflowOperationJsonSchema,
  operationSchema: EditableProjectionWorkflowOperationJsonSchema,
  options: EditableProjectionWorkflowOperationToolDefinitionOptions,
): EditableProjectionWorkflowOperationToolDefinition {
  return Object.freeze({
    name: `${options.namePrefix ?? 'editable_projection_'}${toSnakeCase(spec.name)}`,
    operation: spec.name,
    description: spec.summary,
    inputSchema,
    operationSchema,
    result: spec.result,
    writesWorkspace: spec.writesWorkspace,
    executesCommands: spec.executesCommands,
  })
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
}

export const editableProjectionWorkflowOperationToolDefinitions = createEditableProjectionWorkflowOperationToolDefinitions()

const editableProjectionWorkflowOperationNameByToolName = createWorkflowOperationToolNameMap(
  editableProjectionWorkflowOperationToolDefinitions,
)

function getWorkflowOperationToolNameMap(
  options: EditableProjectionWorkflowToolCallOptions,
): Map<string, EditableProjectionWorkflowOperationName> {
  if (options.namePrefix === undefined) {
    return editableProjectionWorkflowOperationNameByToolName
  }
  return createWorkflowOperationToolNameMap(createEditableProjectionWorkflowOperationToolDefinitions(options))
}

function createWorkflowOperationToolNameMap(
  definitions: readonly EditableProjectionWorkflowOperationToolDefinition[],
): Map<string, EditableProjectionWorkflowOperationName> {
  return new Map(definitions.map((definition) => [definition.name, definition.operation]))
}

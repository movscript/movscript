import type { ApplyReviewGate } from './reviewGate.js'

export const editableProjectionErrorCodes = [
  'apply_review_not_ready',
  'duplicate_adapter',
  'invalid_adapter_contract',
  'invalid_kit_options',
  'invalid_apply_review',
  'invalid_artifact_compatibility',
  'invalid_bridge_operation',
  'invalid_bridge_result',
  'invalid_apply_options',
  'invalid_review_options',
  'invalid_format_options',
  'invalid_json_projection',
  'invalid_command_result',
  'invalid_integration_contract',
  'invalid_result_artifact',
  'invalid_workspace_options',
  'invalid_manifest',
  'invalid_status_artifact',
  'invalid_update_target',
  'invalid_update_options',
  'invalid_workflow_contract',
  'invalid_workflow_options',
  'missing_executor',
  'missing_review_artifact',
  'missing_review_store',
  'missing_update_target_artifact',
  'missing_update_target_store',
  'missing_workspace_file',
  'path_escape',
  'stale_apply_review',
  'unknown_command',
] as const

export type EditableProjectionErrorCode = typeof editableProjectionErrorCodes[number]

const editableProjectionErrorCodeSet = new Set<string>(editableProjectionErrorCodes)

export function isEditableProjectionErrorCode(code: unknown): code is EditableProjectionErrorCode {
  return typeof code === 'string' && editableProjectionErrorCodeSet.has(code)
}

export class EditableProjectionError extends Error {
  constructor(
    readonly code: EditableProjectionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EditableProjectionError'
  }
}

export class ApplyReviewNotReadyError extends EditableProjectionError {
  constructor(readonly gate: ApplyReviewGate) {
    super('apply_review_not_ready', [
      `Apply review is not ready: ${gate.blocked} blocked, ${gate.conflicts} conflicts.`,
      ...gate.reasons.map((reason) => `- ${reason}`),
    ].join('\n'))
    this.name = 'ApplyReviewNotReadyError'
  }
}

export class DuplicateProjectionAdapterError extends EditableProjectionError {
  constructor(readonly schema: string) {
    super('duplicate_adapter', `Projection adapter already registered for schema ${schema}`)
    this.name = 'DuplicateProjectionAdapterError'
  }
}

export class InvalidEditableProjectionKitOptionsError extends EditableProjectionError {
  constructor(readonly issues: string[]) {
    super('invalid_kit_options', [
      'Editable projection kit options are invalid.',
      ...issues.map((issue) => `- ${issue}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionKitOptionsError'
  }
}

export interface AdapterContractIssue {
  path: string
  message: string
}

export interface WorkflowContractIssue {
  path: string
  message: string
}

export interface IntegrationContractIssue {
  phase: 'adapter' | 'workflow'
  path: string
  message: string
}

export class InvalidProjectionAdapterContractError extends EditableProjectionError {
  constructor(
    readonly adapterSchema: string,
    readonly issues: AdapterContractIssue[],
  ) {
    super('invalid_adapter_contract', [
      `Projection adapter ${adapterSchema} does not satisfy the editable projection contract.`,
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidProjectionAdapterContractError'
  }
}

export class InvalidEditableProjectionWorkflowContractError extends EditableProjectionError {
  constructor(readonly issues: WorkflowContractIssue[]) {
    super('invalid_workflow_contract', [
      'Editable projection workflow contract failed.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionWorkflowContractError'
  }
}

export class InvalidEditableProjectionIntegrationContractError extends EditableProjectionError {
  constructor(readonly issues: IntegrationContractIssue[]) {
    super('invalid_integration_contract', [
      'Editable projection integration contract failed.',
      ...issues.map((issue) => `- ${issue.phase}${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionIntegrationContractError'
  }
}

export interface WorkflowOptionsValidationIssue {
  path: string
  message: string
}

export class InvalidEditableProjectionWorkflowOptionsError extends EditableProjectionError {
  constructor(readonly issues: WorkflowOptionsValidationIssue[]) {
    super('invalid_workflow_options', [
      'Editable projection workflow options are invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionWorkflowOptionsError'
  }
}

export class InvalidJsonProjectionError extends EditableProjectionError {
  constructor(
    readonly projectionPath: string | undefined,
    readonly causeMessage: string,
  ) {
    super('invalid_json_projection', [
      `Invalid JSON projection${projectionPath ? `: ${projectionPath}` : ''}.`,
      causeMessage,
    ].join('\n'))
    this.name = 'InvalidJsonProjectionError'
  }
}

export interface CommandResultValidationIssue {
  path: string
  message: string
}

export class InvalidProjectionCommandResultError extends EditableProjectionError {
  constructor(
    readonly adapterSchema: string,
    readonly filePath: string | undefined,
    readonly issues: CommandResultValidationIssue[],
  ) {
    super('invalid_command_result', [
      `Projection adapter ${adapterSchema} returned an invalid command result${filePath ? ` for ${filePath}` : ''}.`,
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidProjectionCommandResultError'
  }
}

export interface ResultArtifactValidationIssue {
  path: string
  message: string
}

export class InvalidEditableProjectionResultArtifactError extends EditableProjectionError {
  constructor(readonly issues: ResultArtifactValidationIssue[]) {
    super('invalid_result_artifact', [
      'Editable projection result artifact is invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionResultArtifactError'
  }
}

export interface ApplyReviewValidationIssue {
  path: string
  message: string
}

export class InvalidApplyReviewError extends EditableProjectionError {
  constructor(
    readonly reviewPath: string | undefined,
    readonly issues: ApplyReviewValidationIssue[],
  ) {
    super('invalid_apply_review', [
      `Apply review is invalid${reviewPath ? `: ${reviewPath}` : ''}.`,
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidApplyReviewError'
  }
}

export interface ArtifactCompatibilityValidationIssue {
  path: string
  message: string
}

export class InvalidEditableProjectionArtifactCompatibilityError extends EditableProjectionError {
  constructor(readonly issues: ArtifactCompatibilityValidationIssue[]) {
    super('invalid_artifact_compatibility', [
      'Editable projection artifact compatibility is invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionArtifactCompatibilityError'
  }
}

export interface BridgeResultValidationIssue {
  path: string
  message: string
}

export interface BridgeOperationValidationIssue {
  path: string
  message: string
}

export class InvalidEditableProjectionBridgeOperationError extends EditableProjectionError {
  constructor(readonly issues: BridgeOperationValidationIssue[]) {
    super('invalid_bridge_operation', [
      'Editable projection bridge operation is invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionBridgeOperationError'
  }
}

export class InvalidEditableProjectionBridgeResultError extends EditableProjectionError {
  constructor(readonly issues: BridgeResultValidationIssue[]) {
    super('invalid_bridge_result', [
      'Editable projection bridge result is invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionBridgeResultError'
  }
}

export interface ApplyOptionsValidationIssue {
  path: string
  message: string
}

export class InvalidWorkspaceApplyOptionsError extends EditableProjectionError {
  constructor(readonly issues: ApplyOptionsValidationIssue[]) {
    super('invalid_apply_options', [
      'Workspace apply options are invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidWorkspaceApplyOptionsError'
  }
}

export interface ReviewOptionsValidationIssue {
  path: string
  message: string
}

export class InvalidWorkspaceReviewOptionsError extends EditableProjectionError {
  constructor(readonly issues: ReviewOptionsValidationIssue[]) {
    super('invalid_review_options', [
      'Workspace review options are invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidWorkspaceReviewOptionsError'
  }
}

export interface FormatOptionsValidationIssue {
  path: string
  message: string
}

export class InvalidFormatOptionsError extends EditableProjectionError {
  constructor(readonly issues: FormatOptionsValidationIssue[]) {
    super('invalid_format_options', [
      'Format options are invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidFormatOptionsError'
  }
}

export interface WorkspaceOptionsValidationIssue {
  path: string
  message: string
}

export class InvalidEditableProjectionWorkspaceOptionsError extends EditableProjectionError {
  constructor(readonly issues: WorkspaceOptionsValidationIssue[]) {
    super('invalid_workspace_options', [
      'Editable projection workspace options are invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidEditableProjectionWorkspaceOptionsError'
  }
}

export interface StaleApplyReviewMismatch {
  field: 'localHash' | 'baseHash' | 'backendHash' | 'manifestEntry'
  expected?: string
  actual?: string
  message: string
}

export class StaleApplyReviewError extends EditableProjectionError {
  constructor(
    readonly filePath: string,
    readonly mismatches: StaleApplyReviewMismatch[],
  ) {
    super('stale_apply_review', [
      `Apply review is stale for ${filePath}. Re-run applyReview before applying.`,
      ...mismatches.map((mismatch) => `- ${mismatch.field}: ${mismatch.message}`),
    ].join('\n'))
    this.name = 'StaleApplyReviewError'
  }
}

export interface ManifestValidationIssue {
  path: string
  message: string
}

export class InvalidWorkspaceManifestError extends EditableProjectionError {
  constructor(
    readonly manifestPath: string | undefined,
    readonly issues: ManifestValidationIssue[],
  ) {
    super('invalid_manifest', [
      `Workspace manifest is invalid${manifestPath ? `: ${manifestPath}` : ''}.`,
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidWorkspaceManifestError'
  }
}

export interface WorkspaceStatusValidationIssue {
  path: string
  message: string
}

export class InvalidWorkspaceStatusArtifactError extends EditableProjectionError {
  constructor(readonly issues: WorkspaceStatusValidationIssue[]) {
    super('invalid_status_artifact', [
      'Workspace status artifact is invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidWorkspaceStatusArtifactError'
  }
}

export interface UpdateTargetValidationIssue {
  path: string
  message: string
}

export class InvalidWorkspaceUpdateTargetError extends EditableProjectionError {
  constructor(readonly issues: UpdateTargetValidationIssue[]) {
    super('invalid_update_target', [
      'Workspace update targets are invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidWorkspaceUpdateTargetError'
  }
}

export interface UpdateOptionsValidationIssue {
  path: string
  message: string
}

export class InvalidWorkspaceUpdateOptionsError extends EditableProjectionError {
  constructor(readonly issues: UpdateOptionsValidationIssue[]) {
    super('invalid_update_options', [
      'Workspace update options are invalid.',
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    ].join('\n'))
    this.name = 'InvalidWorkspaceUpdateOptionsError'
  }
}

export class MissingCommandExecutorError extends EditableProjectionError {
  constructor() {
    super('missing_executor', 'EditableProjectionWorkflow requires an executor to apply reviews.')
    this.name = 'MissingCommandExecutorError'
  }
}

export class MissingApplyReviewArtifactError extends EditableProjectionError {
  constructor(readonly reviewPath: string) {
    super('missing_review_artifact', `Apply review artifact was not found: ${reviewPath}`)
    this.name = 'MissingApplyReviewArtifactError'
  }
}

export class MissingApplyReviewStoreError extends EditableProjectionError {
  constructor() {
    super('missing_review_store', 'EditableProjectionWorkflow requires a reviewStore to persist review artifacts.')
    this.name = 'MissingApplyReviewStoreError'
  }
}

export class MissingWorkspaceUpdateTargetArtifactError extends EditableProjectionError {
  constructor(readonly artifactPath: string) {
    super('missing_update_target_artifact', `Workspace update target artifact was not found: ${artifactPath}`)
    this.name = 'MissingWorkspaceUpdateTargetArtifactError'
  }
}

export class MissingWorkspaceUpdateTargetStoreError extends EditableProjectionError {
  constructor() {
    super('missing_update_target_store', 'EditableProjectionWorkflow requires an updateTargetStore to persist update target artifacts.')
    this.name = 'MissingWorkspaceUpdateTargetStoreError'
  }
}

export class MissingWorkspaceFileError extends EditableProjectionError {
  constructor(readonly filePath: string) {
    super('missing_workspace_file', `Workspace file was not found: ${filePath}`)
    this.name = 'MissingWorkspaceFileError'
  }
}

export class UnknownProjectionCommandError extends EditableProjectionError {
  constructor(readonly commandType: string) {
    super('unknown_command', `No command handler registered for ${commandType}`)
    this.name = 'UnknownProjectionCommandError'
  }
}

export class WorkspacePathEscapeError extends EditableProjectionError {
  constructor(readonly path: string) {
    super('path_escape', `Path escapes workspace root: ${path}`)
    this.name = 'WorkspacePathEscapeError'
  }
}

export interface SerializedEditableProjectionError {
  name: string
  message: string
  code?: EditableProjectionErrorCode
  details?: Record<string, unknown>
}

export function isEditableProjectionError(error: unknown): error is EditableProjectionError {
  return error instanceof EditableProjectionError
}

export function serializeEditableProjectionError(error: unknown): SerializedEditableProjectionError {
  if (isEditableProjectionError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      details: editableProjectionErrorDetails(error),
    }
  }

  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message,
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}

export function serializeEditableProjectionErrorJson(error: unknown): string {
  return `${JSON.stringify(serializeEditableProjectionError(error), null, 2)}\n`
}

export function parseSerializedEditableProjectionErrorJson(content: string): SerializedEditableProjectionError {
  try {
    return normalizeSerializedEditableProjectionError(JSON.parse(content))
  } catch (error) {
    return {
      name: 'InvalidSerializedEditableProjectionError',
      message: `Invalid serialized editable projection error JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function normalizeSerializedEditableProjectionError(value: unknown): SerializedEditableProjectionError {
  if (isSerializedEditableProjectionError(value)) return value
  return {
    name: 'InvalidSerializedEditableProjectionError',
    message: 'Serialized editable projection error payload is invalid.',
  }
}

export function isSerializedEditableProjectionError(value: unknown): value is SerializedEditableProjectionError {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string' || value.name.length === 0) return false
  if (typeof value.message !== 'string') return false
  if (value.code !== undefined && !isEditableProjectionErrorCode(value.code)) return false
  if (value.details !== undefined && !isRecord(value.details)) return false
  return true
}

export function formatSerializedEditableProjectionErrorMarkdown(
  error: SerializedEditableProjectionError,
): string {
  const lines = [
    '# Editable Projection Error',
    '',
    `Name: ${error.name}`,
    `Code: ${error.code ?? 'unclassified'}`,
    '',
    '## Message',
    '',
    ...error.message.split('\n'),
    '',
  ]

  if (error.details !== undefined) {
    lines.push(
      '## Details',
      '',
      '```json',
      stringifyDetails(error.details),
      '```',
      '',
    )
  }

  return lines.join('\n')
}

function editableProjectionErrorDetails(error: EditableProjectionError): Record<string, unknown> | undefined {
  if (error instanceof ApplyReviewNotReadyError) {
    return { gate: error.gate }
  }
  if (error instanceof DuplicateProjectionAdapterError) {
    return { schema: error.schema }
  }
  if (error instanceof InvalidEditableProjectionKitOptionsError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidProjectionAdapterContractError) {
    return {
      adapterSchema: error.adapterSchema,
      issues: error.issues,
    }
  }
  if (error instanceof InvalidEditableProjectionWorkflowContractError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidEditableProjectionIntegrationContractError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidEditableProjectionWorkflowOptionsError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidJsonProjectionError) {
    return {
      projectionPath: error.projectionPath,
      causeMessage: error.causeMessage,
    }
  }
  if (error instanceof InvalidProjectionCommandResultError) {
    return {
      adapterSchema: error.adapterSchema,
      filePath: error.filePath,
      issues: error.issues,
    }
  }
  if (error instanceof InvalidEditableProjectionResultArtifactError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidApplyReviewError) {
    return {
      reviewPath: error.reviewPath,
      issues: error.issues,
    }
  }
  if (error instanceof InvalidEditableProjectionArtifactCompatibilityError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidEditableProjectionBridgeOperationError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidEditableProjectionBridgeResultError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidWorkspaceApplyOptionsError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidWorkspaceReviewOptionsError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidFormatOptionsError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidEditableProjectionWorkspaceOptionsError) {
    return { issues: error.issues }
  }
  if (error instanceof StaleApplyReviewError) {
    return {
      filePath: error.filePath,
      mismatches: error.mismatches,
    }
  }
  if (error instanceof InvalidWorkspaceManifestError) {
    return {
      manifestPath: error.manifestPath,
      issues: error.issues,
    }
  }
  if (error instanceof InvalidWorkspaceStatusArtifactError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidWorkspaceUpdateTargetError) {
    return { issues: error.issues }
  }
  if (error instanceof InvalidWorkspaceUpdateOptionsError) {
    return { issues: error.issues }
  }
  if (error instanceof MissingApplyReviewArtifactError) {
    return { reviewPath: error.reviewPath }
  }
  if (error instanceof MissingWorkspaceUpdateTargetArtifactError) {
    return { artifactPath: error.artifactPath }
  }
  if (error instanceof MissingWorkspaceFileError) {
    return { filePath: error.filePath }
  }
  if (error instanceof UnknownProjectionCommandError) {
    return { commandType: error.commandType }
  }
  if (error instanceof WorkspacePathEscapeError) {
    return { path: error.path }
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringifyDetails(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return JSON.stringify({ error: 'Serialized error details are not JSON-compatible.' }, null, 2)
  }
}

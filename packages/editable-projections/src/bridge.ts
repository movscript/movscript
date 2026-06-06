import {
  formatSerializedEditableProjectionErrorMarkdown,
  InvalidEditableProjectionBridgeResultError,
  isSerializedEditableProjectionError,
  serializeEditableProjectionError,
  type BridgeResultValidationIssue,
  type SerializedEditableProjectionError,
} from './errors.js'
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

export interface EditableProjectionBridgeSuccess<TResult = unknown> {
  ok: true
  result: TResult
  markdown?: string
  json?: string
}

export interface EditableProjectionBridgeFailure {
  ok: false
  error: SerializedEditableProjectionError
  markdown: string
  json: string
}

export type EditableProjectionBridgeResult<TResult = unknown> =
  | EditableProjectionBridgeSuccess<TResult>
  | EditableProjectionBridgeFailure

export type EditableProjectionBridgeResultJson =
  | {
    ok: true
    markdown?: string
    json?: string
  }
  | {
    ok: false
    error: SerializedEditableProjectionError
    markdown: string
    json: string
  }

export interface EditableProjectionBridgeOperationOptions<TResult = unknown> {
  markdown?(result: TResult): string | undefined
  json?(result: TResult): string | undefined
}

export interface EditableProjectionWorkflowBridge<TCommand = unknown> {
  status(path?: string, options?: WorkflowStatusOptions): Promise<EditableProjectionBridgeResult<WorkspaceStatusReport>>
  review(path?: string, options?: WorkflowReviewOptions): Promise<EditableProjectionBridgeResult<ApplyReviewReport<TCommand>>>
  checkReview(
    review: ApplyReview<TCommand>,
    options?: WorkflowStatusOptions,
  ): Promise<EditableProjectionBridgeResult<ApplyReviewReport<TCommand>>>
  saveReview(
    reviewPath: string,
    review: ApplyReview<TCommand>,
    options?: WorkflowStatusOptions,
  ): Promise<EditableProjectionBridgeResult<ApplyReviewArtifactReport<TCommand>>>
  loadReview(
    reviewPath: string,
    options?: WorkflowStatusOptions,
  ): Promise<EditableProjectionBridgeResult<ApplyReviewArtifactReport<TCommand>>>
  loadAndCheckReview(
    reviewPath: string,
    options?: WorkflowStatusOptions,
  ): Promise<EditableProjectionBridgeResult<ApplyReviewArtifactReport<TCommand>>>
  reviewAndSave(
    path: string,
    reviewPath: string,
    options?: WorkflowReviewOptions,
  ): Promise<EditableProjectionBridgeResult<ApplyReviewArtifactReport<TCommand>>>
  update(
    targets: WorkspaceUpdateTarget[],
    options?: WorkflowUpdateOptions,
  ): Promise<EditableProjectionBridgeResult<WorkspaceUpdateReport>>
  saveUpdateTargets(
    artifactPath: string,
    targets: WorkspaceUpdateTarget[],
  ): Promise<EditableProjectionBridgeResult<WorkspaceUpdateTargetArtifactReport>>
  loadUpdateTargets(
    artifactPath: string,
  ): Promise<EditableProjectionBridgeResult<WorkspaceUpdateTargetArtifactReport>>
  loadAndUpdate(
    artifactPath: string,
    options?: WorkflowUpdateOptions,
  ): Promise<EditableProjectionBridgeResult<WorkspaceUpdateArtifactReport>>
  updateAndReview(
    targets: WorkspaceUpdateTarget[],
    path?: string,
    options?: WorkflowUpdateAndReviewOptions,
  ): Promise<EditableProjectionBridgeResult<WorkspaceUpdateAndReviewReport<TCommand>>>
  updateAndSaveReview(
    targets: WorkspaceUpdateTarget[],
    path: string,
    reviewPath: string,
    options?: WorkflowUpdateAndReviewOptions,
  ): Promise<EditableProjectionBridgeResult<WorkspaceUpdateAndReviewArtifactReport<TCommand>>>
  applyReview(
    review: ApplyReview<TCommand>,
    options?: WorkflowApplyOptions<TCommand>,
  ): Promise<EditableProjectionBridgeResult<ApplyReport<TCommand>>>
  loadAndApply(
    reviewPath: string,
    options?: WorkflowApplyOptions<TCommand>,
  ): Promise<EditableProjectionBridgeResult<ApplyArtifactReport<TCommand>>>
  reviewAndApply(
    path?: string,
    options?: WorkflowReviewOptions & WorkflowApplyOptions<TCommand>,
  ): Promise<EditableProjectionBridgeResult<ApplyReport<TCommand>>>
}

export async function runEditableProjectionBridgeOperation<TResult>(
  operation: () => TResult | Promise<TResult>,
  options: EditableProjectionBridgeOperationOptions<TResult> = {},
): Promise<EditableProjectionBridgeResult<TResult>> {
  try {
    const result = await operation()
    return createEditableProjectionBridgeSuccess(result, options)
  } catch (error) {
    return createEditableProjectionBridgeFailure(error)
  }
}

export function createEditableProjectionWorkflowBridge<TCommand = unknown>(
  workflow: EditableProjectionWorkflow<TCommand>,
): EditableProjectionWorkflowBridge<TCommand> {
  return {
    status(path, options) {
      return runEditableProjectionBridgeOperation(() => workflow.status(path, options))
    },
    review(path, options) {
      return runEditableProjectionBridgeOperation(() => workflow.review(path, options))
    },
    checkReview(review, options) {
      return runEditableProjectionBridgeOperation(() => workflow.checkReview(review, options))
    },
    saveReview(reviewPath, review, options) {
      return runEditableProjectionBridgeOperation(() => workflow.saveReview(reviewPath, review, options))
    },
    loadReview(reviewPath, options) {
      return runEditableProjectionBridgeOperation(() => workflow.loadReview(reviewPath, options))
    },
    loadAndCheckReview(reviewPath, options) {
      return runEditableProjectionBridgeOperation(() => workflow.loadAndCheckReview(reviewPath, options))
    },
    reviewAndSave(path, reviewPath, options) {
      return runEditableProjectionBridgeOperation(() => workflow.reviewAndSave(path, reviewPath, options))
    },
    update(targets, options) {
      return runEditableProjectionBridgeOperation(() => workflow.update(targets, options))
    },
    saveUpdateTargets(artifactPath, targets) {
      return runEditableProjectionBridgeOperation(() => workflow.saveUpdateTargets(artifactPath, targets))
    },
    loadUpdateTargets(artifactPath) {
      return runEditableProjectionBridgeOperation(() => workflow.loadUpdateTargets(artifactPath))
    },
    loadAndUpdate(artifactPath, options) {
      return runEditableProjectionBridgeOperation(() => workflow.loadAndUpdate(artifactPath, options))
    },
    updateAndReview(targets, path, options) {
      return runEditableProjectionBridgeOperation(() => workflow.updateAndReview(targets, path, options))
    },
    updateAndSaveReview(targets, path, reviewPath, options) {
      return runEditableProjectionBridgeOperation(() => workflow.updateAndSaveReview(targets, path, reviewPath, options))
    },
    applyReview(review, options) {
      return runEditableProjectionBridgeOperation(() => workflow.applyReview(review, options))
    },
    loadAndApply(reviewPath, options) {
      return runEditableProjectionBridgeOperation(() => workflow.loadAndApply(reviewPath, options))
    },
    reviewAndApply(path, options) {
      return runEditableProjectionBridgeOperation(() => workflow.reviewAndApply(path, options))
    },
  }
}

export function createEditableProjectionBridgeSuccess<TResult>(
  result: TResult,
  options: EditableProjectionBridgeOperationOptions<TResult> = {},
): EditableProjectionBridgeSuccess<TResult> {
  const markdown = options.markdown?.(result) ?? readOptionalStringProperty(result, 'markdown')
  const json = options.json?.(result) ?? readOptionalStringProperty(result, 'json')

  return {
    ok: true,
    result,
    ...(markdown !== undefined ? { markdown } : {}),
    ...(json !== undefined ? { json } : {}),
  }
}

export function createEditableProjectionBridgeFailure(error: unknown): EditableProjectionBridgeFailure {
  const serialized = serializeEditableProjectionError(error)
  return {
    ok: false,
    error: serialized,
    markdown: formatSerializedEditableProjectionErrorMarkdown(serialized),
    json: `${JSON.stringify(serialized, null, 2)}\n`,
  }
}

export function serializeEditableProjectionBridgeResultJson(
  result: EditableProjectionBridgeResult,
): string {
  return `${JSON.stringify(validateEditableProjectionBridgeResultJson(toBridgeResultJson(result)), null, 2)}\n`
}

export function parseEditableProjectionBridgeResultJson(content: string): EditableProjectionBridgeResultJson {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidEditableProjectionBridgeResultError([{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateEditableProjectionBridgeResultJson(value)
}

export function validateEditableProjectionBridgeResultJson(value: unknown): EditableProjectionBridgeResultJson {
  const issues: BridgeResultValidationIssue[] = []
  if (!isRecord(value)) {
    throw new InvalidEditableProjectionBridgeResultError([{
      path: '/',
      message: 'Bridge result must be a JSON object.',
    }])
  }

  if (value.ok === true) {
    validateOptionalString(value.markdown, '/markdown', 'markdown', issues)
    validateOptionalString(value.json, '/json', 'json', issues)
    rejectTransportOnlyFields(value, ['/result', '/error'], issues)
  } else if (value.ok === false) {
    if (!isSerializedEditableProjectionError(value.error)) {
      issues.push({ path: '/error', message: 'error must be a serialized editable projection error.' })
    }
    if (typeof value.markdown !== 'string') {
      issues.push({ path: '/markdown', message: 'markdown must be a string.' })
    }
    if (typeof value.json !== 'string') {
      issues.push({ path: '/json', message: 'json must be a string.' })
    }
    rejectTransportOnlyFields(value, ['/result'], issues)
  } else {
    issues.push({ path: '/ok', message: 'ok must be true or false.' })
  }

  if (issues.length > 0) {
    throw new InvalidEditableProjectionBridgeResultError(issues)
  }

  return value as EditableProjectionBridgeResultJson
}

function toBridgeResultJson(result: EditableProjectionBridgeResult): EditableProjectionBridgeResultJson {
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      markdown: result.markdown,
      json: result.json,
    }
  }

  return {
    ok: true,
    ...(result.markdown !== undefined ? { markdown: result.markdown } : {}),
    ...(result.json !== undefined ? { json: result.json } : {}),
  }
}

function rejectTransportOnlyFields(
  value: Record<string, unknown>,
  paths: string[],
  issues: BridgeResultValidationIssue[],
): void {
  for (const path of paths) {
    const key = path.slice(1)
    if (Object.hasOwn(value, key)) {
      issues.push({ path, message: `${key} must not be present in bridge result JSON.` })
    }
  }
}

function validateOptionalString(
  value: unknown,
  path: string,
  name: string,
  issues: BridgeResultValidationIssue[],
): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push({ path, message: `${name} must be a string when present.` })
  }
}

function readOptionalStringProperty(value: unknown, key: 'markdown' | 'json'): string | undefined {
  if (!isRecord(value)) return undefined
  const property = value[key]
  return typeof property === 'string' ? property : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

import {
  InvalidApplyReviewError,
  InvalidWorkspaceApplyOptionsError,
  InvalidWorkspaceReviewOptionsError,
  type ApplyOptionsValidationIssue,
  type ApplyReviewValidationIssue,
  type ReviewOptionsValidationIssue,
} from './errors.js'
import { normalizePath, pathHasParentSegment, pathIsAbsolute } from './paths.js'
import type {
  ApplyOperationState,
  ApplyReview,
  CommandExecutor,
  EntityId,
  JsonPatchOperation,
  ProjectionAction,
  ProjectionFileKind,
  ValidationIssue,
  WorkspaceUpdateMode,
} from './types.js'

const operationStates = new Set<ApplyOperationState>(['planned', 'noop', 'blocked', 'conflict'])
const projectionActions = new Set<ProjectionAction>(['create', 'update', 'delete'])
const projectionKinds = new Set<ProjectionFileKind>([
  'writable_projection',
  'generated_index',
  'materialized_view',
])

export function serializeApplyReviewJson<TCommand = unknown>(review: ApplyReview<TCommand>): string {
  return `${JSON.stringify(validateApplyReview(review), null, 2)}\n`
}

export function parseApplyReviewJson<TCommand = unknown>(content: string, reviewPath?: string): ApplyReview<TCommand> {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidApplyReviewError(reviewPath, [{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateApplyReview<TCommand>(value, reviewPath)
}

export function validateApplyReview<TCommand = unknown>(value: unknown, reviewPath?: string): ApplyReview<TCommand> {
  const issues: ApplyReviewValidationIssue[] = []
  if (!isRecord(value)) {
    throw new InvalidApplyReviewError(reviewPath, [{
      path: '/',
      message: 'Apply review must be a JSON object.',
    }])
  }

  validateReviewFilePath(value.rootPath, '/rootPath', 'rootPath', issues, { allowDot: true })
  validateSummary(value.summary, issues)

  if (!Array.isArray(value.operations)) {
    issues.push({ path: '/operations', message: 'operations must be an array.' })
  } else {
    value.operations.forEach((operation, index) => validateOperation(operation, `/operations/${index}`, issues))
    validateSummaryCounts(value.summary, value.operations, issues)
  }

  if (issues.length > 0) {
    throw new InvalidApplyReviewError(reviewPath, issues)
  }
  return value as unknown as ApplyReview<TCommand>
}

export interface WorkspaceReviewOptions {
  includeNoop?: boolean
}

export function validateWorkspaceReviewOptions(value: unknown): WorkspaceReviewOptions {
  const issues: ReviewOptionsValidationIssue[] = []

  if (!isRecord(value)) {
    throw new InvalidWorkspaceReviewOptionsError([{
      path: '/',
      message: 'Review options must be an object.',
    }])
  }

  if (value.includeNoop !== undefined && typeof value.includeNoop !== 'boolean') {
    issues.push({ path: '/includeNoop', message: 'includeNoop must be a boolean when present.' })
  }

  if (issues.length > 0) {
    throw new InvalidWorkspaceReviewOptionsError(issues)
  }
  return value as WorkspaceReviewOptions
}

export interface WorkspaceApplyOptions<TCommand = unknown> {
  executor: CommandExecutor<TCommand>
  allowConflicts?: boolean
  allowStaleReview?: boolean
  refreshMode?: WorkspaceUpdateMode
}

export function validateWorkspaceApplyOptions<TCommand = unknown>(value: unknown): WorkspaceApplyOptions<TCommand> {
  const issues: ApplyOptionsValidationIssue[] = []

  if (!isRecord(value)) {
    throw new InvalidWorkspaceApplyOptionsError([{
      path: '/',
      message: 'Apply options must be an object.',
    }])
  }

  if (!isRecord(value.executor) || typeof value.executor.execute !== 'function') {
    issues.push({ path: '/executor', message: 'executor must be an object with an execute function.' })
  }
  if (value.allowConflicts !== undefined && typeof value.allowConflicts !== 'boolean') {
    issues.push({ path: '/allowConflicts', message: 'allowConflicts must be a boolean when present.' })
  }
  if (value.allowStaleReview !== undefined && typeof value.allowStaleReview !== 'boolean') {
    issues.push({ path: '/allowStaleReview', message: 'allowStaleReview must be a boolean when present.' })
  }
  if (value.refreshMode !== undefined && value.refreshMode !== 'safe' && value.refreshMode !== 'overwrite' && value.refreshMode !== 'merge') {
    issues.push({ path: '/refreshMode', message: 'refreshMode must be safe, overwrite, or merge when present.' })
  }

  if (issues.length > 0) {
    throw new InvalidWorkspaceApplyOptionsError(issues)
  }
  return value as unknown as WorkspaceApplyOptions<TCommand>
}

function validateSummary(value: unknown, issues: ApplyReviewValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: '/summary', message: 'summary must be an object.' })
    return
  }
  for (const key of ['create', 'update', 'delete', 'noop', 'blocked', 'conflicts']) {
    if (!isNonNegativeInteger(value[key])) {
      issues.push({ path: `/summary/${key}`, message: `${key} must be a non-negative integer.` })
    }
  }
}

function validateSummaryCounts(
  summary: unknown,
  operations: unknown[],
  issues: ApplyReviewValidationIssue[],
): void {
  if (!isRecord(summary)) return
  const counts = {
    create: 0,
    update: 0,
    delete: 0,
    noop: 0,
    blocked: 0,
    conflicts: 0,
  }
  for (const operation of operations) {
    if (!isRecord(operation)) continue
    if (operation.state === 'blocked') counts.blocked += 1
    if (operation.state === 'conflict') counts.conflicts += 1
    if (operation.state === 'noop') counts.noop += 1
    if (operation.state === 'planned' && operation.action === 'create') counts.create += 1
    if (operation.state === 'planned' && operation.action === 'update') counts.update += 1
    if (operation.state === 'planned' && operation.action === 'delete') counts.delete += 1
  }
  for (const [key, count] of Object.entries(counts)) {
    if (summary[key] !== count) {
      issues.push({ path: `/summary/${key}`, message: `${key} must equal the operation count ${count}.` })
    }
  }
}

function validateOperation(operation: unknown, path: string, issues: ApplyReviewValidationIssue[]): void {
  if (!isRecord(operation)) {
    issues.push({ path, message: 'Operation must be an object.' })
    return
  }

  if (!operationStates.has(operation.state as ApplyOperationState)) {
    issues.push({ path: `${path}/state`, message: 'state must be planned, noop, blocked, or conflict.' })
  }
  validateOptionalAction(operation.action, `${path}/action`, issues)
  validateOperationStateSemantics(operation, path, issues)
  validateReviewFilePath(operation.filePath, `${path}/filePath`, 'filePath', issues)
  validateOptionalString(operation.schema, `${path}/schema`, 'schema', issues)
  validateOptionalString(operation.entityType, `${path}/entityType`, 'entityType', issues)
  validateEntityId(operation.entityId, `${path}/entityId`, issues)
  if (operation.kind !== undefined && !projectionKinds.has(operation.kind as ProjectionFileKind)) {
    issues.push({ path: `${path}/kind`, message: 'kind must be writable_projection, generated_index, or materialized_view.' })
  }
  if (operation.manifestTracked !== undefined && typeof operation.manifestTracked !== 'boolean') {
    issues.push({ path: `${path}/manifestTracked`, message: 'manifestTracked must be a boolean when present.' })
  }
  validateOptionalString(operation.localHash, `${path}/localHash`, 'localHash', issues)
  validateOptionalString(operation.baseHash, `${path}/baseHash`, 'baseHash', issues)
  validateOptionalString(operation.backendHash, `${path}/backendHash`, 'backendHash', issues)
  validateOptionalString(operation.baseBackendHash, `${path}/baseBackendHash`, 'baseBackendHash', issues)

  if (operation.patch !== undefined) {
    if (!Array.isArray(operation.patch)) {
      issues.push({ path: `${path}/patch`, message: 'patch must be an array when present.' })
    } else {
      operation.patch.forEach((patch, index) => validatePatch(patch, `${path}/patch/${index}`, issues))
    }
  }
  validateCommands(operation.commands, `${path}/commands`, issues)
  validateIssues(operation.issues, `${path}/issues`, issues)
  if (operation.conflicts !== undefined) {
    validateConflicts(operation.conflicts, `${path}/conflicts`, issues)
  }
}

function validateOperationStateSemantics(
  operation: Record<string, unknown>,
  path: string,
  issues: ApplyReviewValidationIssue[],
): void {
  if (!operationStates.has(operation.state as ApplyOperationState)) return

  if (operation.state === 'planned') {
    if (operation.action === undefined) {
      issues.push({ path: `${path}/action`, message: 'planned operations must include an action.' })
    }
    if (Array.isArray(operation.commands) && operation.commands.length === 0) {
      issues.push({ path: `${path}/commands`, message: 'planned operations must include at least one command.' })
    }
    return
  }

  if (operation.action !== undefined) {
    issues.push({ path: `${path}/action`, message: 'only planned operations may include an action.' })
  }
  if (Array.isArray(operation.commands) && operation.commands.length > 0) {
    issues.push({ path: `${path}/commands`, message: 'only planned operations may include commands.' })
  }
  if (Array.isArray(operation.patch) && operation.patch.length > 0) {
    issues.push({ path: `${path}/patch`, message: 'only planned operations may include patch operations.' })
  }
  if (operation.state === 'blocked' && Array.isArray(operation.issues) && operation.issues.length === 0) {
    issues.push({ path: `${path}/issues`, message: 'blocked operations must include at least one issue.' })
  }
  if (operation.state === 'conflict') {
    if (!Array.isArray(operation.conflicts) || operation.conflicts.length === 0) {
      issues.push({ path: `${path}/conflicts`, message: 'conflict operations must include at least one conflict.' })
    }
  } else if (Array.isArray(operation.conflicts) && operation.conflicts.length > 0) {
    issues.push({ path: `${path}/conflicts`, message: 'only conflict operations may include conflicts.' })
  }
}

function validatePatch(patch: unknown, path: string, issues: ApplyReviewValidationIssue[]): void {
  if (!isRecord(patch)) {
    issues.push({ path, message: 'Patch operation must be an object.' })
    return
  }
  if (patch.op !== 'add' && patch.op !== 'remove' && patch.op !== 'replace') {
    issues.push({ path: `${path}/op`, message: 'op must be add, remove, or replace.' })
  }
  validateJsonPointerString(patch.path, `${path}/path`, 'path', issues)
  if ((patch.op === 'add' || patch.op === 'replace') && !Object.hasOwn(patch, 'value')) {
    issues.push({ path: `${path}/value`, message: 'value is required for add and replace operations.' })
  } else if ((patch.op === 'add' || patch.op === 'replace') && Object.hasOwn(patch, 'value')) {
    validateJsonCompatible(patch.value, `${path}/value`, issues)
  }
}

function validateCommands(value: unknown, path: string, issues: ApplyReviewValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'commands must be an array.' })
    return
  }
  value.forEach((command, index) => validateJsonCompatible(command, `${path}/${index}`, issues))
}

function validateIssues(value: unknown, path: string, issues: ApplyReviewValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'issues must be an array.' })
    return
  }
  value.forEach((issue, index) => validateValidationIssue(issue, `${path}/${index}`, issues))
}

function validateValidationIssue(issue: unknown, path: string, issues: ApplyReviewValidationIssue[]): void {
  if (!isRecord(issue)) {
    issues.push({ path, message: 'Issue must be an object.' })
    return
  }
  validateOptionalString(issue.path, `${path}/path`, 'path', issues)
  if (typeof issue.message !== 'string' || issue.message.length === 0) {
    issues.push({ path: `${path}/message`, message: 'message must be a non-empty string.' })
  }
  if (issue.severity !== 'error' && issue.severity !== 'warning') {
    issues.push({ path: `${path}/severity`, message: 'severity must be error or warning.' })
  }
}

function validateConflicts(value: unknown, path: string, issues: ApplyReviewValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'conflicts must be an array when present.' })
    return
  }
  value.forEach((conflict, index) => {
    const conflictPath = `${path}/${index}`
    if (!isRecord(conflict)) {
      issues.push({ path: conflictPath, message: 'Conflict must be an object.' })
      return
    }
    validateJsonPointerString(conflict.path, `${conflictPath}/path`, 'path', issues)
    if (typeof conflict.message !== 'string' || conflict.message.length === 0) {
      issues.push({ path: `${conflictPath}/message`, message: 'message must be a non-empty string.' })
    }
  })
}

function validateOptionalAction(value: unknown, path: string, issues: ApplyReviewValidationIssue[]): void {
  if (value !== undefined && !projectionActions.has(value as ProjectionAction)) {
    issues.push({ path, message: 'action must be create, update, or delete when present.' })
  }
}

function validateEntityId(value: unknown, path: string, issues: ApplyReviewValidationIssue[]): asserts value is EntityId | undefined {
  if (value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
    issues.push({ path, message: 'entityId must be a string or number when present.' })
  }
}

function validateJsonPointerString(value: unknown, path: string, name: string, issues: ApplyReviewValidationIssue[]): void {
  if (typeof value !== 'string') {
    issues.push({ path, message: `${name} must be a string.` })
    return
  }
  if (value !== '' && !value.startsWith('/')) {
    issues.push({ path, message: `${name} must be a JSON Pointer.` })
  }
}

function validateReviewFilePath(
  value: unknown,
  path: string,
  name: string,
  issues: ApplyReviewValidationIssue[],
  options: { allowDot?: boolean } = {},
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, message: `${name} must be a non-empty normalized path.` })
    return
  }
  if (normalizePath(value) !== value || (!options.allowDot && value === '.')) {
    issues.push({ path, message: `${name} must be a non-empty normalized path.` })
  }
  if (pathIsAbsolute(value)) {
    issues.push({ path, message: `${name} must be relative.` })
  }
  if (pathHasParentSegment(value)) {
    issues.push({ path, message: `${name} must not contain parent-directory segments.` })
  }
}

function validateOptionalString(value: unknown, path: string, name: keyof ValidationIssue | string, issues: ApplyReviewValidationIssue[]): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push({ path, message: `${name} must be a string when present.` })
  }
}

function validateJsonCompatible(
  value: unknown,
  path: string,
  issues: ApplyReviewValidationIssue[],
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
    value.forEach((item, index) => validateJsonCompatible(item, `${path}/${index}`, issues, seen))
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
      validateJsonCompatible(item, `${path}/${escapeJsonPointerToken(key)}`, issues, seen)
    }
    seen.delete(value)
    return
  }

  issues.push({ path, message: 'value must be JSON-compatible.' })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function escapeJsonPointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

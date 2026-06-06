import {
  InvalidEditableProjectionResultArtifactError,
  type ResultArtifactValidationIssue,
} from './errors.js'
import { normalizePath, pathHasParentSegment, pathIsAbsolute } from './paths.js'
import type {
  ApplyResult,
  EntityId,
  ProjectionFileKind,
  ValidationIssue,
  WorkspaceUpdateMode,
  WorkspaceUpdateOperation,
  WorkspaceUpdateOperationState,
  WorkspaceUpdateResult,
} from './types.js'

const updateStates = new Set<WorkspaceUpdateOperationState>([
  'updated',
  'deleted',
  'noop',
  'blocked',
  'conflict',
])

const updateModes = new Set<WorkspaceUpdateMode>(['safe', 'overwrite', 'merge'])

const projectionKinds = new Set<ProjectionFileKind>([
  'writable_projection',
  'generated_index',
  'materialized_view',
])

export function serializeWorkspaceUpdateResultJson(result: WorkspaceUpdateResult): string {
  return `${JSON.stringify(validateWorkspaceUpdateResult(result), null, 2)}\n`
}

export function parseWorkspaceUpdateResultJson(content: string): WorkspaceUpdateResult {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidEditableProjectionResultArtifactError([{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateWorkspaceUpdateResult(value)
}

export function validateWorkspaceUpdateResult(value: unknown): WorkspaceUpdateResult {
  const issues: ResultArtifactValidationIssue[] = []
  if (!isRecord(value)) {
    throw new InvalidEditableProjectionResultArtifactError([{
      path: '/',
      message: 'Workspace update result must be a JSON object.',
    }])
  }

  if (value.backendRevision !== undefined && typeof value.backendRevision !== 'string') {
    issues.push({ path: '/backendRevision', message: 'backendRevision must be a string when present.' })
  }
  validateUpdateSummary(value.summary, '/summary', issues)
  if (!Array.isArray(value.operations)) {
    issues.push({ path: '/operations', message: 'operations must be an array.' })
  } else {
    value.operations.forEach((operation, index) => validateUpdateOperation(operation, `/operations/${index}`, issues))
    validateUpdateSummaryCounts(value.summary, value.operations, issues)
  }

  if (issues.length > 0) {
    throw new InvalidEditableProjectionResultArtifactError(issues)
  }
  return normalizeWorkspaceUpdateResult(value as unknown as WorkspaceUpdateResult)
}

export function serializeApplyResultJson(result: ApplyResult): string {
  return `${JSON.stringify(validateApplyResult(result), null, 2)}\n`
}

export function parseApplyResultJson(content: string): ApplyResult {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidEditableProjectionResultArtifactError([{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateApplyResult(value)
}

export function validateApplyResult(value: unknown): ApplyResult {
  const issues: ResultArtifactValidationIssue[] = []
  if (!isRecord(value)) {
    throw new InvalidEditableProjectionResultArtifactError([{
      path: '/',
      message: 'Apply result must be a JSON object.',
    }])
  }

  validateNonNegativeInteger(value.appliedOperations, '/appliedOperations', 'appliedOperations', issues)
  validateNonNegativeInteger(value.appliedCommands, '/appliedCommands', 'appliedCommands', issues)
  if (value.refresh !== undefined) {
    try {
      validateWorkspaceUpdateResult(value.refresh)
    } catch (error) {
      if (error instanceof InvalidEditableProjectionResultArtifactError) {
        issues.push(...error.issues.map((issue) => ({
          path: `/refresh${issue.path === '/' ? '' : issue.path}`,
          message: issue.message,
        })))
      } else {
        issues.push({ path: '/refresh', message: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  if (issues.length > 0) {
    throw new InvalidEditableProjectionResultArtifactError(issues)
  }
  return normalizeApplyResult(value as unknown as ApplyResult)
}

function normalizeWorkspaceUpdateResult(result: WorkspaceUpdateResult): WorkspaceUpdateResult {
  return {
    ...(result.backendRevision !== undefined ? { backendRevision: result.backendRevision } : {}),
    summary: result.summary,
    operations: result.operations.map(normalizeWorkspaceUpdateOperation),
  }
}

function normalizeWorkspaceUpdateOperation(operation: WorkspaceUpdateOperation): WorkspaceUpdateOperation {
  return {
    state: operation.state,
    path: operation.path,
    kind: operation.kind,
    schema: operation.schema,
    entityType: operation.entityType,
    ...(operation.entityId !== undefined ? { entityId: operation.entityId } : {}),
    mode: operation.mode,
    ...(operation.localHash !== undefined ? { localHash: operation.localHash } : {}),
    ...(operation.baseHash !== undefined ? { baseHash: operation.baseHash } : {}),
    ...(operation.backendHash !== undefined ? { backendHash: operation.backendHash } : {}),
    issues: operation.issues.map(normalizeValidationIssue),
    ...(operation.conflicts !== undefined ? { conflicts: operation.conflicts } : {}),
  }
}

function normalizeApplyResult(result: ApplyResult): ApplyResult {
  return {
    appliedOperations: result.appliedOperations,
    appliedCommands: result.appliedCommands,
    ...(result.refresh !== undefined ? { refresh: normalizeWorkspaceUpdateResult(result.refresh) } : {}),
  }
}

function validateUpdateSummary(
  value: unknown,
  path: string,
  issues: ResultArtifactValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'summary must be an object.' })
    return
  }
  for (const key of ['updated', 'deleted', 'noop', 'blocked', 'conflicts']) {
    validateNonNegativeInteger(value[key], `${path}/${key}`, key, issues)
  }
}

function validateUpdateSummaryCounts(
  summary: unknown,
  operations: unknown[],
  issues: ResultArtifactValidationIssue[],
): void {
  if (!isRecord(summary)) return
  const counts = {
    updated: 0,
    deleted: 0,
    noop: 0,
    blocked: 0,
    conflicts: 0,
  }
  for (const operation of operations) {
    if (!isRecord(operation)) continue
    if (operation.state === 'updated') counts.updated += 1
    if (operation.state === 'deleted') counts.deleted += 1
    if (operation.state === 'noop') counts.noop += 1
    if (operation.state === 'blocked') counts.blocked += 1
    if (operation.state === 'conflict') counts.conflicts += 1
  }
  for (const [key, count] of Object.entries(counts)) {
    if (summary[key] !== count) {
      issues.push({ path: `/summary/${key}`, message: `${key} must equal the operation count ${count}.` })
    }
  }
}

function validateUpdateOperation(
  operation: unknown,
  path: string,
  issues: ResultArtifactValidationIssue[],
): void {
  if (!isRecord(operation)) {
    issues.push({ path, message: 'Workspace update operation must be an object.' })
    return
  }

  if (!updateStates.has(operation.state as WorkspaceUpdateOperationState)) {
    issues.push({ path: `${path}/state`, message: 'state must be updated, deleted, noop, blocked, or conflict.' })
  }
  validateResultPath(operation.path, `${path}/path`, 'path', issues)
  if (!projectionKinds.has(operation.kind as ProjectionFileKind)) {
    issues.push({ path: `${path}/kind`, message: 'kind must be writable_projection, generated_index, or materialized_view.' })
  }
  validateNonEmptyString(operation.schema, `${path}/schema`, 'schema', issues)
  validateNonEmptyString(operation.entityType, `${path}/entityType`, 'entityType', issues)
  validateEntityId(operation.entityId, `${path}/entityId`, issues)
  if (!updateModes.has(operation.mode as WorkspaceUpdateMode)) {
    issues.push({ path: `${path}/mode`, message: 'mode must be safe, overwrite, or merge.' })
  }
  validateOptionalString(operation.localHash, `${path}/localHash`, 'localHash', issues)
  validateOptionalString(operation.baseHash, `${path}/baseHash`, 'baseHash', issues)
  validateOptionalString(operation.backendHash, `${path}/backendHash`, 'backendHash', issues)
  validateValidationIssues(operation.issues, `${path}/issues`, issues)
  if (operation.conflicts !== undefined) {
    validateConflicts(operation.conflicts, `${path}/conflicts`, issues)
  }
}

function validateValidationIssues(
  value: unknown,
  path: string,
  issues: ResultArtifactValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'issues must be an array.' })
    return
  }
  value.forEach((issue, index) => validateValidationIssue(issue, `${path}/${index}`, issues))
}

function validateValidationIssue(
  issue: unknown,
  path: string,
  issues: ResultArtifactValidationIssue[],
): void {
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

function validateConflicts(
  value: unknown,
  path: string,
  issues: ResultArtifactValidationIssue[],
): void {
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
    for (const key of ['base', 'local', 'remote']) {
      if (Object.hasOwn(conflict, key)) {
        validateJsonCompatible(conflict[key], `${conflictPath}/${key}`, issues)
      }
    }
  })
}

function validateResultPath(
  value: unknown,
  path: string,
  name: string,
  issues: ResultArtifactValidationIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, message: `${name} must be a non-empty normalized path.` })
    return
  }
  if (normalizePath(value) !== value || value === '.') {
    issues.push({ path, message: `${name} must be a non-empty normalized path.` })
  }
  if (pathIsAbsolute(value)) {
    issues.push({ path, message: `${name} must be relative.` })
  }
  if (pathHasParentSegment(value)) {
    issues.push({ path, message: `${name} must not contain parent-directory segments.` })
  }
}

function validateJsonPointerString(
  value: unknown,
  path: string,
  name: string,
  issues: ResultArtifactValidationIssue[],
): void {
  if (typeof value !== 'string') {
    issues.push({ path, message: `${name} must be a string.` })
    return
  }
  if (value !== '' && !value.startsWith('/')) {
    issues.push({ path, message: `${name} must be a JSON Pointer.` })
  }
}

function validateEntityId(
  value: unknown,
  path: string,
  issues: ResultArtifactValidationIssue[],
): asserts value is EntityId | undefined {
  if (value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
    issues.push({ path, message: 'entityId must be a string or number when present.' })
  }
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  name: string,
  issues: ResultArtifactValidationIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, message: `${name} must be a non-empty string.` })
  }
}

function validateOptionalString(
  value: unknown,
  path: string,
  name: string,
  issues: ResultArtifactValidationIssue[],
): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push({ path, message: `${name} must be a string when present.` })
  }
}

function validateNonNegativeInteger(
  value: unknown,
  path: string,
  name: string,
  issues: ResultArtifactValidationIssue[],
): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    issues.push({ path, message: `${name} must be a non-negative integer.` })
  }
}

function normalizeValidationIssue(issue: ValidationIssue): ValidationIssue {
  return {
    ...(issue.path !== undefined ? { path: issue.path } : {}),
    message: issue.message,
    severity: issue.severity,
  }
}

function validateJsonCompatible(
  value: unknown,
  path: string,
  issues: ResultArtifactValidationIssue[],
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

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function escapeJsonPointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

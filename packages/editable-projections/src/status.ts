import {
  InvalidWorkspaceStatusArtifactError,
  type WorkspaceStatusValidationIssue,
} from './errors.js'
import { normalizePath, pathHasParentSegment, pathIsAbsolute } from './paths.js'
import type {
  EntityId,
  ProjectionFileKind,
  WorkspaceFileState,
  WorkspaceStatus,
  WorkspaceStatusFile,
} from './types.js'

const workspaceFileStates = new Set<WorkspaceFileState>([
  'clean',
  'modified',
  'remote_modified',
  'both_modified',
  'deleted',
  'remote_deleted',
  'added',
  'readonly_modified',
  'untracked',
  'missing_adapter',
])

const projectionKinds = new Set<ProjectionFileKind>([
  'writable_projection',
  'generated_index',
  'materialized_view',
])

export function serializeWorkspaceStatusJson(status: WorkspaceStatus): string {
  return `${JSON.stringify(validateWorkspaceStatus(status), null, 2)}\n`
}

export function parseWorkspaceStatusJson(content: string): WorkspaceStatus {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidWorkspaceStatusArtifactError([{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateWorkspaceStatus(value)
}

export function validateWorkspaceStatus(value: unknown): WorkspaceStatus {
  const issues: WorkspaceStatusValidationIssue[] = []

  if (!isRecord(value)) {
    throw new InvalidWorkspaceStatusArtifactError([{
      path: '/',
      message: 'Workspace status must be a JSON object.',
    }])
  }

  validateStatusPath(value.rootPath, '/rootPath', 'rootPath', issues, { allowDot: true })

  if (!Array.isArray(value.files)) {
    issues.push({ path: '/files', message: 'files must be an array.' })
  } else {
    value.files.forEach((file, index) => validateStatusFile(file, `/files/${index}`, issues))
    validateUniqueFilePaths(value.files, issues)
  }

  if (issues.length > 0) {
    throw new InvalidWorkspaceStatusArtifactError(issues)
  }

  return normalizeWorkspaceStatusArtifact(value as unknown as WorkspaceStatus)
}

function normalizeWorkspaceStatusArtifact(status: WorkspaceStatus): WorkspaceStatus {
  const files = [...status.files]
    .map((file) => normalizeWorkspaceStatusFile(file))
    .sort((left, right) => left.path.localeCompare(right.path))

  return {
    rootPath: status.rootPath,
    files,
  }
}

function normalizeWorkspaceStatusFile(file: WorkspaceStatusFile): WorkspaceStatusFile {
  const artifactFile: WorkspaceStatusFile = {
    path: file.path,
    state: file.state,
  }

  if (file.kind !== undefined) artifactFile.kind = file.kind
  if (file.schema !== undefined) artifactFile.schema = file.schema
  if (file.entityType !== undefined) artifactFile.entityType = file.entityType
  if (file.entityId !== undefined) artifactFile.entityId = file.entityId
  if (file.localHash !== undefined) artifactFile.localHash = file.localHash
  if (file.baseHash !== undefined) artifactFile.baseHash = file.baseHash
  if (file.backendHash !== undefined) artifactFile.backendHash = file.backendHash
  if (file.baseBackendHash !== undefined) artifactFile.baseBackendHash = file.baseBackendHash

  return artifactFile
}

function validateStatusFile(
  value: unknown,
  path: string,
  issues: WorkspaceStatusValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'Workspace status file must be an object.' })
    return
  }

  validateStatusPath(value.path, `${path}/path`, 'path', issues)
  if (!workspaceFileStates.has(value.state as WorkspaceFileState)) {
    issues.push({
      path: `${path}/state`,
      message: 'state must be clean, modified, remote_modified, both_modified, deleted, remote_deleted, added, readonly_modified, untracked, or missing_adapter.',
    })
  }
  if (value.kind !== undefined && !projectionKinds.has(value.kind as ProjectionFileKind)) {
    issues.push({ path: `${path}/kind`, message: 'kind must be writable_projection, generated_index, or materialized_view.' })
  }
  validateOptionalString(value.schema, `${path}/schema`, 'schema', issues)
  validateOptionalString(value.entityType, `${path}/entityType`, 'entityType', issues)
  validateEntityId(value.entityId, `${path}/entityId`, issues)
  validateOptionalString(value.localHash, `${path}/localHash`, 'localHash', issues)
  validateOptionalString(value.baseHash, `${path}/baseHash`, 'baseHash', issues)
  validateOptionalString(value.backendHash, `${path}/backendHash`, 'backendHash', issues)
  validateOptionalString(value.baseBackendHash, `${path}/baseBackendHash`, 'baseBackendHash', issues)
}

function validateStatusPath(
  value: unknown,
  path: string,
  name: string,
  issues: WorkspaceStatusValidationIssue[],
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

function validateUniqueFilePaths(
  files: unknown[],
  issues: WorkspaceStatusValidationIssue[],
): void {
  const paths = new Set<string>()

  files.forEach((file, index) => {
    if (!isRecord(file) || typeof file.path !== 'string') return
    if (paths.has(file.path)) {
      issues.push({
        path: `/files/${index}/path`,
        message: 'path must be unique within a workspace status artifact.',
      })
      return
    }
    paths.add(file.path)
  })
}

function validateEntityId(
  value: unknown,
  path: string,
  issues: WorkspaceStatusValidationIssue[],
): asserts value is EntityId | undefined {
  if (value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
    issues.push({ path, message: 'entityId must be a string or number when present.' })
  }
}

function validateOptionalString(
  value: unknown,
  path: string,
  name: string,
  issues: WorkspaceStatusValidationIssue[],
): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push({ path, message: `${name} must be a string when present.` })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

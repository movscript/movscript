import { InvalidWorkspaceManifestError, type ManifestValidationIssue } from './errors.js'
import { normalizePath, pathHasParentSegment, pathIsAbsolute } from './paths.js'
import type {
  EntityId,
  FileSyncState,
  ProjectionFileKind,
  WorkspaceManifest,
} from './types.js'

const projectionKinds = new Set<ProjectionFileKind>([
  'writable_projection',
  'generated_index',
  'materialized_view',
])

export function parseWorkspaceManifestJson(content: string, manifestPath?: string): WorkspaceManifest {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidWorkspaceManifestError(manifestPath, [{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateWorkspaceManifest(value, manifestPath)
}

export function validateWorkspaceManifest(value: unknown, manifestPath?: string): WorkspaceManifest {
  const issues: ManifestValidationIssue[] = []

  if (!isRecord(value)) {
    throw new InvalidWorkspaceManifestError(manifestPath, [{
      path: '/',
      message: 'Manifest must be a JSON object.',
    }])
  }

  if (value.version !== 1) {
    issues.push({ path: '/version', message: 'Manifest version must be 1.' })
  }
  if (value.backendRevision !== undefined && typeof value.backendRevision !== 'string') {
    issues.push({ path: '/backendRevision', message: 'backendRevision must be a string when present.' })
  }
  if (!isRecord(value.files)) {
    issues.push({ path: '/files', message: 'files must be an object.' })
  } else {
    for (const [filePath, entry] of Object.entries(value.files)) {
      validateManifestFile(filePath, entry, issues)
    }
  }

  if (issues.length > 0) {
    throw new InvalidWorkspaceManifestError(manifestPath, issues)
  }

  return value as unknown as WorkspaceManifest
}

function validateManifestFile(filePath: string, entry: unknown, issues: ManifestValidationIssue[]): void {
  const basePath = `/files/${escapePointer(filePath)}`
  if (filePath.trim().length === 0 || filePath === '.') {
    issues.push({ path: basePath, message: 'Manifest file path must not be empty.' })
  } else if (pathIsAbsolute(filePath)) {
    issues.push({ path: basePath, message: 'Manifest file path must be relative.' })
  } else if (pathHasParentSegment(filePath)) {
    issues.push({ path: basePath, message: 'Manifest file path must not contain parent-directory segments.' })
  } else if (normalizePath(filePath) !== filePath) {
    issues.push({ path: basePath, message: 'Manifest file path must be normalized.' })
  }

  if (!isRecord(entry)) {
    issues.push({ path: basePath, message: 'Manifest file entry must be an object.' })
    return
  }

  requireString(entry.schema, `${basePath}/schema`, 'schema', issues)
  requireString(entry.entityType, `${basePath}/entityType`, 'entityType', issues)
  if (!projectionKinds.has(entry.kind as ProjectionFileKind)) {
    issues.push({ path: `${basePath}/kind`, message: 'kind must be writable_projection, generated_index, or materialized_view.' })
  }
  if (typeof entry.writable !== 'boolean') {
    issues.push({ path: `${basePath}/writable`, message: 'writable must be a boolean.' })
  }
  validateEntityId(entry.entityId, `${basePath}/entityId`, issues)
  validateOptionalString(entry.baseHash, `${basePath}/baseHash`, issues)
  validateOptionalString(entry.baseBackendHash, `${basePath}/baseBackendHash`, issues)
  validateOptionalString(entry.localHash, `${basePath}/localHash`, issues)
  validateOptionalString(entry.backendHash, `${basePath}/backendHash`, issues)
}

function requireString(
  value: unknown,
  path: string,
  name: keyof FileSyncState,
  issues: ManifestValidationIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, message: `${name} must be a non-empty string.` })
  }
}

function validateEntityId(value: unknown, path: string, issues: ManifestValidationIssue[]): asserts value is EntityId | undefined {
  if (value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
    issues.push({ path, message: 'entityId must be a string or number when present.' })
  }
}

function validateOptionalString(value: unknown, path: string, issues: ManifestValidationIssue[]): void {
  if (value !== undefined && typeof value !== 'string') {
    issues.push({ path, message: 'Value must be a string when present.' })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

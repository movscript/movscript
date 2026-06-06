import {
  InvalidWorkspaceUpdateOptionsError,
  InvalidWorkspaceUpdateTargetError,
  type UpdateOptionsValidationIssue,
  type UpdateTargetValidationIssue,
} from './errors.js'
import { normalizePath, pathHasParentSegment, pathIsAbsolute } from './paths.js'
import type {
  EntityId,
  FileSyncState,
  ProjectionAdapter,
  ProjectionFileKind,
  WorkspaceUpdateOptions,
  WorkspaceUpdateTarget,
} from './types.js'

const projectionKinds = new Set<ProjectionFileKind>([
  'writable_projection',
  'generated_index',
  'materialized_view',
])

export function serializeWorkspaceUpdateTargetsJson(targets: WorkspaceUpdateTarget[]): string {
  return `${JSON.stringify(normalizeWorkspaceUpdateTargetsArtifact(targets), null, 2)}\n`
}

export function parseWorkspaceUpdateTargetsJson(content: string): WorkspaceUpdateTarget[] {
  let value: unknown
  try {
    value = JSON.parse(content) as unknown
  } catch (error) {
    throw new InvalidWorkspaceUpdateTargetError([{
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return normalizeWorkspaceUpdateTargetsArtifact(value)
}

export function validateWorkspaceUpdateTargets(value: unknown): WorkspaceUpdateTarget[] {
  const issues: UpdateTargetValidationIssue[] = []

  if (!Array.isArray(value)) {
    throw new InvalidWorkspaceUpdateTargetError([{
      path: '/',
      message: 'Update targets must be an array.',
    }])
  }

  value.forEach((target, index) => validateWorkspaceUpdateTargetAt(target, `/targets/${index}`, issues))
  validateUniqueTargetPaths(value, issues)

  if (issues.length > 0) {
    throw new InvalidWorkspaceUpdateTargetError(issues)
  }
  return value as WorkspaceUpdateTarget[]
}

export function validateWorkspaceUpdateTarget(value: unknown, path = '/target'): WorkspaceUpdateTarget {
  const issues: UpdateTargetValidationIssue[] = []
  validateWorkspaceUpdateTargetAt(value, path, issues)
  if (issues.length > 0) {
    throw new InvalidWorkspaceUpdateTargetError(issues)
  }
  return value as WorkspaceUpdateTarget
}

export function validateWorkspaceUpdateOptions(value: unknown): WorkspaceUpdateOptions {
  const issues: UpdateOptionsValidationIssue[] = []

  if (!isRecord(value)) {
    throw new InvalidWorkspaceUpdateOptionsError([{
      path: '/',
      message: 'Update options must be an object.',
    }])
  }

  if (value.mode !== undefined && value.mode !== 'safe' && value.mode !== 'overwrite' && value.mode !== 'merge') {
    issues.push({ path: '/mode', message: 'mode must be safe, overwrite, or merge when present.' })
  }
  if (value.backendRevision !== undefined && typeof value.backendRevision !== 'string') {
    issues.push({ path: '/backendRevision', message: 'backendRevision must be a string when present.' })
  }

  if (issues.length > 0) {
    throw new InvalidWorkspaceUpdateOptionsError(issues)
  }
  return value as WorkspaceUpdateOptions
}

function normalizeWorkspaceUpdateTargetsArtifact(value: unknown): WorkspaceUpdateTarget[] {
  const targets = validateWorkspaceUpdateTargets(value)
  const issues: UpdateTargetValidationIssue[] = []
  const artifactTargets = targets.map((target, index) =>
    normalizeWorkspaceUpdateTargetArtifact(target, `/targets/${index}`, issues),
  )
  if (issues.length > 0) {
    throw new InvalidWorkspaceUpdateTargetError(issues)
  }
  return artifactTargets
}

function normalizeWorkspaceUpdateTargetArtifact(
  target: WorkspaceUpdateTarget,
  path: string,
  issues: UpdateTargetValidationIssue[],
): WorkspaceUpdateTarget {
  const artifactTarget: WorkspaceUpdateTarget = {
    path: target.path,
    schema: target.schema,
    kind: target.kind,
    entityType: target.entityType,
  }

  if (target.entityId !== undefined) artifactTarget.entityId = target.entityId
  if (target.operation !== undefined) artifactTarget.operation = target.operation
  if (target.writable !== undefined) artifactTarget.writable = target.writable
  if (target.backendHash !== undefined) artifactTarget.backendHash = target.backendHash
  if (Object.hasOwn(target, 'content')) {
    if (target.content === undefined) {
      issues.push({ path: `${path}/content`, message: 'content must be JSON-compatible when present.' })
    } else {
      validateJsonCompatible(target.content, `${path}/content`, issues)
      artifactTarget.content = target.content
    }
  }

  return artifactTarget
}

export interface WritableProjectionUpdateTargetOptions<TFile, TEntity> {
  adapter: ProjectionAdapter<TFile, TEntity>
  entity: TEntity
  path: string
  entityId?: EntityId
  backendHash?: string
  writable?: boolean
}

export function createWritableProjectionUpdateTarget<TFile, TEntity>(
  options: WritableProjectionUpdateTargetOptions<TFile, TEntity>,
): WorkspaceUpdateTarget {
  const target = validateWorkspaceUpdateTarget(writableProjectionTargetShape({
    adapter: options.adapter,
    path: options.path,
    entityId: options.entityId,
    backendHash: options.backendHash,
    writable: options.writable,
  }))
  return materializeWritableProjectionTarget(options.adapter, target, options.entity)
}

export interface WritableProjectionUpdateTargetsOptions<TFile, TEntity> {
  adapter: ProjectionAdapter<TFile, TEntity>
  entities: readonly TEntity[]
  pathFor(entity: TEntity, index: number): string
  entityIdFor?(entity: TEntity, index: number): EntityId | undefined
  backendHashFor?(entity: TEntity, index: number): string | undefined
  writable?: boolean
}

export function createWritableProjectionUpdateTargets<TFile, TEntity>(
  options: WritableProjectionUpdateTargetsOptions<TFile, TEntity>,
): WorkspaceUpdateTarget[] {
  const targets = validateWorkspaceUpdateTargets(options.entities.map((entity, index) => writableProjectionTargetShape({
    adapter: options.adapter,
    path: options.pathFor(entity, index),
    entityId: options.entityIdFor?.(entity, index),
    backendHash: options.backendHashFor?.(entity, index),
    writable: options.writable,
  })))

  return targets.map((target, index) => {
    const entity = options.entities[index] as TEntity
    return materializeWritableProjectionTarget(options.adapter, target, entity)
  })
}

export interface WritableProjectionDeleteTargetOptions<TFile, TEntity = unknown> {
  adapter: ProjectionAdapter<TFile, TEntity>
  path: string
  entityId?: EntityId
  backendHash?: string
  writable?: boolean
}

export function createWritableProjectionDeleteTarget<TFile, TEntity = unknown>(
  options: WritableProjectionDeleteTargetOptions<TFile, TEntity>,
): WorkspaceUpdateTarget {
  return validateWorkspaceUpdateTarget({
    path: options.path,
    schema: options.adapter.schema,
    kind: 'writable_projection',
    writable: options.writable ?? true,
    entityType: options.adapter.entityType,
    entityId: options.entityId,
    backendHash: options.backendHash,
    operation: 'delete',
  })
}

export interface ReadonlyProjectionUpdateTargetOptions {
  path: string
  schema: string
  entityType: string
  entityId?: EntityId
  content: string | unknown
  backendHash?: string
}

export function createGeneratedIndexUpdateTarget(
  options: ReadonlyProjectionUpdateTargetOptions,
): WorkspaceUpdateTarget {
  return createReadonlyProjectionUpdateTarget('generated_index', options)
}

export function createMaterializedViewUpdateTarget(
  options: ReadonlyProjectionUpdateTargetOptions,
): WorkspaceUpdateTarget {
  return createReadonlyProjectionUpdateTarget('materialized_view', options)
}

function validateWorkspaceUpdateTargetAt(
  value: unknown,
  path: string,
  issues: UpdateTargetValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'Update target must be an object.' })
    return
  }

  validateTargetPath(value.path, `${path}/path`, issues)
  validateNonEmptyString(value.schema, `${path}/schema`, 'schema', issues)
  validateNonEmptyString(value.entityType, `${path}/entityType`, 'entityType', issues)
  validateEntityId(value.entityId, `${path}/entityId`, issues)
  if (!projectionKinds.has(value.kind as ProjectionFileKind)) {
    issues.push({ path: `${path}/kind`, message: 'kind must be writable_projection, generated_index, or materialized_view.' })
  }
  if (value.operation !== undefined && value.operation !== 'upsert' && value.operation !== 'delete') {
    issues.push({ path: `${path}/operation`, message: 'operation must be upsert or delete when present.' })
  }
  if (value.operation === 'delete' && Object.hasOwn(value, 'content')) {
    issues.push({ path: `${path}/content`, message: 'delete update targets must not include content.' })
  }
  if (value.writable !== undefined && typeof value.writable !== 'boolean') {
    issues.push({ path: `${path}/writable`, message: 'writable must be a boolean when present.' })
  }
  if ((value.kind === 'generated_index' || value.kind === 'materialized_view') && value.writable === true) {
    issues.push({ path: `${path}/writable`, message: 'generated indexes and materialized views must not be writable.' })
  }
  if (
    (value.kind === 'generated_index' || value.kind === 'materialized_view')
    && value.operation !== 'delete'
    && !Object.hasOwn(value, 'content')
  ) {
    issues.push({ path: `${path}/content`, message: 'generated indexes and materialized views require content unless they are delete targets.' })
  }
  if (value.backendHash !== undefined && typeof value.backendHash !== 'string') {
    issues.push({ path: `${path}/backendHash`, message: 'backendHash must be a string when present.' })
  }
}

function validateTargetPath(value: unknown, path: string, issues: UpdateTargetValidationIssue[]): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, message: 'path must be a non-empty string.' })
    return
  }
  if (normalizePath(value) !== value || value === '.') {
    issues.push({ path, message: 'path must be normalized.' })
  }
  if (pathIsAbsolute(value)) {
    issues.push({ path, message: 'path must be relative.' })
  }
  if (pathHasParentSegment(value)) {
    issues.push({ path, message: 'path must not contain parent-directory segments.' })
  }
}

function validateUniqueTargetPaths(value: unknown[], issues: UpdateTargetValidationIssue[]): void {
  const paths = new Set<string>()

  value.forEach((target, index) => {
    if (!isRecord(target) || typeof target.path !== 'string') return
    if (paths.has(target.path)) {
      issues.push({
        path: `/targets/${index}/path`,
        message: 'path must be unique within an update target batch.',
      })
      return
    }
    paths.add(target.path)
  })
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  name: string,
  issues: UpdateTargetValidationIssue[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ path, message: `${name} must be a non-empty string.` })
  }
}

function validateEntityId(value: unknown, path: string, issues: UpdateTargetValidationIssue[]): asserts value is EntityId | undefined {
  if (value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
    issues.push({ path, message: 'entityId must be a string or number when present.' })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateJsonCompatible(
  value: unknown,
  path: string,
  issues: UpdateTargetValidationIssue[],
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
      issues.push({ path, message: 'content must be JSON-compatible when present.' })
    }
    return
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      issues.push({ path, message: 'content must be JSON-compatible when present.' })
      return
    }
    seen.add(value)
    value.forEach((item, index) => validateJsonCompatible(item, `${path}/${index}`, issues, seen))
    seen.delete(value)
    return
  }

  if (isJsonObject(value)) {
    if (seen.has(value)) {
      issues.push({ path, message: 'content must be JSON-compatible when present.' })
      return
    }
    seen.add(value)
    for (const [key, item] of Object.entries(value)) {
      validateJsonCompatible(item, `${path}/${escapeJsonPointerToken(key)}`, issues, seen)
    }
    seen.delete(value)
    return
  }

  issues.push({ path, message: 'content must be JSON-compatible when present.' })
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function escapeJsonPointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function createReadonlyProjectionUpdateTarget(
  kind: 'generated_index' | 'materialized_view',
  options: ReadonlyProjectionUpdateTargetOptions,
): WorkspaceUpdateTarget {
  return validateWorkspaceUpdateTarget({
    path: options.path,
    schema: options.schema,
    kind,
    writable: false,
    entityType: options.entityType,
    ...(options.entityId !== undefined ? { entityId: options.entityId } : {}),
    ...(options.backendHash !== undefined ? { backendHash: options.backendHash } : {}),
    content: options.content,
  })
}

function writableProjectionTargetShape<TFile, TEntity>(
  options: Omit<WritableProjectionDeleteTargetOptions<TFile, TEntity>, 'path'> & { path: string },
): WorkspaceUpdateTarget {
  return {
    path: options.path,
    schema: options.adapter.schema,
    kind: 'writable_projection',
    writable: options.writable ?? true,
    entityType: options.adapter.entityType,
    entityId: options.entityId,
    backendHash: options.backendHash,
  }
}

function materializeWritableProjectionTarget<TFile, TEntity>(
  adapter: ProjectionAdapter<TFile, TEntity>,
  target: WorkspaceUpdateTarget,
  entity: TEntity,
): WorkspaceUpdateTarget {
  const entry = updateTargetManifestEntry(target)
  return {
    ...target,
    content: adapter.toProjection(entity, {
      filePath: target.path,
      manifestEntry: entry,
    }),
  }
}

function updateTargetManifestEntry(target: WorkspaceUpdateTarget): FileSyncState {
  return {
    schema: target.schema,
    kind: target.kind,
    writable: target.writable ?? target.kind === 'writable_projection',
    entityType: target.entityType,
    entityId: target.entityId,
    backendHash: target.backendHash,
  }
}

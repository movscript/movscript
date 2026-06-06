import {
  InvalidProjectionAdapterContractError,
  InvalidProjectionCommandResultError,
  type AdapterContractIssue,
} from './errors.js'
import { validateProjectionCommandResult } from './adapter.js'
import type {
  EntityId,
  FileSyncState,
  ProjectionAdapter,
  ProjectionCommandInput,
  ValidationIssue,
  ValidationResult,
} from './types.js'

export interface ProjectionAdapterContractOptions<TFile, TEntity, TCommand = unknown> {
  adapter: ProjectionAdapter<TFile, TEntity, TCommand>
  entity: TEntity
  validFile: string
  invalidFile?: string
  filePath?: string
  entityId?: EntityId
  commandInput?: Partial<ProjectionCommandInput<TFile>>
}

export interface ProjectionAdapterContractReport {
  adapterSchema: string
  ok: boolean
  issues: AdapterContractIssue[]
}

export function verifyProjectionAdapterContract<TFile, TEntity, TCommand = unknown>(
  options: ProjectionAdapterContractOptions<TFile, TEntity, TCommand>,
): ProjectionAdapterContractReport {
  const initialIssues = validateProjectionAdapterContractOptions(options)
  const adapterSchema = contractAdapterSchema(options)
  if (initialIssues.length > 0) {
    return {
      adapterSchema,
      ok: false,
      issues: initialIssues,
    }
  }

  const filePath = options.filePath ?? `${options.adapter.entityType || 'projection'}.json`
  const issues: AdapterContractIssue[] = []

  if (typeof options.adapter.schema !== 'string' || options.adapter.schema.length === 0) {
    issues.push({ path: '/adapter/schema', message: 'adapter.schema must be a non-empty string.' })
  }
  if (typeof options.adapter.entityType !== 'string' || options.adapter.entityType.length === 0) {
    issues.push({ path: '/adapter/entityType', message: 'adapter.entityType must be a non-empty string.' })
  }

  const entry = contractManifestEntry(options.adapter, options.entityId)
  const parseContext = { filePath, manifestEntry: entry }
  const adapterContext = { filePath, manifestEntry: entry }
  const validProjection = parseValidFile(options.adapter, options.validFile, parseContext, issues)

  if (validProjection !== undefined) {
    expectValidationOk('/validFile/validate', options.adapter.validateFile(validProjection, parseContext), issues)
    verifySerialization('/validFile/serialize', options.adapter, validProjection, parseContext, issues)
    verifyCommands(options, filePath, entry, validProjection, issues)
  }

  verifyEntityMaterialization(options.adapter, options.entity, adapterContext, parseContext, issues)
  if (options.invalidFile !== undefined) {
    verifyInvalidFile(options.adapter, options.invalidFile, parseContext, issues)
  }

  return {
    adapterSchema,
    ok: issues.length === 0,
    issues,
  }
}

export function validateProjectionAdapterContractOptions(
  options: ProjectionAdapterContractOptions<unknown, unknown>,
): AdapterContractIssue[] {
  if (!isRecord(options)) {
    return [{ path: '/', message: 'adapter contract options must be an object.' }]
  }

  const issues: AdapterContractIssue[] = []
  if (!isRecord(options.adapter)) {
    issues.push({ path: '/adapter', message: 'adapter must be an object.' })
  } else {
    validateAdapterShape(options.adapter, issues)
  }
  if (typeof options.validFile !== 'string') {
    issues.push({ path: '/validFile', message: 'validFile must be a string.' })
  }
  if (options.invalidFile !== undefined && typeof options.invalidFile !== 'string') {
    issues.push({ path: '/invalidFile', message: 'invalidFile must be a string when present.' })
  }
  if (options.filePath !== undefined && typeof options.filePath !== 'string') {
    issues.push({ path: '/filePath', message: 'filePath must be a string when present.' })
  }
  if (options.entityId !== undefined && typeof options.entityId !== 'string' && typeof options.entityId !== 'number') {
    issues.push({ path: '/entityId', message: 'entityId must be a string or number when present.' })
  }
  if (options.commandInput !== undefined && !isRecord(options.commandInput)) {
    issues.push({ path: '/commandInput', message: 'commandInput must be an object when present.' })
  }

  return issues
}

export function assertProjectionAdapterContract<TFile, TEntity, TCommand = unknown>(
  options: ProjectionAdapterContractOptions<TFile, TEntity, TCommand>,
): ProjectionAdapterContractReport {
  const report = verifyProjectionAdapterContract(options)
  if (!report.ok) {
    throw new InvalidProjectionAdapterContractError(report.adapterSchema, report.issues)
  }
  return report
}

function parseValidFile<TFile>(
  adapter: ProjectionAdapter<TFile>,
  content: string,
  context: Parameters<ProjectionAdapter<TFile>['parseFile']>[1],
  issues: AdapterContractIssue[],
): TFile | undefined {
  try {
    return adapter.parseFile(content, context)
  } catch (error) {
    issues.push({
      path: '/validFile/parse',
      message: `validFile must parse successfully: ${errorMessage(error)}`,
    })
    return undefined
  }
}

function verifySerialization<TFile>(
  path: string,
  adapter: ProjectionAdapter<TFile>,
  value: TFile,
  context: Parameters<ProjectionAdapter<TFile>['parseFile']>[1],
  issues: AdapterContractIssue[],
): void {
  if (!adapter.serializeFile) return
  let serialized: string
  try {
    serialized = adapter.serializeFile(value)
  } catch (error) {
    issues.push({
      path,
      message: `serializeFile must not throw: ${errorMessage(error)}`,
    })
    return
  }
  if (typeof serialized !== 'string') {
    issues.push({ path, message: 'serializeFile must return a string.' })
    return
  }
  try {
    const roundTripped = adapter.parseFile(serialized, context)
    expectValidationOk(path, adapter.validateFile(roundTripped, context), issues)
  } catch (error) {
    issues.push({
      path,
      message: `serialized output must parse and validate: ${errorMessage(error)}`,
    })
  }
}

function verifyEntityMaterialization<TFile, TEntity>(
  adapter: ProjectionAdapter<TFile, TEntity>,
  entity: TEntity,
  adapterContext: Parameters<ProjectionAdapter<TFile, TEntity>['toProjection']>[1],
  parseContext: Parameters<ProjectionAdapter<TFile, TEntity>['parseFile']>[1],
  issues: AdapterContractIssue[],
): void {
  let projection: TFile
  try {
    projection = adapter.toProjection(entity, adapterContext)
  } catch (error) {
    issues.push({
      path: '/entity/toProjection',
      message: `toProjection must not throw for the sample entity: ${errorMessage(error)}`,
    })
    return
  }

  expectValidationOk('/entity/validate', adapter.validateFile(projection, parseContext), issues)
  verifySerialization('/entity/serialize', adapter, projection, parseContext, issues)
}

function verifyCommands<TFile, TEntity, TCommand>(
  options: ProjectionAdapterContractOptions<TFile, TEntity, TCommand>,
  filePath: string,
  entry: FileSyncState,
  validProjection: TFile,
  issues: AdapterContractIssue[],
): void {
  const input: ProjectionCommandInput<TFile> = {
    action: options.commandInput?.action ?? 'update',
    filePath: options.commandInput?.filePath ?? filePath,
    entity: options.commandInput?.entity ?? entry,
    base: options.commandInput?.base,
    local: options.commandInput?.local ?? validProjection,
    remote: options.commandInput?.remote,
    target: options.commandInput?.target ?? validProjection,
    patch: options.commandInput?.patch ?? [],
  }

  try {
    const result = options.adapter.createCommands(input)
    validateProjectionCommandResult(options.adapter.schema, input.filePath, result)
  } catch (error) {
    if (error instanceof InvalidProjectionCommandResultError) {
      for (const issue of error.issues) {
        issues.push({
          path: commandContractIssuePath(issue.path),
          message: issue.message,
        })
      }
      return
    }
    issues.push({
      path: '/commands',
      message: `createCommands must return a valid command result: ${errorMessage(error)}`,
    })
  }
}

function commandContractIssuePath(path: string): string {
  if (path === '/' || path === '/commands') return '/commands'
  if (path.startsWith('/commands/')) return path
  return `/commands${path}`
}

function validateAdapterShape(value: Record<string, unknown>, issues: AdapterContractIssue[]): void {
  if (typeof value.schema !== 'string' || value.schema.length === 0) {
    issues.push({ path: '/adapter/schema', message: 'adapter.schema must be a non-empty string.' })
  }
  if (typeof value.entityType !== 'string' || value.entityType.length === 0) {
    issues.push({ path: '/adapter/entityType', message: 'adapter.entityType must be a non-empty string.' })
  }
  if (typeof value.parseFile !== 'function') {
    issues.push({ path: '/adapter/parseFile', message: 'adapter.parseFile must be a function.' })
  }
  if (value.serializeFile !== undefined && typeof value.serializeFile !== 'function') {
    issues.push({ path: '/adapter/serializeFile', message: 'adapter.serializeFile must be a function when present.' })
  }
  if (typeof value.validateFile !== 'function') {
    issues.push({ path: '/adapter/validateFile', message: 'adapter.validateFile must be a function.' })
  }
  if (typeof value.toProjection !== 'function') {
    issues.push({ path: '/adapter/toProjection', message: 'adapter.toProjection must be a function.' })
  }
  if (typeof value.createCommands !== 'function') {
    issues.push({ path: '/adapter/createCommands', message: 'adapter.createCommands must be a function.' })
  }
}

function contractAdapterSchema(options: unknown): string {
  if (!isRecord(options) || !isRecord(options.adapter) || typeof options.adapter.schema !== 'string' || options.adapter.schema.length === 0) {
    return '<unknown>'
  }
  return options.adapter.schema
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function verifyInvalidFile<TFile>(
  adapter: ProjectionAdapter<TFile>,
  content: string,
  context: Parameters<ProjectionAdapter<TFile>['parseFile']>[1],
  issues: AdapterContractIssue[],
): void {
  try {
    const parsed = adapter.parseFile(content, context)
    const validation = adapter.validateFile(parsed, context)
    if (validation.ok || validation.issues.every((issue) => issue.severity !== 'error')) {
      issues.push({
        path: '/invalidFile',
        message: 'invalidFile must be rejected by parseFile or validateFile.',
      })
    }
  } catch {
    // Rejecting invalid samples in parseFile is acceptable.
  }
}

function expectValidationOk(
  path: string,
  validation: ValidationResult,
  issues: AdapterContractIssue[],
): void {
  if (validation.ok && validation.issues.every((issue) => issue.severity !== 'error')) return
  issues.push({
    path,
    message: `projection must validate successfully${formatValidationIssues(validation.issues)}`,
  })
}

function contractManifestEntry(adapter: ProjectionAdapter, entityId: EntityId | undefined): FileSyncState {
  return {
    schema: adapter.schema,
    kind: 'writable_projection',
    writable: true,
    entityType: adapter.entityType,
    entityId,
  }
}

function formatValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return '.'
  return `: ${issues.map((issue) => issue.message).join('; ')}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

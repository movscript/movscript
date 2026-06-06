import {
  InvalidJsonProjectionError,
  InvalidProjectionCommandResultError,
  type CommandResultValidationIssue,
} from './errors.js'
import type {
  JsonValue,
  JsonObject,
  ProjectionAdapter,
  ProjectionAdapterContext,
  ProjectionCommandInput,
  ProjectionCommandResult,
  ProjectionParseContext,
  ValidationIssue,
  ValidationResult,
} from './types.js'

export function defineProjectionAdapter<TFile, TEntity = unknown, TCommand = unknown>(
  adapter: ProjectionAdapter<TFile, TEntity, TCommand>,
): ProjectionAdapter<TFile, TEntity, TCommand> {
  return adapter
}

export interface JsonProjectionAdapterOptions<TFile extends JsonObject, TEntity = TFile, TCommand = unknown> {
  schema: string
  entityType: string
  toProjection?: (entity: TEntity, context: ProjectionAdapterContext) => TFile
  validate?: (value: TFile, context: ProjectionParseContext) => ValidationResult | ValidationIssue[]
  createCommands: (input: ProjectionCommandInput<TFile>) => ProjectionCommandResult<TCommand> | TCommand[]
  serialize?: (value: TFile) => string
}

export function createJsonProjectionAdapter<TFile extends JsonObject, TEntity = TFile, TCommand = unknown>(
  options: JsonProjectionAdapterOptions<TFile, TEntity, TCommand>,
): ProjectionAdapter<TFile, TEntity, TCommand> {
  return defineProjectionAdapter<TFile, TEntity, TCommand>({
    schema: options.schema,
    entityType: options.entityType,
    parseFile(content, context) {
      return parseJsonProjection(content, context.filePath) as TFile
    },
    serializeFile(value) {
      return options.serialize ? options.serialize(value) : `${JSON.stringify(value, null, 2)}\n`
    },
    validateFile(value, context) {
      const issues: ValidationIssue[] = []
      if (!isJsonObject(value)) {
        issues.push({
          severity: 'error',
          path: '/',
          message: 'JSON projection must be an object.',
        })
      } else if (value.schema !== options.schema) {
        issues.push({
          severity: 'error',
          path: '/schema',
          message: `JSON projection schema must be ${options.schema}.`,
        })
      }

      if (options.validate && issues.every((issue) => issue.severity !== 'error')) {
        const result = options.validate(value, context)
        issues.push(...(Array.isArray(result) ? result : result.issues))
      }

      return { ok: issues.every((issue) => issue.severity !== 'error'), issues }
    },
    toProjection(entity, context) {
      return options.toProjection ? options.toProjection(entity, context) : (entity as unknown as TFile)
    },
    createCommands(input) {
      const result = options.createCommands(input)
      return validateProjectionCommandResult(
        options.schema,
        input.filePath,
        Array.isArray(result) ? { commands: result } : result,
      )
    },
  })
}

export function parseJsonProjection(content: string, projectionPath?: string): JsonValue {
  try {
    return JSON.parse(content) as JsonValue
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidJsonProjectionError(projectionPath, error.message)
    }
    throw error
  }
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateProjectionCommandResult<TCommand = unknown>(
  adapterSchema: string,
  filePath: string | undefined,
  value: unknown,
): ProjectionCommandResult<TCommand> {
  const issues: CommandResultValidationIssue[] = []
  if (!isRecord(value)) {
    issues.push({ path: '/', message: 'Command result must be an object.' })
  } else {
    if (!Array.isArray(value.commands)) {
      issues.push({ path: '/commands', message: 'commands must be an array.' })
    }
    if (value.warnings !== undefined) {
      validateWarnings(value.warnings, issues)
    }
  }

  if (issues.length > 0) {
    throw new InvalidProjectionCommandResultError(adapterSchema, filePath, issues)
  }
  return value as ProjectionCommandResult<TCommand>
}

function validateWarnings(value: unknown, issues: CommandResultValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path: '/warnings', message: 'warnings must be an array when present.' })
    return
  }
  value.forEach((warning, index) => {
    const basePath = `/warnings/${index}`
    if (!isRecord(warning)) {
      issues.push({ path: basePath, message: 'warning must be an object.' })
      return
    }
    if (warning.path !== undefined && typeof warning.path !== 'string') {
      issues.push({ path: `${basePath}/path`, message: 'path must be a string when present.' })
    }
    if (typeof warning.message !== 'string' || warning.message.length === 0) {
      issues.push({ path: `${basePath}/message`, message: 'message must be a non-empty string.' })
    }
    if (warning.severity !== 'error' && warning.severity !== 'warning') {
      issues.push({ path: `${basePath}/severity`, message: 'severity must be error or warning.' })
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

import type {
  ApplyPlanOperation,
  ApplyResult,
  ApplyReview,
  JsonPatchOperation,
  WorkspaceStatus,
  WorkspaceStatusFile,
  WorkspaceUpdateOperation,
  WorkspaceUpdateResult,
} from './types.js'
import { InvalidFormatOptionsError, type FormatOptionsValidationIssue } from './errors.js'

export interface FormatOptions {
  includeNoop?: boolean
  includeCommands?: boolean
  maxPatchOperations?: number
}

export function formatWorkspaceStatusMarkdown(status: WorkspaceStatus, options: FormatOptions = {}): string {
  const formatOptions = validateFormatOptions(options)
  const rows = status.files
    .filter((file) => formatOptions.includeNoop || file.state !== 'clean')
    .map(formatStatusFile)

  return [
    `# Workspace Status: ${status.rootPath}`,
    '',
    rows.length > 0 ? rows.join('\n') : 'No local or remote changes.',
    '',
  ].join('\n')
}

export function formatApplyReviewMarkdown(review: ApplyReview, options: FormatOptions = {}): string {
  const formatOptions = validateFormatOptions(options)
  const operations = review.operations.filter((operation) => formatOptions.includeNoop || operation.state !== 'noop')
  return [
    `# Apply Review: ${review.rootPath}`,
    '',
    `Summary: create ${review.summary.create}, update ${review.summary.update}, delete ${review.summary.delete}, blocked ${review.summary.blocked}, conflicts ${review.summary.conflicts}.`,
    '',
    operations.length > 0
      ? operations.map((operation) => formatApplyOperation(operation, formatOptions)).join('\n')
      : 'No changes to apply.',
    '',
  ].join('\n')
}

export function formatWorkspaceUpdateMarkdown(result: WorkspaceUpdateResult, options: FormatOptions = {}): string {
  const formatOptions = validateFormatOptions(options)
  const operations = result.operations.filter((operation) => formatOptions.includeNoop || operation.state !== 'noop')
  return [
    '# Workspace Update',
    '',
    ...(result.backendRevision ? [`Backend revision: ${result.backendRevision}.`, ''] : []),
    `Summary: updated ${result.summary.updated}, deleted ${result.summary.deleted}, noop ${result.summary.noop}, blocked ${result.summary.blocked}, conflicts ${result.summary.conflicts}.`,
    '',
    operations.length > 0
      ? operations.map(formatUpdateOperation).join('\n')
      : 'No files updated.',
    '',
  ].join('\n')
}

export function formatApplyResultMarkdown(result: ApplyResult, options: FormatOptions = {}): string {
  const formatOptions = validateFormatOptions(options)
  const lines = [
    '# Apply Result',
    '',
    `Applied operations: ${result.appliedOperations}.`,
    `Applied commands: ${result.appliedCommands}.`,
    '',
  ]

  if (result.refresh) {
    lines.push(formatWorkspaceUpdateMarkdown(result.refresh, formatOptions).trimEnd(), '')
  } else {
    lines.push('No canonical refresh targets returned.', '')
  }

  return lines.join('\n')
}

export function validateFormatOptions(value: unknown): FormatOptions {
  const issues: FormatOptionsValidationIssue[] = []

  if (!isRecord(value)) {
    throw new InvalidFormatOptionsError([{
      path: '/',
      message: 'Format options must be an object.',
    }])
  }

  if (value.includeNoop !== undefined && typeof value.includeNoop !== 'boolean') {
    issues.push({ path: '/includeNoop', message: 'includeNoop must be a boolean when present.' })
  }
  if (value.includeCommands !== undefined && typeof value.includeCommands !== 'boolean') {
    issues.push({ path: '/includeCommands', message: 'includeCommands must be a boolean when present.' })
  }
  if (value.maxPatchOperations !== undefined && !isNonNegativeInteger(value.maxPatchOperations)) {
    issues.push({ path: '/maxPatchOperations', message: 'maxPatchOperations must be a non-negative integer when present.' })
  }

  if (issues.length > 0) {
    throw new InvalidFormatOptionsError(issues)
  }
  return value as FormatOptions
}

function formatStatusFile(file: WorkspaceStatusFile): string {
  const entity = file.entityType ? ` ${file.entityType}${file.entityId === undefined ? '' : `:${String(file.entityId)}`}` : ''
  return `- ${file.state}: ${file.path}${entity}`
}

function formatApplyOperation(operation: ApplyPlanOperation, options: FormatOptions): string {
  const heading = `- ${operation.state}${operation.action ? ` ${operation.action}` : ''}: ${operation.filePath}${formatEntity(operation.entityType, operation.entityId)}`
  const details: string[] = []

  for (const issue of operation.issues) {
    details.push(`  - ${issue.severity}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`)
  }
  for (const conflict of operation.conflicts ?? []) {
    details.push(`  - conflict: ${conflict.path || '/'}: ${conflict.message}`)
  }
  for (const patch of limitedPatch(operation.patch ?? [], options.maxPatchOperations)) {
    details.push(`  - patch: ${formatPatchOperation(patch)}`)
  }
  if (options.includeCommands) {
    details.push(`  - commands: ${operation.commands.length}`)
  }

  return [heading, ...details].join('\n')
}

function formatUpdateOperation(operation: WorkspaceUpdateOperation): string {
  const heading = `- ${operation.state}: ${operation.path}${formatEntity(operation.entityType, operation.entityId)} (${operation.mode})`
  const details: string[] = []
  for (const issue of operation.issues) {
    details.push(`  - ${issue.severity}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`)
  }
  for (const conflict of operation.conflicts ?? []) {
    details.push(`  - conflict: ${conflict.path || '/'}: ${conflict.message}`)
  }
  return [heading, ...details].join('\n')
}

function formatEntity(entityType: string | undefined, entityId: unknown): string {
  if (!entityType) return ''
  return ` ${entityType}${entityId === undefined ? '' : `:${String(entityId)}`}`
}

function limitedPatch(operations: JsonPatchOperation[], maxPatchOperations = 20): JsonPatchOperation[] {
  return operations.slice(0, Math.max(0, maxPatchOperations))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function formatPatchOperation(operation: JsonPatchOperation): string {
  if (operation.op === 'remove') {
    return `remove ${operation.path}`
  }
  return `${operation.op} ${operation.path} = ${JSON.stringify(operation.value)}`
}

import {
  validateProjectionAdapterContractOptions,
  verifyProjectionAdapterContract,
  type ProjectionAdapterContractOptions,
  type ProjectionAdapterContractReport,
} from './adapterContract.js'
import {
  InvalidEditableProjectionIntegrationContractError,
  type IntegrationContractIssue,
} from './errors.js'
import {
  validateWorkflowContractOptions,
  verifyEditableProjectionWorkflowContract,
  type EditableProjectionWorkflowContractOptions,
  type EditableProjectionWorkflowContractReport,
} from './workflowContract.js'

export interface EditableProjectionIntegrationContractOptions<TFile, TEntity, TCommand = unknown> {
  adapter: ProjectionAdapterContractOptions<TFile, TEntity, TCommand>
  workflow: EditableProjectionWorkflowContractOptions<TCommand>
}

export interface EditableProjectionIntegrationContractReport<TCommand = unknown> {
  ok: boolean
  issues: IntegrationContractIssue[]
  adapter?: ProjectionAdapterContractReport
  workflow?: EditableProjectionWorkflowContractReport<TCommand>
}

export interface EditableProjectionIntegrationContractGateResult<TCommand = unknown> {
  ok: boolean
  report: EditableProjectionIntegrationContractReport<TCommand>
  markdown: string
  json: string
}

export function serializeEditableProjectionIntegrationContractReportJson(
  report: EditableProjectionIntegrationContractReport,
): string {
  return `${JSON.stringify(validateEditableProjectionIntegrationContractReport(report), null, 2)}\n`
}

export function parseEditableProjectionIntegrationContractReportJson<TCommand = unknown>(
  content: string,
): EditableProjectionIntegrationContractReport<TCommand> {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new InvalidEditableProjectionIntegrationContractError([{
      phase: 'workflow',
      path: '/',
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }])
  }
  return validateEditableProjectionIntegrationContractReport<TCommand>(value)
}

export function validateEditableProjectionIntegrationContractReport<TCommand = unknown>(
  value: unknown,
): EditableProjectionIntegrationContractReport<TCommand> {
  const issues: IntegrationContractIssue[] = []
  if (!isRecord(value)) {
    throw new InvalidEditableProjectionIntegrationContractError([{
      phase: 'workflow',
      path: '/',
      message: 'integration contract report must be an object.',
    }])
  }
  if (typeof value.ok !== 'boolean') {
    issues.push({ phase: 'workflow', path: '/ok', message: 'ok must be a boolean.' })
  }
  validateIntegrationIssues(value.issues, '/issues', issues)
  validateOptionalReportSection(value.adapter, '/adapter', issues)
  validateOptionalReportSection(value.workflow, '/workflow', issues)
  validateJsonCompatible(value, '/', issues)
  if (issues.length > 0) {
    throw new InvalidEditableProjectionIntegrationContractError(issues)
  }
  return value as unknown as EditableProjectionIntegrationContractReport<TCommand>
}

export function formatEditableProjectionIntegrationContractMarkdown(
  report: EditableProjectionIntegrationContractReport,
): string {
  const lines = [
    '# Editable Projection Integration Contract',
    '',
    `Status: ${report.ok ? 'ok' : 'failed'}.`,
    `Issues: ${report.issues.length}.`,
    '',
  ]

  if (report.adapter || report.workflow) {
    lines.push(
      `Adapter: ${phaseStatus(report.adapter?.ok)}.`,
      `Workflow: ${phaseStatus(report.workflow?.ok)}.`,
      '',
    )
  }

  if (report.issues.length === 0) {
    lines.push('No integration contract issues.', '')
    return lines.join('\n')
  }

  lines.push('## Issues', '')
  for (const issue of report.issues) {
    lines.push(`- ${issue.phase}: ${issue.path}: ${issue.message}`)
  }
  lines.push('')
  return lines.join('\n')
}

export async function runEditableProjectionIntegrationContractGate<TFile, TEntity, TCommand = unknown>(
  options: EditableProjectionIntegrationContractOptions<TFile, TEntity, TCommand>,
): Promise<EditableProjectionIntegrationContractGateResult<TCommand>> {
  const report = await verifyEditableProjectionIntegrationContract(options)
  return {
    ok: report.ok,
    report,
    markdown: formatEditableProjectionIntegrationContractMarkdown(report),
    json: serializeEditableProjectionIntegrationContractReportJson(report),
  }
}

export async function verifyEditableProjectionIntegrationContract<TFile, TEntity, TCommand = unknown>(
  options: EditableProjectionIntegrationContractOptions<TFile, TEntity, TCommand>,
): Promise<EditableProjectionIntegrationContractReport<TCommand>> {
  const optionIssues = validateEditableProjectionIntegrationContractOptions(options)
  if (optionIssues.length > 0) {
    return {
      ok: false,
      issues: optionIssues,
    }
  }

  const adapter = verifyProjectionAdapterContract(options.adapter)
  const workflow = await verifyEditableProjectionWorkflowContract(options.workflow)
  const issues = [
    ...adapter.issues.map((issue) => ({
      phase: 'adapter' as const,
      path: prefixPath('/adapter', issue.path),
      message: issue.message,
    })),
    ...workflow.issues.map((issue) => ({
      phase: 'workflow' as const,
      path: prefixPath('/workflow', issue.path),
      message: issue.message,
    })),
  ]

  return {
    ok: adapter.ok && workflow.ok,
    issues,
    adapter,
    workflow,
  }
}

export function validateEditableProjectionIntegrationContractOptions(
  options: unknown,
): IntegrationContractIssue[] {
  if (!isRecord(options)) {
    return [{
      phase: 'adapter',
      path: '/',
      message: 'integration contract options must be an object.',
    }]
  }

  return [
    ...validateProjectionAdapterContractOptions(options.adapter as ProjectionAdapterContractOptions<unknown, unknown>)
      .map((issue) => ({
        phase: 'adapter' as const,
        path: prefixPath('/adapter', issue.path),
        message: issue.message,
      })),
    ...validateWorkflowContractOptions(options.workflow as EditableProjectionWorkflowContractOptions)
      .map((issue) => ({
        phase: 'workflow' as const,
        path: prefixPath('/workflow', issue.path),
        message: issue.message,
      })),
  ]
}

export async function assertEditableProjectionIntegrationContract<TFile, TEntity, TCommand = unknown>(
  options: EditableProjectionIntegrationContractOptions<TFile, TEntity, TCommand>,
): Promise<EditableProjectionIntegrationContractReport<TCommand>> {
  const report = await verifyEditableProjectionIntegrationContract(options)
  if (!report.ok) {
    throw new InvalidEditableProjectionIntegrationContractError(report.issues)
  }
  return report
}

function prefixPath(prefix: string, path: string): string {
  if (path === '/') return prefix
  return `${prefix}${path}`
}

function phaseStatus(ok: boolean | undefined): string {
  if (ok === undefined) return 'not run'
  return ok ? 'ok' : 'failed'
}

function validateIntegrationIssues(
  value: unknown,
  path: string,
  issues: IntegrationContractIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ phase: 'workflow', path, message: 'issues must be an array.' })
    return
  }
  value.forEach((issue, index) => {
    const issuePath = `${path}/${index}`
    if (!isRecord(issue)) {
      issues.push({ phase: 'workflow', path: issuePath, message: 'issue must be an object.' })
      return
    }
    if (issue.phase !== 'adapter' && issue.phase !== 'workflow') {
      issues.push({ phase: 'workflow', path: `${issuePath}/phase`, message: 'phase must be adapter or workflow.' })
    }
    if (typeof issue.path !== 'string' || !issue.path.startsWith('/')) {
      issues.push({ phase: 'workflow', path: `${issuePath}/path`, message: 'path must be a JSON Pointer-like string.' })
    }
    if (typeof issue.message !== 'string' || issue.message.length === 0) {
      issues.push({ phase: 'workflow', path: `${issuePath}/message`, message: 'message must be a non-empty string.' })
    }
  })
}

function validateOptionalReportSection(
  value: unknown,
  path: string,
  issues: IntegrationContractIssue[],
): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    issues.push({ phase: 'workflow', path, message: 'report section must be an object when present.' })
    return
  }
  if (value.ok !== undefined && typeof value.ok !== 'boolean') {
    issues.push({ phase: 'workflow', path: `${path}/ok`, message: 'ok must be a boolean when present.' })
  }
}

function validateJsonCompatible(
  value: unknown,
  path: string,
  issues: IntegrationContractIssue[],
  seen = new Set<object>(),
): void {
  if (value === undefined) return
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    issues.push({ phase: 'workflow', path, message: 'value must be JSON-compatible.' })
    return
  }
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) {
    issues.push({ phase: 'workflow', path, message: 'value must not contain cycles.' })
    return
  }
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonCompatible(item, childPath(path, String(index)), issues, seen))
  } else {
    for (const [key, item] of Object.entries(value)) {
      validateJsonCompatible(item, childPath(path, key), issues, seen)
    }
  }
  seen.delete(value)
}

function childPath(path: string, child: string): string {
  return path === '/' ? `/${child}` : `${path}/${child}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

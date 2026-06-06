import {
  InvalidEditableProjectionWorkflowContractError,
  InvalidWorkspaceUpdateTargetError,
  type WorkflowContractIssue,
} from './errors.js'
import { validateWorkspaceUpdateTarget } from './updateTarget.js'
import type {
  ApplyResult,
  ApplyReview,
  WorkspaceFileSystem,
  WorkspaceStatus,
  WorkspaceUpdateResult,
  WorkspaceUpdateTarget,
} from './types.js'
import type { EditableProjectionWorkflow } from './workflow.js'
import type {
  EditableProjectionWorkflowOperationName,
  EditableProjectionWorkflowToolAdapter,
} from './operationRouter.js'

export interface EditableProjectionWorkflowContractOptions<TCommand = unknown> {
  workflow: EditableProjectionWorkflow<TCommand>
  fs: WorkspaceFileSystem
  updateTarget: WorkspaceUpdateTarget
  editFile(current: string): string | Promise<string>
  rootPath?: string
  reviewPath?: string
  updateTargetPath?: string
}

export interface EditableProjectionWorkflowContractReport<TCommand = unknown> {
  ok: boolean
  issues: WorkflowContractIssue[]
  update?: WorkspaceUpdateResult
  review?: ApplyReview<TCommand>
  apply?: ApplyResult
  status?: WorkspaceStatus
}

export interface EditableProjectionWorkflowToolAdapterContractOptions<TCommand = unknown> {
  toolAdapter: EditableProjectionWorkflowToolAdapter<TCommand>
  fs: WorkspaceFileSystem
  updateTarget: WorkspaceUpdateTarget
  editFile(current: string): string | Promise<string>
  rootPath?: string
}

export interface EditableProjectionWorkflowToolAdapterContractReport<TCommand = unknown> {
  ok: boolean
  issues: WorkflowContractIssue[]
  toolNames: string[]
  update?: WorkspaceUpdateResult
  review?: ApplyReview<TCommand>
  apply?: ApplyResult
  status?: WorkspaceStatus
}

export async function verifyEditableProjectionWorkflowContract<TCommand = unknown>(
  options: EditableProjectionWorkflowContractOptions<TCommand>,
): Promise<EditableProjectionWorkflowContractReport<TCommand>> {
  const issues = validateWorkflowContractOptions(options)
  const report: EditableProjectionWorkflowContractReport<TCommand> = { ok: false, issues }
  if (issues.length > 0) return report

  const rootPath = options.rootPath ?? parentPath(options.updateTarget.path)
  const updateTargetPath = options.updateTargetPath ?? 'contract/update-targets'
  const reviewPath = options.reviewPath ?? 'contract/apply-review'

  const savedTargets = await step(issues, '/updateTargets/save', () => (
    options.workflow.saveUpdateTargets(updateTargetPath, [options.updateTarget])
  ))
  if (!savedTargets) return report

  const loadedTargets = await step(issues, '/updateTargets/load', () => (
    options.workflow.loadUpdateTargets(updateTargetPath)
  ))
  if (!loadedTargets) return report
  if (loadedTargets.targets.length !== 1) {
    issues.push({
      path: '/updateTargets/load/targets',
      message: `expected one update target, received ${loadedTargets.targets.length}.`,
    })
    return report
  }

  const update = await step(issues, '/updateTargets/loadAndUpdate', () => (
    options.workflow.loadAndUpdate(updateTargetPath)
  ))
  if (!update) return report
  report.update = update.result
  if (update.result.summary.blocked > 0 || update.result.summary.conflicts > 0) {
    issues.push({
      path: '/update/result',
      message: 'sample update target must refresh without blocked operations or conflicts.',
    })
    return report
  }

  const current = await step(issues, '/fs/readFile', () => options.fs.readFile(options.updateTarget.path))
  if (current === undefined) return report

  const edited = await step(issues, '/editFile', () => options.editFile(current))
  if (edited === undefined) return report
  if (typeof edited !== 'string') {
    issues.push({ path: '/editFile', message: 'editFile must return a string.' })
    return report
  }
  await step(issues, '/fs/writeFile', () => options.fs.writeFile(options.updateTarget.path, edited))
  if (issues.length > 0) return report

  const savedReview = await step(issues, '/review/save', () => (
    options.workflow.reviewAndSave(rootPath, reviewPath)
  ))
  if (!savedReview) return report
  report.review = savedReview.review
  if (!savedReview.gate.ready) {
    issues.push({
      path: '/review/gate',
      message: `sample review must be ready: ${savedReview.gate.reasons.join('; ')}`,
    })
    return report
  }
  if (savedReview.review.summary.create + savedReview.review.summary.update + savedReview.review.summary.delete === 0) {
    issues.push({
      path: '/review/summary',
      message: 'sample edit must produce at least one planned create, update, or delete operation.',
    })
    return report
  }

  const loadedReview = await step(issues, '/review/load', () => (
    options.workflow.loadAndCheckReview(reviewPath)
  ))
  if (!loadedReview) return report

  const applied = await step(issues, '/apply/loadAndApply', () => (
    options.workflow.loadAndApply(reviewPath)
  ))
  if (!applied) return report
  report.apply = applied.result
  if (applied.result.appliedCommands === 0) {
    issues.push({
      path: '/apply/result/appliedCommands',
      message: 'sample apply must execute at least one command.',
    })
    return report
  }
  if (!applied.result.refresh || applied.result.refresh.summary.blocked > 0 || applied.result.refresh.summary.conflicts > 0) {
    issues.push({
      path: '/apply/result/refresh',
      message: 'sample apply executor must return canonical update targets that refresh without blocked operations or conflicts.',
    })
    return report
  }

  const status = await step(issues, '/status', () => options.workflow.status(rootPath))
  if (!status) return report
  report.status = status.status
  const dirty = status.status.files.filter((file) => file.state !== 'clean')
  if (dirty.length > 0) {
    issues.push({
      path: '/status/files',
      message: `sample workspace must be clean after apply; dirty files: ${dirty.map((file) => file.path).join(', ')}.`,
    })
  }

  report.ok = issues.length === 0
  return report
}

export async function verifyEditableProjectionWorkflowToolAdapterContract<TCommand = unknown>(
  options: EditableProjectionWorkflowToolAdapterContractOptions<TCommand>,
): Promise<EditableProjectionWorkflowToolAdapterContractReport<TCommand>> {
  const issues = validateWorkflowToolAdapterContractOptions(options)
  const report: EditableProjectionWorkflowToolAdapterContractReport<TCommand> = {
    ok: false,
    issues,
    toolNames: isRecord(options?.toolAdapter) && Array.isArray(options.toolAdapter.toolDefinitions)
      ? options.toolAdapter.toolDefinitions.map((definition) => isRecord(definition) && typeof definition.name === 'string' ? definition.name : '')
      : [],
  }
  if (issues.length > 0) return report

  const rootPath = options.rootPath ?? parentPath(options.updateTarget.path)
  const updateTool = findToolName(options.toolAdapter, 'update', issues)
  const reviewTool = findToolName(options.toolAdapter, 'review', issues)
  const applyTool = findToolName(options.toolAdapter, 'applyReview', issues)
  const statusTool = findToolName(options.toolAdapter, 'status', issues)
  if (!updateTool || !reviewTool || !applyTool || !statusTool) return report

  const update = await step(issues, '/tool/update', () => options.toolAdapter.run(updateTool, {
    targets: [options.updateTarget],
  }))
  if (!update || !update.ok) {
    pushBridgeFailure(issues, '/tool/update', update)
    return report
  }
  if (!isRecord(update.result) || !isRecord(update.result.result)) {
    issues.push({ path: '/tool/update/result', message: 'update tool must return a WorkspaceUpdateReport bridge result.' })
    return report
  }
  report.update = update.result.result as unknown as WorkspaceUpdateResult
  if (report.update.summary.blocked > 0 || report.update.summary.conflicts > 0) {
    issues.push({
      path: '/tool/update/result',
      message: 'sample update target must refresh without blocked operations or conflicts.',
    })
    return report
  }

  const current = await step(issues, '/fs/readFile', () => options.fs.readFile(options.updateTarget.path))
  if (current === undefined) return report

  const edited = await step(issues, '/editFile', () => options.editFile(current))
  if (edited === undefined) return report
  if (typeof edited !== 'string') {
    issues.push({ path: '/editFile', message: 'editFile must return a string.' })
    return report
  }
  await step(issues, '/fs/writeFile', () => options.fs.writeFile(options.updateTarget.path, edited))
  if (issues.length > 0) return report

  const review = await step(issues, '/tool/review', () => options.toolAdapter.run(reviewTool, {
    path: rootPath,
  }))
  if (!review || !review.ok) {
    pushBridgeFailure(issues, '/tool/review', review)
    return report
  }
  if (!isRecord(review.result) || !isRecord(review.result.review) || !isRecord(review.result.gate)) {
    issues.push({ path: '/tool/review/result', message: 'review tool must return an ApplyReviewReport bridge result.' })
    return report
  }
  report.review = review.result.review as unknown as ApplyReview<TCommand>
  const gate = review.result.gate as { ready?: unknown; reasons?: unknown }
  if (gate.ready !== true) {
    issues.push({
      path: '/tool/review/gate',
      message: `sample review must be ready: ${Array.isArray(gate.reasons) ? gate.reasons.join('; ') : 'unknown reason'}`,
    })
    return report
  }
  if (report.review.summary.create + report.review.summary.update + report.review.summary.delete === 0) {
    issues.push({
      path: '/tool/review/summary',
      message: 'sample edit must produce at least one planned create, update, or delete operation.',
    })
    return report
  }

  const apply = await step(issues, '/tool/applyReview', () => options.toolAdapter.run(applyTool, {
    review: report.review,
  }))
  if (!apply || !apply.ok) {
    pushBridgeFailure(issues, '/tool/applyReview', apply)
    return report
  }
  if (!isRecord(apply.result) || !isRecord(apply.result.result)) {
    issues.push({ path: '/tool/applyReview/result', message: 'applyReview tool must return an ApplyReport bridge result.' })
    return report
  }
  report.apply = apply.result.result as unknown as ApplyResult
  if (report.apply.appliedCommands === 0) {
    issues.push({
      path: '/tool/applyReview/result/appliedCommands',
      message: 'sample apply must execute at least one command.',
    })
    return report
  }

  const status = await step(issues, '/tool/status', () => options.toolAdapter.run(statusTool, {
    path: rootPath,
  }))
  if (!status || !status.ok) {
    pushBridgeFailure(issues, '/tool/status', status)
    return report
  }
  if (!isRecord(status.result) || !isRecord(status.result.status)) {
    issues.push({ path: '/tool/status/result', message: 'status tool must return a WorkspaceStatusReport bridge result.' })
    return report
  }
  report.status = status.result.status as unknown as WorkspaceStatus
  const dirty = report.status.files.filter((file) => file.state !== 'clean')
  if (dirty.length > 0) {
    issues.push({
      path: '/tool/status/files',
      message: `sample workspace must be clean after apply; dirty files: ${dirty.map((file) => file.path).join(', ')}.`,
    })
  }

  report.ok = issues.length === 0
  return report
}

export function validateWorkflowContractOptions(
  options: EditableProjectionWorkflowContractOptions,
): WorkflowContractIssue[] {
  if (!isRecord(options)) {
    return [{ path: '/', message: 'workflow contract options must be an object.' }]
  }

  const issues: WorkflowContractIssue[] = []
  validateWorkflowLike(options.workflow, issues)
  validateFileSystemLike(options.fs, issues)
  if (typeof options.editFile !== 'function') {
    issues.push({ path: '/editFile', message: 'editFile must be a function.' })
  }
  if (options.rootPath !== undefined && typeof options.rootPath !== 'string') {
    issues.push({ path: '/rootPath', message: 'rootPath must be a string when present.' })
  }
  if (options.reviewPath !== undefined && typeof options.reviewPath !== 'string') {
    issues.push({ path: '/reviewPath', message: 'reviewPath must be a string when present.' })
  }
  if (options.updateTargetPath !== undefined && typeof options.updateTargetPath !== 'string') {
    issues.push({ path: '/updateTargetPath', message: 'updateTargetPath must be a string when present.' })
  }

  try {
    validateWorkspaceUpdateTarget(options.updateTarget, '/updateTarget')
    if (options.updateTarget.operation === 'delete') {
      issues.push({
        path: '/updateTarget/operation',
        message: 'workflow contract requires an upsert update target so the sample file can be edited.',
      })
    }
  } catch (error) {
    if (error instanceof InvalidWorkspaceUpdateTargetError) {
      issues.push(...error.issues)
    } else {
      issues.push({ path: '/updateTarget', message: errorMessage(error) })
    }
  }

  return issues
}

export function validateWorkflowToolAdapterContractOptions(
  options: EditableProjectionWorkflowToolAdapterContractOptions,
): WorkflowContractIssue[] {
  if (!isRecord(options)) {
    return [{ path: '/', message: 'workflow tool adapter contract options must be an object.' }]
  }

  const issues: WorkflowContractIssue[] = []
  validateToolAdapterLike(options.toolAdapter, issues)
  validateFileSystemLike(options.fs, issues)
  if (typeof options.editFile !== 'function') {
    issues.push({ path: '/editFile', message: 'editFile must be a function.' })
  }
  if (options.rootPath !== undefined && typeof options.rootPath !== 'string') {
    issues.push({ path: '/rootPath', message: 'rootPath must be a string when present.' })
  }

  try {
    validateWorkspaceUpdateTarget(options.updateTarget, '/updateTarget')
    if (options.updateTarget.operation === 'delete') {
      issues.push({
        path: '/updateTarget/operation',
        message: 'workflow tool adapter contract requires an upsert update target so the sample file can be edited.',
      })
    }
  } catch (error) {
    if (error instanceof InvalidWorkspaceUpdateTargetError) {
      issues.push(...error.issues)
    } else {
      issues.push({ path: '/updateTarget', message: errorMessage(error) })
    }
  }

  return issues
}

export async function assertEditableProjectionWorkflowContract<TCommand = unknown>(
  options: EditableProjectionWorkflowContractOptions<TCommand>,
): Promise<EditableProjectionWorkflowContractReport<TCommand>> {
  const report = await verifyEditableProjectionWorkflowContract(options)
  if (!report.ok) {
    throw new InvalidEditableProjectionWorkflowContractError(report.issues)
  }
  return report
}

export async function assertEditableProjectionWorkflowToolAdapterContract<TCommand = unknown>(
  options: EditableProjectionWorkflowToolAdapterContractOptions<TCommand>,
): Promise<EditableProjectionWorkflowToolAdapterContractReport<TCommand>> {
  const report = await verifyEditableProjectionWorkflowToolAdapterContract(options)
  if (!report.ok) {
    throw new InvalidEditableProjectionWorkflowContractError(report.issues)
  }
  return report
}

async function step<T>(
  issues: WorkflowContractIssue[],
  path: string,
  run: () => T | Promise<T>,
): Promise<T | undefined> {
  try {
    return await run()
  } catch (error) {
    issues.push({ path, message: errorMessage(error) })
    return undefined
  }
}

function findToolName<TCommand>(
  toolAdapter: EditableProjectionWorkflowToolAdapter<TCommand>,
  operation: EditableProjectionWorkflowOperationName,
  issues: WorkflowContractIssue[],
): string | undefined {
  const definition = toolAdapter.toolDefinitions.find((tool) => tool.operation === operation)
  if (!definition) {
    issues.push({
      path: `/toolDefinitions/${operation}`,
      message: `toolDefinitions must include an ${operation} tool.`,
    })
    return undefined
  }
  return definition.name
}

function pushBridgeFailure(
  issues: WorkflowContractIssue[],
  path: string,
  result: { ok: boolean; error?: { message?: string } } | undefined,
): void {
  if (result?.ok === false) {
    issues.push({ path, message: result.error?.message ?? 'tool call failed.' })
  }
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  if (index <= 0) return '.'
  return path.slice(0, index)
}

function validateToolAdapterLike(value: unknown, issues: WorkflowContractIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: '/toolAdapter', message: 'toolAdapter must be an object with toolDefinitions, run, runJson, and getOperationName.' })
    return
  }
  if (!Array.isArray(value.toolDefinitions)) {
    issues.push({ path: '/toolAdapter/toolDefinitions', message: 'toolDefinitions must be an array.' })
  }
  if (typeof value.run !== 'function') {
    issues.push({ path: '/toolAdapter/run', message: 'run must be a function.' })
  }
  if (typeof value.runJson !== 'function') {
    issues.push({ path: '/toolAdapter/runJson', message: 'runJson must be a function.' })
  }
  if (typeof value.getOperationName !== 'function') {
    issues.push({ path: '/toolAdapter/getOperationName', message: 'getOperationName must be a function.' })
  }
}

function validateWorkflowLike(value: unknown, issues: WorkflowContractIssue[]): void {
  const methods = [
    'saveUpdateTargets',
    'loadUpdateTargets',
    'loadAndUpdate',
    'reviewAndSave',
    'loadAndCheckReview',
    'loadAndApply',
    'status',
  ]
  if (!isRecord(value)) {
    issues.push({ path: '/workflow', message: 'workflow must be an object with the public workflow facade methods.' })
    return
  }
  for (const method of methods) {
    if (typeof value[method] !== 'function') {
      issues.push({ path: `/workflow/${method}`, message: `${method} must be a function.` })
    }
  }
}

function validateFileSystemLike(value: unknown, issues: WorkflowContractIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: '/fs', message: 'fs must be an object with readFile and writeFile functions.' })
    return
  }
  if (typeof value.readFile !== 'function') {
    issues.push({ path: '/fs/readFile', message: 'readFile must be a function.' })
  }
  if (typeof value.writeFile !== 'function') {
    issues.push({ path: '/fs/writeFile', message: 'writeFile must be a function.' })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

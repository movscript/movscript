import {
  formatApplyResultMarkdown,
  formatApplyReviewMarkdown,
  formatWorkspaceStatusMarkdown,
  formatWorkspaceUpdateMarkdown,
  validateFormatOptions,
  type FormatOptions,
} from './format.js'
import { serializeApplyReviewJson, validateApplyReview, validateWorkspaceReviewOptions } from './applyReview.js'
import {
  InvalidEditableProjectionWorkflowOptionsError,
  MissingApplyReviewStoreError,
  MissingCommandExecutorError,
  MissingWorkspaceUpdateTargetStoreError,
  type WorkflowOptionsValidationIssue,
} from './errors.js'
import { normalizePath, pathHasCurrentSegment, pathHasParentSegment, pathIsAbsolute } from './paths.js'
import {
  parseWorkspaceUpdateTargetsJson,
  serializeWorkspaceUpdateTargetsJson,
  validateWorkspaceUpdateOptions,
  validateWorkspaceUpdateTargets,
} from './updateTarget.js'
import { serializeWorkspaceStatusJson } from './status.js'
import {
  serializeApplyResultJson,
  serializeWorkspaceUpdateResultJson,
  validateApplyResult,
  validateWorkspaceUpdateResult,
} from './result.js'
import {
  assertApplyReviewReady,
  evaluateApplyReview,
  type ApplyReviewGate,
} from './reviewGate.js'
import type {
  ApplyResult,
  ApplyReview,
  ApplyReviewStore,
  CommandExecutor,
  EditableProjectionWorkspaceOptions,
  WorkspaceStatus,
  WorkspaceUpdateMode,
  WorkspaceUpdateOptions as WorkspaceUpdateWorkspaceOptions,
  WorkspaceUpdateResult,
  WorkspaceUpdateTarget,
  WorkspaceUpdateTargetStore,
} from './types.js'
import {
  createEditableProjectionWorkspace,
  EditableProjectionWorkspace,
} from './workspace.js'

export interface EditableProjectionWorkflowOptions<TCommand = unknown> {
  workspace: EditableProjectionWorkspace
  executor?: CommandExecutor<TCommand>
  reviewStore?: ApplyReviewStore<TCommand>
  updateTargetStore?: WorkspaceUpdateTargetStore
  format?: FormatOptions
}

export interface WorkspaceStatusReport {
  status: WorkspaceStatus
  markdown: string
  json: string
}

export interface ApplyReviewReport<TCommand = unknown> {
  review: ApplyReview<TCommand>
  gate: ApplyReviewGate
  markdown: string
  json: string
}

export interface ApplyReviewArtifactReport<TCommand = unknown> extends ApplyReviewReport<TCommand> {
  reviewPath: string
}

export interface WorkspaceUpdateReport {
  result: WorkspaceUpdateResult
  markdown: string
  json: string
}

export interface WorkspaceUpdateTargetArtifactReport {
  targets: WorkspaceUpdateTarget[]
  artifactPath: string
  json: string
}

export interface WorkspaceUpdateArtifactReport extends WorkspaceUpdateReport {
  artifactPath: string
}

export interface WorkspaceUpdateAndReviewReport<TCommand = unknown> {
  update: WorkspaceUpdateReport
  review: ApplyReviewReport<TCommand>
  markdown: string
}

export interface WorkspaceUpdateAndReviewArtifactReport<TCommand = unknown>
  extends WorkspaceUpdateAndReviewReport<TCommand> {
  reviewPath: string
}

export interface ApplyReport<TCommand = unknown> {
  review: ApplyReview<TCommand>
  gate: ApplyReviewGate
  result: ApplyResult
  markdown: string
  json: string
}

export interface ApplyArtifactReport<TCommand = unknown> extends ApplyReport<TCommand> {
  reviewPath: string
}

export interface WorkflowStatusOptions {
  format?: FormatOptions
}

export interface WorkflowReviewOptions {
  includeNoop?: boolean
  format?: FormatOptions
}

export interface WorkflowUpdateOptions {
  mode?: WorkspaceUpdateMode
  backendRevision?: WorkspaceUpdateWorkspaceOptions['backendRevision']
  format?: FormatOptions
}

export interface WorkflowUpdateAndReviewOptions extends WorkflowUpdateOptions, WorkflowReviewOptions {}

export interface WorkflowApplyOptions<TCommand = unknown> {
  executor?: CommandExecutor<TCommand>
  allowConflicts?: boolean
  allowStaleReview?: boolean
  refreshMode?: WorkspaceUpdateMode
  format?: FormatOptions
}

export class EditableProjectionWorkflow<TCommand = unknown> {
  private readonly options: EditableProjectionWorkflowOptions<TCommand>

  constructor(options: EditableProjectionWorkflowOptions<TCommand>) {
    this.options = validateEditableProjectionWorkflowOptions<TCommand>(options)
  }

  async status(path = '.', options: WorkflowStatusOptions = {}): Promise<WorkspaceStatusReport> {
    const statusOptions = validateWorkflowStatusOptions(options)
    const status = await this.options.workspace.status(path)
    return {
      status,
      markdown: formatWorkspaceStatusMarkdown(status, this.formatOptions(statusOptions.format)),
      json: serializeWorkspaceStatusJson(status),
    }
  }

  async review(path = '.', options: WorkflowReviewOptions = {}): Promise<ApplyReviewReport<TCommand>> {
    const reviewOptions = validateWorkflowReviewOptions(options)
    const review = await this.options.workspace.applyReview(path, { includeNoop: reviewOptions.includeNoop })
    return this.reviewReport(review as ApplyReview<TCommand>, reviewOptions.format)
  }

  async checkReview(
    review: ApplyReview<TCommand>,
    options: WorkflowStatusOptions = {},
  ): Promise<ApplyReviewReport<TCommand>> {
    const statusOptions = validateWorkflowStatusOptions(options)
    return this.reviewReport(validateApplyReview<TCommand>(review), statusOptions.format)
  }

  async saveReview(
    reviewPath: string,
    review: ApplyReview<TCommand>,
    options: WorkflowStatusOptions = {},
  ): Promise<ApplyReviewArtifactReport<TCommand>> {
    const statusOptions = validateWorkflowStatusOptions(options)
    const validatedReviewPath = validateWorkflowArtifactPath(reviewPath, '/reviewPath')
    const validatedReview = validateApplyReview<TCommand>(review, validatedReviewPath)
    await this.requireReviewStore().save(validatedReviewPath, validatedReview)
    return this.reviewArtifactReport(validatedReviewPath, validatedReview, statusOptions.format)
  }

  async loadReview(
    reviewPath: string,
    options: WorkflowStatusOptions = {},
  ): Promise<ApplyReviewArtifactReport<TCommand>> {
    const statusOptions = validateWorkflowStatusOptions(options)
    const validatedReviewPath = validateWorkflowArtifactPath(reviewPath, '/reviewPath')
    const review = validateApplyReview<TCommand>(await this.requireReviewStore().load(validatedReviewPath), validatedReviewPath)
    return this.reviewArtifactReport(validatedReviewPath, review, statusOptions.format)
  }

  async loadAndCheckReview(
    reviewPath: string,
    options: WorkflowStatusOptions = {},
  ): Promise<ApplyReviewArtifactReport<TCommand>> {
    return this.loadReview(reviewPath, options)
  }

  async reviewAndSave(
    path: string,
    reviewPath: string,
    options: WorkflowReviewOptions = {},
  ): Promise<ApplyReviewArtifactReport<TCommand>> {
    const reviewOptions = validateWorkflowReviewOptions(options)
    const report = await this.review(path, reviewOptions)
    return this.saveReview(reviewPath, report.review, reviewOptions)
  }

  async update(
    targets: WorkspaceUpdateTarget[],
    options: WorkflowUpdateOptions = {},
  ): Promise<WorkspaceUpdateReport> {
    const updateOptions = validateWorkflowUpdateOptions(options)
    const result = validateWorkspaceUpdateResult(await this.options.workspace.update(validateWorkspaceUpdateTargets(targets), {
      mode: updateOptions.mode,
      backendRevision: updateOptions.backendRevision,
    }))
    return {
      result,
      markdown: formatWorkspaceUpdateMarkdown(result, this.formatOptions(updateOptions.format)),
      json: serializeWorkspaceUpdateResultJson(result),
    }
  }

  async saveUpdateTargets(
    artifactPath: string,
    targets: WorkspaceUpdateTarget[],
  ): Promise<WorkspaceUpdateTargetArtifactReport> {
    const validatedArtifactPath = validateWorkflowArtifactPath(artifactPath, '/artifactPath')
    const validatedTargets = validateWorkspaceUpdateTargetsArtifact(targets)
    await this.requireUpdateTargetStore().save(validatedArtifactPath, validatedTargets)
    return {
      artifactPath: validatedArtifactPath,
      targets: validatedTargets,
      json: serializeWorkspaceUpdateTargetsJson(validatedTargets),
    }
  }

  async loadUpdateTargets(
    artifactPath: string,
  ): Promise<WorkspaceUpdateTargetArtifactReport> {
    const validatedArtifactPath = validateWorkflowArtifactPath(artifactPath, '/artifactPath')
    const targets = validateWorkspaceUpdateTargetsArtifact(await this.requireUpdateTargetStore().load(validatedArtifactPath))
    return {
      artifactPath: validatedArtifactPath,
      targets,
      json: serializeWorkspaceUpdateTargetsJson(targets),
    }
  }

  async loadAndUpdate(
    artifactPath: string,
    options: WorkflowUpdateOptions = {},
  ): Promise<WorkspaceUpdateArtifactReport> {
    const updateOptions = validateWorkflowUpdateOptions(options)
    const artifact = await this.loadUpdateTargets(artifactPath)
    const update = await this.update(artifact.targets, updateOptions)
    return {
      ...update,
      artifactPath,
    }
  }

  async updateAndReview(
    targets: WorkspaceUpdateTarget[],
    path = '.',
    options: WorkflowUpdateAndReviewOptions = {},
  ): Promise<WorkspaceUpdateAndReviewReport<TCommand>> {
    const updateAndReviewOptions = validateWorkflowUpdateAndReviewOptions(options)
    const update = await this.update(targets, updateAndReviewOptions)
    const review = await this.review(path, updateAndReviewOptions)
    return {
      update,
      review,
      markdown: `${update.markdown}\n\n${review.markdown}`,
    }
  }

  async updateAndSaveReview(
    targets: WorkspaceUpdateTarget[],
    path: string,
    reviewPath: string,
    options: WorkflowUpdateAndReviewOptions = {},
  ): Promise<WorkspaceUpdateAndReviewArtifactReport<TCommand>> {
    const updateAndReviewOptions = validateWorkflowUpdateAndReviewOptions(options)
    const report = await this.updateAndReview(targets, path, updateAndReviewOptions)
    const review = await this.saveReview(reviewPath, report.review.review, updateAndReviewOptions)
    return {
      ...report,
      review,
      markdown: `${report.update.markdown}\n\n${review.markdown}`,
      reviewPath,
    }
  }

  async applyReview(
    review: ApplyReview<TCommand>,
    options: WorkflowApplyOptions<TCommand> = {},
  ): Promise<ApplyReport<TCommand>> {
    const applyOptions = validateWorkflowApplyOptions<TCommand>(options)
    const validatedReview = validateApplyReview<TCommand>(review)
    const gate = evaluateApplyReview(validatedReview)
    if (!applyOptions.allowConflicts) {
      assertApplyReviewReady(validatedReview)
    }
    const result = validateApplyResult(await this.options.workspace.apply(validatedReview, {
      executor: applyOptions.executor ?? this.requireExecutor(),
      allowConflicts: applyOptions.allowConflicts,
      allowStaleReview: applyOptions.allowStaleReview,
      refreshMode: applyOptions.refreshMode,
    }))
    return {
      review: validatedReview,
      gate,
      result,
      markdown: formatApplyResultMarkdown(result, this.formatOptions(applyOptions.format)),
      json: serializeApplyResultJson(result),
    }
  }

  async loadAndApply(
    reviewPath: string,
    options: WorkflowApplyOptions<TCommand> = {},
  ): Promise<ApplyArtifactReport<TCommand>> {
    const applyOptions = validateWorkflowApplyOptions<TCommand>(options)
    const report = await this.loadReview(reviewPath, applyOptions)
    const applied = await this.applyReview(report.review, applyOptions)
    return {
      ...applied,
      reviewPath,
    }
  }

  async reviewAndApply(
    path = '.',
    options: WorkflowReviewOptions & WorkflowApplyOptions<TCommand> = {},
  ): Promise<ApplyReport<TCommand>> {
    const reviewAndApplyOptions = validateWorkflowReviewAndApplyOptions<TCommand>(options)
    const report = await this.review(path, reviewAndApplyOptions)
    if (!reviewAndApplyOptions.allowConflicts) {
      assertApplyReviewReady(report.review)
    }
    const result = validateApplyResult(await this.options.workspace.apply(report.review, {
      executor: reviewAndApplyOptions.executor ?? this.requireExecutor(),
      allowConflicts: reviewAndApplyOptions.allowConflicts,
      allowStaleReview: reviewAndApplyOptions.allowStaleReview,
      refreshMode: reviewAndApplyOptions.refreshMode,
    }))
    return {
      review: report.review,
      gate: report.gate,
      result,
      markdown: formatApplyResultMarkdown(result, this.formatOptions(reviewAndApplyOptions.format)),
      json: serializeApplyResultJson(result),
    }
  }

  private reviewReport(review: ApplyReview<TCommand>, format?: FormatOptions): ApplyReviewReport<TCommand> {
    return {
      review,
      gate: evaluateApplyReview(review),
      markdown: formatApplyReviewMarkdown(review, this.formatOptions(format)),
      json: serializeApplyReviewJson(review),
    }
  }

  private reviewArtifactReport(
    reviewPath: string,
    review: ApplyReview<TCommand>,
    format?: FormatOptions,
  ): ApplyReviewArtifactReport<TCommand> {
    return {
      ...this.reviewReport(review, format),
      reviewPath,
    }
  }

  private formatOptions(format?: FormatOptions): FormatOptions {
    const base = this.options.format === undefined ? {} : validateFormatOptions(this.options.format)
    const override = format === undefined ? {} : validateFormatOptions(format)
    return validateFormatOptions({ ...base, ...override })
  }

  private requireExecutor(): CommandExecutor<TCommand> {
    if (!this.options.executor) {
      throw new MissingCommandExecutorError()
    }
    return this.options.executor
  }

  private requireReviewStore(): ApplyReviewStore<TCommand> {
    if (!this.options.reviewStore) {
      throw new MissingApplyReviewStoreError()
    }
    return this.options.reviewStore
  }

  private requireUpdateTargetStore(): WorkspaceUpdateTargetStore {
    if (!this.options.updateTargetStore) {
      throw new MissingWorkspaceUpdateTargetStoreError()
    }
    return this.options.updateTargetStore
  }
}

export function createEditableProjectionWorkflow<TCommand = unknown>(
  options: EditableProjectionWorkflowOptions<TCommand>,
): EditableProjectionWorkflow<TCommand> {
  return new EditableProjectionWorkflow(options)
}

export function validateEditableProjectionWorkflowOptions<TCommand = unknown>(
  options: unknown,
): EditableProjectionWorkflowOptions<TCommand> {
  if (!isRecord(options)) {
    throw new InvalidEditableProjectionWorkflowOptionsError([{
      path: '/',
      message: 'workflow options must be an object.',
    }])
  }

  const issues: WorkflowOptionsValidationIssue[] = []
  validateDependency(options.workspace, '/workspace', ['status', 'applyReview', 'update', 'apply'], issues)
  if (options.executor !== undefined) {
    validateDependency(options.executor, '/executor', ['execute'], issues)
  }
  if (options.reviewStore !== undefined) {
    validateDependency(options.reviewStore, '/reviewStore', ['load', 'save'], issues)
  }
  if (options.updateTargetStore !== undefined) {
    validateDependency(options.updateTargetStore, '/updateTargetStore', ['load', 'save'], issues)
  }
  if (options.format !== undefined) {
    try {
      validateFormatOptions(options.format)
    } catch (error) {
      if (error instanceof Error) {
        issues.push({ path: '/format', message: error.message })
      } else {
        issues.push({ path: '/format', message: String(error) })
      }
    }
  }

  if (issues.length > 0) {
    throw new InvalidEditableProjectionWorkflowOptionsError(issues)
  }
  return options as unknown as EditableProjectionWorkflowOptions<TCommand>
}

export function validateWorkflowStatusOptions(value: unknown): WorkflowStatusOptions {
  const options = validateWorkflowOptionsObject(value, 'status') as Partial<WorkflowStatusOptions>
  if (options.format !== undefined) validateFormatOptions(options.format)
  return options as WorkflowStatusOptions
}

export function validateWorkflowReviewOptions(value: unknown): WorkflowReviewOptions {
  const options = validateWorkflowOptionsObject(value, 'review') as Partial<WorkflowReviewOptions>
  validateWorkspaceReviewOptions({ includeNoop: options.includeNoop })
  if (options.format !== undefined) validateFormatOptions(options.format)
  return options as WorkflowReviewOptions
}

export function validateWorkflowUpdateOptions(value: unknown): WorkflowUpdateOptions {
  const options = validateWorkflowOptionsObject(value, 'update') as Partial<WorkflowUpdateOptions>
  validateWorkspaceUpdateOptions({
    mode: options.mode,
    backendRevision: options.backendRevision,
  })
  if (options.format !== undefined) validateFormatOptions(options.format)
  return options as WorkflowUpdateOptions
}

export function validateWorkflowUpdateAndReviewOptions(value: unknown): WorkflowUpdateAndReviewOptions {
  const options = validateWorkflowOptionsObject(value, 'updateAndReview') as Partial<WorkflowUpdateAndReviewOptions>
  validateWorkspaceUpdateOptions({
    mode: options.mode,
    backendRevision: options.backendRevision,
  })
  validateWorkspaceReviewOptions({ includeNoop: options.includeNoop })
  if (options.format !== undefined) validateFormatOptions(options.format)
  return options as WorkflowUpdateAndReviewOptions
}

export function validateWorkflowApplyOptions<TCommand = unknown>(value: unknown): WorkflowApplyOptions<TCommand> {
  const options = validateWorkflowOptionsObject(value, 'apply') as Partial<WorkflowApplyOptions<TCommand>>
  const issues: WorkflowOptionsValidationIssue[] = []

  if (options.executor !== undefined && (!isRecord(options.executor) || typeof options.executor.execute !== 'function')) {
    issues.push({ path: '/executor', message: 'executor must be an object with an execute function when present.' })
  }
  if (options.allowConflicts !== undefined && typeof options.allowConflicts !== 'boolean') {
    issues.push({ path: '/allowConflicts', message: 'allowConflicts must be a boolean when present.' })
  }
  if (options.allowStaleReview !== undefined && typeof options.allowStaleReview !== 'boolean') {
    issues.push({ path: '/allowStaleReview', message: 'allowStaleReview must be a boolean when present.' })
  }
  if (options.refreshMode !== undefined && options.refreshMode !== 'safe' && options.refreshMode !== 'overwrite' && options.refreshMode !== 'merge') {
    issues.push({ path: '/refreshMode', message: 'refreshMode must be safe, overwrite, or merge when present.' })
  }
  if (issues.length > 0) {
    throw new InvalidEditableProjectionWorkflowOptionsError(issues)
  }
  if (options.format !== undefined) validateFormatOptions(options.format)
  return options as WorkflowApplyOptions<TCommand>
}

export function validateWorkflowReviewAndApplyOptions<TCommand = unknown>(
  value: unknown,
): WorkflowReviewOptions & WorkflowApplyOptions<TCommand> {
  const options = validateWorkflowOptionsObject(value, 'reviewAndApply') as Partial<WorkflowReviewOptions & WorkflowApplyOptions<TCommand>>
  validateWorkspaceReviewOptions({ includeNoop: options.includeNoop })
  validateWorkflowApplyOptions<TCommand>(options)
  return options as WorkflowReviewOptions & WorkflowApplyOptions<TCommand>
}

export function createEditableProjectionWorkflowFromOptions<TCommand = unknown>(
  options: EditableProjectionWorkspaceOptions & Omit<EditableProjectionWorkflowOptions<TCommand>, 'workspace'>,
): EditableProjectionWorkflow<TCommand> {
  if (!isRecord(options)) {
    throw new InvalidEditableProjectionWorkflowOptionsError([{
      path: '/',
      message: 'workflow options must be an object.',
    }])
  }
  const { executor, reviewStore, updateTargetStore, format, ...workspaceOptions } = options
  return createEditableProjectionWorkflow({
    workspace: createEditableProjectionWorkspace(workspaceOptions),
    executor,
    reviewStore,
    updateTargetStore,
    format,
  })
}

function validateWorkspaceUpdateTargetsArtifact(targets: WorkspaceUpdateTarget[]): WorkspaceUpdateTarget[] {
  return parseWorkspaceUpdateTargetsJson(serializeWorkspaceUpdateTargetsJson(targets))
}

function validateWorkflowOptionsObject(value: unknown, method: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidEditableProjectionWorkflowOptionsError([{
      path: '/',
      message: `${method} options must be an object.`,
    }])
  }
  return value
}

function validateWorkflowArtifactPath(value: unknown, path: string): string {
  const issues: WorkflowOptionsValidationIssue[] = []
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidEditableProjectionWorkflowOptionsError([{
      path,
      message: `${path.slice(1)} must be a non-empty normalized relative path.`,
    }])
  }

  const normalized = normalizePath(value)
  if (normalized !== value || normalized === '.' || pathHasCurrentSegment(value)) {
    issues.push({ path, message: `${path.slice(1)} must be a non-empty normalized relative path.` })
  }
  if (pathIsAbsolute(value)) {
    issues.push({ path, message: `${path.slice(1)} must be relative.` })
  }
  if (pathHasParentSegment(value)) {
    issues.push({ path, message: `${path.slice(1)} must not contain parent-directory segments.` })
  }
  if (issues.length > 0) {
    throw new InvalidEditableProjectionWorkflowOptionsError(issues)
  }
  return value
}

function validateDependency(
  value: unknown,
  path: string,
  requiredMethods: string[],
  issues: WorkflowOptionsValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: `${path.slice(1)} must be an object.` })
    return
  }
  for (const method of requiredMethods) {
    if (typeof value[method] !== 'function') {
      issues.push({ path: `${path}/${method}`, message: `${method} must be a function.` })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

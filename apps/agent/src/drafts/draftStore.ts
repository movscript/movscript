import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { JSONValue } from '../types.js'
import { atomicWriteJSON, resolveAgentStatePath } from '../state/fileStore.js'
import { DRAFT_CONTENT_SCHEMA_IDS, DRAFT_KIND_VALUES, type DraftKindValue } from '@movscript/draft-schemas'

// AgentDraft is a local runtime/client review artifact. It is the protocol shape
// used to pass proposed changes to the UI for preview, revision, approval, or
// rejection. It is not a formal backend domain entity until a separate apply
// flow writes accepted content to backend APIs.
export type AgentDraftKind = DraftKindValue
export type AgentDraftStatus = 'draft' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface AgentDraftSource {
  entityType?: string
  entityId?: number | string
  pipelineNodeId?: number | string
  runId?: string
  threadId?: string
  userId?: number | string
  pageKey?: string
  pageType?: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  [key: string]: JSONValue | undefined
}

export interface AgentDraftTarget {
  entityType?: string
  entityId?: number | string
  field?: string
  [key: string]: JSONValue | undefined
}

export interface AgentDraft {
  id: string
  filePath?: string
  projectId?: number
  kind: AgentDraftKind
  title: string
  content: string
  status: AgentDraftStatus
  source?: AgentDraftSource
  target?: AgentDraftTarget
  createdByRunId?: string
  createdByThreadId?: string
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
}

export interface CreateAgentDraftInput {
  projectId?: number
  kind?: unknown
  title?: unknown
  content?: unknown
  source?: unknown
  target?: unknown
  seed?: unknown
  createdByRunId?: string
  createdByThreadId?: string
  metadata?: unknown
}

export interface ListAgentDraftsQuery {
  projectId?: number
  kind?: AgentDraftKind
  status?: AgentDraftStatus
  statuses?: AgentDraftStatus[]
  threadId?: string
  runId?: string
  sourceEntityType?: string
  sourceEntityId?: number | string
  pageKey?: string
  pageType?: string
  pageRoute?: string
  pageEntityType?: string
  pageEntityId?: number | string
  limit?: number
}

export interface UpdateAgentDraftInput {
  status?: AgentDraftStatus
  title?: string
  content?: string
  target?: AgentDraftTarget
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, JSONValue>
}

export type AgentDraftPatchOpType = 'add' | 'replace' | 'remove'

export interface AgentDraftPatchOp {
  op: AgentDraftPatchOpType
  path: string
  value?: JSONValue
}

export interface PatchAgentDraftInput {
  ops?: unknown
  expectedUpdatedAt?: unknown
  metadata?: unknown
}

export interface AgentDraftPatchResult {
  draft: AgentDraft
  changedPaths: string[]
}

export interface ReadAgentDraftResult {
  draft: AgentDraft
  filePath: string
  content: string
}

export interface EditAgentDraftInput {
  oldString?: unknown
  newString?: unknown
  replaceAll?: unknown
}

export interface EditAgentDraftResult {
  draft: AgentDraft
  filePath: string
  replacementCount: number
}

export interface AgentDraftValidationIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface AgentDraftValidationResult {
  ok: boolean
  draftId: string
  kind: AgentDraftKind
  issues: AgentDraftValidationIssue[]
}

export interface AgentDraftStore {
  createDraft(input: CreateAgentDraftInput): AgentDraft
  updateDraft(id: string, input: UpdateAgentDraftInput): AgentDraft
  patchDraft(id: string, input: PatchAgentDraftInput): AgentDraftPatchResult
  getDraftFilePath(id: string): string
  readDraftFile(filePath: string): ReadAgentDraftResult
  editDraftFile(filePath: string, input: EditAgentDraftInput): EditAgentDraftResult
  getDraft(id: string): AgentDraft | undefined
  listDrafts(query?: ListAgentDraftsQuery): AgentDraft[]
}

export class InMemoryAgentDraftStore implements AgentDraftStore {
  private readonly drafts = new Map<string, AgentDraft>()
  protected readonly lastReadContentByPath = new Map<string, string>()

  createDraft(input: CreateAgentDraftInput): AgentDraft {
    const now = new Date().toISOString()
    const draftId = makeDraftId()
    const metadata = normalizeMetadata(input.metadata)
    const seed = normalizeDraftSeed(input.seed)
    const draft: AgentDraft = {
      id: draftId,
      filePath: this.getDraftFilePath(draftId),
      ...(typeof input.projectId === 'number' && Number.isFinite(input.projectId) ? { projectId: input.projectId } : {}),
      kind: normalizeDraftKind(input.kind),
      title: normalizeTitle(input.title),
      content: typeof input.content === 'string' ? input.content : '',
      status: 'draft',
      ...(normalizeDraftSource(input.source) ? { source: normalizeDraftSource(input.source) } : {}),
      ...(normalizeDraftTarget(input.target) ? { target: normalizeDraftTarget(input.target) } : {}),
      ...(input.createdByRunId ? { createdByRunId: input.createdByRunId } : {}),
      ...(input.createdByThreadId ? { createdByThreadId: input.createdByThreadId } : {}),
      ...(metadata || seed ? { metadata: { ...(metadata ?? {}), ...(seed ? { seed } : {}) } } : {}),
      createdAt: now,
      updatedAt: now,
    }
    this.drafts.set(draft.id, clone(draft))
    return clone(draft)
  }

  updateDraft(id: string, input: UpdateAgentDraftInput): AgentDraft {
    const current = this.drafts.get(id)
    if (!current) throw new Error(`draft not found: ${id}`)
    const updated: AgentDraft = {
      ...current,
      filePath: current.filePath ?? this.getDraftFilePath(current.id),
      ...(input.status ? { status: input.status } : {}),
      ...(typeof input.title === 'string' ? { title: normalizeTitle(input.title) } : {}),
      ...(typeof input.content === 'string' ? { content: input.content } : {}),
      ...(input.target ? { target: input.target } : {}),
      ...(input.appliedByUserId !== undefined ? { appliedByUserId: input.appliedByUserId } : {}),
      ...(input.appliedAt ? { appliedAt: input.appliedAt } : {}),
      ...(typeof input.rejectedReason === 'string' ? { rejectedReason: input.rejectedReason } : {}),
      ...(input.metadata ? { metadata: { ...(current.metadata ?? {}), ...input.metadata } } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.drafts.set(id, clone(updated))
    return clone(updated)
  }

  patchDraft(id: string, input: PatchAgentDraftInput): AgentDraftPatchResult {
    const current = this.drafts.get(id)
    if (!current) throw new Error(`draft not found: ${id}`)
    if (typeof input.expectedUpdatedAt === 'string' && input.expectedUpdatedAt && input.expectedUpdatedAt !== current.updatedAt) {
      throw new Error(`draft changed since expectedUpdatedAt: ${id}`)
    }
    const ops = normalizePatchOps(input.ops)
    const document = parseDraftDocument(current.content)
    for (const op of ops) {
      applyPatchOp(document, op)
    }
    const updated = this.updateDraft(id, {
      content: JSON.stringify(document, null, 2),
      metadata: {
        ...(normalizeMetadata(input.metadata) ?? {}),
        lastPatchPaths: ops.map((op) => op.path),
      },
    })
    return {
      draft: updated,
      changedPaths: ops.map((op) => op.path),
    }
  }

  getDraft(id: string): AgentDraft | undefined {
    const draft = this.drafts.get(id)
    return draft ? clone(draft) : undefined
  }

  getDraftFilePath(id: string): string {
    return resolve('/movscript-agent/drafts', `${id}.draft`)
  }

  readDraftFile(filePath: string): ReadAgentDraftResult {
    const draft = this.requireDraftByFilePath(filePath)
    const normalizedPath = normalizeFilePath(filePath)
    this.lastReadContentByPath.set(normalizedPath, draft.content)
    return {
      draft: clone(draft),
      filePath: normalizedPath,
      content: draft.content,
    }
  }

  editDraftFile(filePath: string, input: EditAgentDraftInput): EditAgentDraftResult {
    const draft = this.requireDraftByFilePath(filePath)
    const normalizedPath = normalizeFilePath(filePath)
    const lastReadContent = this.lastReadContentByPath.get(normalizedPath)
    if (lastReadContent === undefined) {
      throw new Error(`edit_draft requires reading the file first: ${normalizedPath}`)
    }
    if (lastReadContent !== draft.content) {
      throw new Error(`edit_draft cannot edit stale content; read the file again: ${normalizedPath}`)
    }

    const oldString = normalizeEditString(input.oldString, 'old_string')
    const newString = normalizeEditString(input.newString, 'new_string')
    if (oldString === newString) throw new Error('edit_draft requires new_string to differ from old_string')
    const replaceAll = input.replaceAll === true
    const matches = countOccurrences(draft.content, oldString)
    if (replaceAll) {
      if (matches === 0) throw new Error('edit_draft old_string was not found')
    } else if (matches !== 1) {
      throw new Error(`edit_draft old_string must match exactly once; found ${matches}`)
    }

    const updatedContent = replaceAll
      ? draft.content.split(oldString).join(newString)
      : draft.content.replace(oldString, newString)
    const updated = this.updateDraft(draft.id, { content: updatedContent })
    this.lastReadContentByPath.delete(normalizedPath)
    return {
      draft: updated,
      filePath: normalizedPath,
      replacementCount: matches,
    }
  }

  listDrafts(query: ListAgentDraftsQuery = {}): AgentDraft[] {
    const limit = typeof query.limit === 'number' && Number.isFinite(query.limit)
      ? Math.max(1, Math.min(Math.floor(query.limit), 100))
      : 50
    return Array.from(this.drafts.values())
      .filter((draft) => matchesDraftQuery(draft, query))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((draft) => clone(draft))
  }

  protected loadDrafts(drafts: AgentDraft[]): void {
    for (const draft of drafts) {
      this.drafts.set(draft.id, clone(normalizeStoredDraft(draft)))
    }
  }

  protected allDrafts(): AgentDraft[] {
    return Array.from(this.drafts.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((draft) => clone(draft))
  }

  protected requireDraftByFilePath(filePath: string): AgentDraft {
    const normalizedPath = normalizeFilePath(filePath)
    const draft = Array.from(this.drafts.values()).find((candidate) => normalizeFilePath(candidate.filePath ?? this.getDraftFilePath(candidate.id)) === normalizedPath)
    if (!draft) throw new Error(`draft file not found: ${normalizedPath}`)
    return clone(draft)
  }
}

export class FileAgentDraftStore extends InMemoryAgentDraftStore {
  readonly filePath: string

  constructor(filePath = resolveAgentDraftPath()) {
    super()
    this.filePath = filePath
    this.load()
  }

  override createDraft(input: CreateAgentDraftInput): AgentDraft {
    const draft = super.createDraft(input)
    this.persist()
    return draft
  }

  override updateDraft(id: string, input: UpdateAgentDraftInput): AgentDraft {
    const draft = super.updateDraft(id, input)
    this.persist()
    return draft
  }

  override patchDraft(id: string, input: PatchAgentDraftInput): AgentDraftPatchResult {
    const result = super.patchDraft(id, input)
    this.persist()
    return result
  }

  override getDraftFilePath(id: string): string {
    return contentFilePath(this.filePath, id)
  }

  override readDraftFile(filePath: string): ReadAgentDraftResult {
    const draft = this.requireDraftByFilePath(filePath)
    const normalizedPath = normalizeFilePath(filePath)
    const content = readDraftContent(normalizedPath, draft.content)
    this.lastReadContentByPath.set(normalizedPath, content)
    return {
      draft: clone({ ...draft, content }),
      filePath: normalizedPath,
      content,
    }
  }

  override editDraftFile(filePath: string, input: EditAgentDraftInput): EditAgentDraftResult {
    const normalizedPath = normalizeFilePath(filePath)
    const draft = this.requireDraftByFilePath(normalizedPath)
    const currentContent = readDraftContent(normalizedPath, draft.content)
    const lastReadContent = this.lastReadContentByPath.get(normalizedPath)
    if (lastReadContent === undefined) {
      throw new Error(`edit_draft requires reading the file first: ${normalizedPath}`)
    }
    if (lastReadContent !== currentContent) {
      throw new Error(`edit_draft cannot edit stale content; read the file again: ${normalizedPath}`)
    }
    const oldString = normalizeEditString(input.oldString, 'old_string')
    const newString = normalizeEditString(input.newString, 'new_string')
    if (oldString === newString) throw new Error('edit_draft requires new_string to differ from old_string')
    const replaceAll = input.replaceAll === true
    const matches = countOccurrences(currentContent, oldString)
    if (replaceAll) {
      if (matches === 0) throw new Error('edit_draft old_string was not found')
    } else if (matches !== 1) {
      throw new Error(`edit_draft old_string must match exactly once; found ${matches}`)
    }

    const updatedContent = replaceAll
      ? currentContent.split(oldString).join(newString)
      : currentContent.replace(oldString, newString)
    writeDraftContent(normalizedPath, updatedContent)
    const updated = super.updateDraft(draft.id, { content: updatedContent })
    this.lastReadContentByPath.delete(normalizedPath)
    this.persist()
    return {
      draft: updated,
      filePath: normalizedPath,
      replacementCount: matches,
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as { version?: number; drafts?: unknown[] }
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts.flatMap((draft) => normalizeStoredDraftRecord(draft)) : []
    this.loadDrafts(drafts.map((draft) => {
      const filePath = this.getDraftFilePath(draft.id)
      const fileContent = readDraftContent(filePath, draft.content)
      return {
        ...draft,
        filePath,
        content: fileContent,
      }
    }))
  }

  private persist(): void {
    atomicWriteJSON(this.filePath, {
      version: 2,
      drafts: this.allDrafts(),
    })
    mkdirSync(dirname(this.filePath), { recursive: true })
    for (const draft of this.allDrafts()) {
      writeDraftContent(this.getDraftFilePath(draft.id), draft.content)
    }
  }
}

export function resolveAgentDraftPath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_DRAFT_PATH) return process.env.MOVSCRIPT_AGENT_DRAFT_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.drafts.json')
  return join(statePath, 'drafts.json')
}

function contentFilePath(indexFilePath: string, draftId: string): string {
  return join(dirname(indexFilePath), 'draft-files', `${draftId}.draft`)
}

function readDraftContent(filePath: string, fallback: string): string {
  if (!existsSync(filePath)) {
    writeDraftContent(filePath, fallback)
    return fallback
  }
  return readFileSync(filePath, 'utf8')
}

function writeDraftContent(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

function normalizeFilePath(filePath: string): string {
  return resolve(filePath)
}

function normalizeEditString(value: unknown, field: 'old_string' | 'new_string'): string {
  if (typeof value !== 'string') throw new Error(`edit_draft requires ${field}`)
  return value
}

function normalizeStoredDraftRecord(value: unknown): AgentDraft[] {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return []
  return [normalizeStoredDraft({
    ...(value as unknown as AgentDraft),
    id: value.id.trim(),
  })]
}

function countOccurrences(text: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let index = 0
  while (true) {
    const next = text.indexOf(needle, index)
    if (next === -1) return count
    count += 1
    index = next + needle.length
  }
}

export function normalizeDraftKind(value: unknown): AgentDraftKind {
  return typeof value === 'string' && (DRAFT_KIND_VALUES as readonly string[]).includes(value)
    ? value as AgentDraftKind
    : 'note'
}

export function validateDraft(draft: AgentDraft): AgentDraftValidationResult {
  const issues: AgentDraftValidationIssue[] = []
  if (!draft.title.trim()) {
    issues.push({ path: '/title', message: 'Draft title is required.', severity: 'error' })
  }
  if (!draft.content.trim()) {
    issues.push({ path: '/content', message: 'Draft content is required.', severity: 'error' })
  }
  if (draft.kind === 'script_split_proposal') {
    validateScriptSplitDraft(draft, issues)
  } else if (draft.kind === 'setting_proposal') {
    validateProjectProposalDraft(draft, issues, { kind: 'setting' })
  } else if (draft.kind === 'project_proposal') {
    validateProjectProposalDraft(draft, issues, { kind: 'project_standards' })
  } else if (draft.kind === 'content_unit_proposal') {
    validateContentUnitProposalDraft(draft, issues)
  } else if (draft.kind === 'asset_proposal') {
    validateAssetProposalDraft(draft, issues)
  } else if (draft.kind === 'content_unit_media_proposal') {
    validateContentUnitMediaProposalDraft(draft, issues)
  } else if (draft.kind === 'production_proposal') {
    validateProductionProposalDraft(draft, issues)
  }
  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    draftId: draft.id,
    kind: draft.kind,
    issues,
  }
}

export function normalizeDraftStatus(value: unknown): AgentDraftStatus | undefined {
  return value === 'draft'
    || value === 'accepted'
    || value === 'rejected'
    || value === 'applied'
    || value === 'superseded'
    ? value
    : undefined
}

function normalizeTitle(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'Untitled draft'
}

function normalizeDraftSource(value: unknown): AgentDraftSource | undefined {
  if (!isRecord(value)) return undefined
  return clone(value) as AgentDraftSource
}

function normalizeDraftTarget(value: unknown): AgentDraftTarget | undefined {
  if (!isRecord(value)) return undefined
  return clone(value) as AgentDraftTarget
}

function normalizeMetadata(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  return clone(value) as Record<string, JSONValue>
}

function normalizeDraftSeed(value: unknown): JSONValue | undefined {
  if (!isJSONValue(value)) return undefined
  return clone(value)
}

function normalizePatchOps(value: unknown): AgentDraftPatchOp[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('patch_draft requires non-empty ops')
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('patch op must be an object')
    const op = item.op
    const path = item.path
    if (op !== 'add' && op !== 'replace' && op !== 'remove') throw new Error(`unsupported patch op: ${String(op)}`)
    if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('patch op path must be a JSON pointer')
    if (op !== 'remove' && !isJSONValue(item.value)) throw new Error(`patch op ${op} requires JSON value`)
    return {
      op,
      path,
      ...(op !== 'remove' ? { value: item.value as JSONValue } : {}),
    }
  })
}

function parseDraftDocument(content: string): JSONValue {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!isJSONValue(parsed)) throw new Error('draft content is not JSON value')
    return parsed
  } catch (error) {
    throw new Error(`patch_draft requires JSON draft content: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function applyPatchOp(document: JSONValue, op: AgentDraftPatchOp): void {
  const segments = decodeJSONPointer(op.path)
  if (segments.length === 0) throw new Error('patch_draft cannot replace the draft root')
  const parent = resolvePatchParent(document, segments)
  const key = segments[segments.length - 1]
  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`invalid array path: ${op.path}`)
    if (op.op === 'remove') {
      if (index >= parent.length) throw new Error(`array path does not exist: ${op.path}`)
      parent.splice(index, 1)
      return
    }
    if (op.op === 'replace') {
      if (index >= parent.length) throw new Error(`array path does not exist: ${op.path}`)
      parent[index] = op.value ?? null
      return
    }
    parent.splice(index, 0, op.value ?? null)
    return
  }
  if (!isRecord(parent)) throw new Error(`patch parent is not an object: ${op.path}`)
  if (op.op === 'remove') {
    if (!(key in parent)) throw new Error(`object path does not exist: ${op.path}`)
    delete parent[key]
    return
  }
  if (op.op === 'replace' && !(key in parent)) throw new Error(`object path does not exist: ${op.path}`)
  parent[key] = op.value ?? null
}

function decodeJSONPointer(path: string): string[] {
  if (path === '/') return ['']
  return path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function resolvePatchParent(document: JSONValue, segments: string[]): JSONValue {
  let current: JSONValue = document
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) throw new Error(`array path does not exist: /${segments.join('/')}`)
      current = current[index] as JSONValue
      continue
    }
    if (!isRecord(current) || !(segment in current)) throw new Error(`object path does not exist: /${segments.join('/')}`)
    current = current[segment] as JSONValue
  }
  return current
}

function validateScriptSplitDraft(draft: AgentDraft, issues: AgentDraftValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Script split draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Script split draft content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== DRAFT_CONTENT_SCHEMA_IDS.scriptSplit) {
    issues.push({ path: '/schema', message: `Script split draft schema must be ${DRAFT_CONTENT_SCHEMA_IDS.scriptSplit}.`, severity: 'error' })
  }
  if (!isRecord(parsed.global_settings)) {
    issues.push({ path: '/global_settings', message: 'Script split draft requires global_settings.', severity: 'error' })
  }
  if (!isRecord(parsed.source_script)) {
    issues.push({ path: '/source_script', message: 'Script split draft requires source_script.', severity: 'error' })
  } else {
    if (numberValue(parsed.source_script.line_count ?? parsed.source_script.lineCount) === undefined) {
      issues.push({ path: '/source_script/line_count', message: 'Script split draft requires source_script.line_count.', severity: 'error' })
    }
    if (hasScriptSplitBodyText(parsed.source_script)) {
      issues.push({ path: '/source_script/content', message: 'Script split draft must not store source script body text; use line_count and episode line ranges.', severity: 'error' })
    }
  }
  const episodes = parsed.episode_drafts
  if (!Array.isArray(episodes) || episodes.length === 0) {
    issues.push({ path: '/episode_drafts', message: 'Script split draft requires at least one episode draft.', severity: 'error' })
    return
  }
  episodes.forEach((episode, index) => {
    const base = `/episode_drafts/${index}`
    if (!isRecord(episode)) {
      issues.push({ path: base, message: 'Episode draft must be an object.', severity: 'error' })
      return
    }
    for (const key of ['order', 'title', 'summary', 'action', 'existing_script_id']) {
      if (!(key in episode)) issues.push({ path: `${base}/${key}`, message: `Episode draft missing ${key}.`, severity: 'error' })
    }
    const startLine = numberValue(episode.start_line ?? episode.startLine ?? episode.start)
    const endLine = numberValue(episode.end_line ?? episode.endLine ?? episode.end)
    if (startLine === undefined || startLine < 1) {
      issues.push({ path: `${base}/start_line`, message: 'Episode draft requires a valid start_line.', severity: 'error' })
    }
    if (endLine === undefined || endLine < 1) {
      issues.push({ path: `${base}/end_line`, message: 'Episode draft requires a valid end_line.', severity: 'error' })
    } else if (startLine !== undefined && endLine < startLine) {
      issues.push({ path: `${base}/end_line`, message: 'Episode draft end_line must be greater than or equal to start_line.', severity: 'error' })
    }
    if (hasScriptSplitBodyText(episode)) {
      issues.push({ path: `${base}/content`, message: 'Episode draft must not store script body text; use start_line/end_line.', severity: 'error' })
    }
    if (!isRecord(episode.global_context)) {
      issues.push({ path: `${base}/global_context`, message: 'Episode draft requires global_context.', severity: 'error' })
    }
    const productionAction = typeof episode.production_action === 'string'
      ? episode.production_action
      : typeof episode.productionAction === 'string'
        ? episode.productionAction
        : ''
    if (productionAction && !['create', 'update', 'skip'].includes(productionAction)) {
      issues.push({ path: `${base}/production_action`, message: 'Episode draft production_action must be create, update, or skip.', severity: 'error' })
    }
    const explicitProductionId = episode.existing_production_id ?? episode.existingProductionId
    const existingProductionId = numberValue(explicitProductionId)
    if (explicitProductionId !== undefined && explicitProductionId !== null && (existingProductionId === undefined || existingProductionId <= 0)) {
      issues.push({ path: `${base}/existing_production_id`, message: 'Episode draft existing_production_id must be a positive id or null.', severity: 'error' })
    }
  })
}

function validateProjectProposalDraft(
  draft: AgentDraft,
  issues: AgentDraftValidationIssue[],
  options: { kind: 'legacy' | 'setting' | 'asset_requirement' | 'project_standards' } = { kind: 'legacy' },
): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Project proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Project proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  const expectedSchema = options.kind === 'setting'
    ? DRAFT_CONTENT_SCHEMA_IDS.settingProposal
    : options.kind === 'asset_requirement'
      ? DRAFT_CONTENT_SCHEMA_IDS.assetProposal
      : DRAFT_CONTENT_SCHEMA_IDS.projectProposal
  const expectedScope = options.kind === 'setting'
    ? 'setting_proposal'
    : options.kind === 'asset_requirement'
      ? 'asset_proposal'
      : 'project_proposal'
  if (parsed.schema !== expectedSchema) {
    issues.push({ path: '/schema', message: `Project-level proposal draft schema must be ${expectedSchema}.`, severity: 'error' })
  }
  if (parsed.scope !== expectedScope) {
    issues.push({ path: '/scope', message: `Project-level proposal draft scope must be ${expectedScope}.`, severity: 'error' })
  }
  if (parsed.mode !== 'snapshot') {
    issues.push({ path: '/mode', message: 'Project proposal draft mode must be "snapshot".', severity: 'error' })
  }

  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Project proposal draft requires proposal.', severity: 'error' })
    return
  }

  if (options.kind === 'project_standards') {
    validateEmptyProjectProposalArray('creative_references', proposal.creative_references, issues)
    validateEmptyProjectProposalArray('asset_slots', proposal.asset_slots, issues)
    if (!isRecord(proposal.project_style)) {
      issues.push({ path: '/proposal/project_style', message: 'Project standards proposal requires proposal.project_style.', severity: 'error' })
    }
  } else {
    validateProjectProposalPatchArray('creative_references', proposal.creative_references, issues)
    validateProjectProposalPatchArray('asset_slots', proposal.asset_slots, issues)
    if (options.kind === 'setting') {
      validateEmptyProjectProposalArray('asset_slots', proposal.asset_slots, issues)
    }
    if (options.kind === 'asset_requirement') {
      validateEmptyProjectProposalArray('creative_references', proposal.creative_references, issues)
    }
  }

  if (parsed.operations !== undefined) {
      issues.push({
        path: '/operations',
        message: 'Project proposal drafts must not include operations; edit the proposed backend snapshot directly.',
        severity: 'error',
      })
  }
}

function validateEmptyProjectProposalArray(
  key: 'creative_references' | 'asset_slots',
  value: unknown,
  issues: AgentDraftValidationIssue[],
): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: `/proposal/${key}`, message: `${key} must be an array when present.`, severity: 'error' })
    return
  }
  if (value.length > 0) {
    issues.push({ path: `/proposal/${key}`, message: `${key} is outside this proposal boundary. Use the dedicated proposal kind instead.`, severity: 'error' })
  }
}

function validateAssetProposalDraft(draft: AgentDraft, issues: AgentDraftValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Asset proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Asset proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== DRAFT_CONTENT_SCHEMA_IDS.assetProposal) {
    issues.push({ path: '/schema', message: `Asset proposal draft schema must be ${DRAFT_CONTENT_SCHEMA_IDS.assetProposal}.`, severity: 'error' })
  }
  if (parsed.scope !== 'asset_proposal') {
    issues.push({ path: '/scope', message: 'Asset proposal draft scope must be asset_proposal.', severity: 'error' })
  }
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Asset proposal draft requires proposal.', severity: 'error' })
    return
  }
  const requirementItems = Array.isArray(proposal.asset_slots) ? proposal.asset_slots : []
  if (proposal.asset_slots !== undefined) {
    validateProjectProposalPatchArray('asset_slots', proposal.asset_slots, issues)
  }
  if (proposal.creative_references !== undefined) {
    validateEmptyProjectProposalArray('creative_references', proposal.creative_references, issues)
  }
  const plans = proposal.candidate_plans
  if (plans !== undefined && !Array.isArray(plans)) {
    issues.push({ path: '/proposal/candidate_plans', message: 'Asset proposal candidate_plans must be an array.', severity: 'error' })
    return
  }
  const candidatePlans = Array.isArray(plans) ? plans : []
  const hasRequirementItems = requirementItems.length > 0
  const hasCandidatePlans = candidatePlans.length > 0
  if (!hasRequirementItems && !hasCandidatePlans) {
    issues.push({ path: '/proposal', message: 'Asset proposal draft requires proposal.asset_slots or proposal.candidate_plans.', severity: 'warning' })
  }
  const assetSlotId = numberValue(parsed.assetSlotId ?? parsed.asset_slot_id)
  if (hasCandidatePlans && (assetSlotId === undefined || assetSlotId <= 0)) {
    issues.push({ path: '/assetSlotId', message: 'Asset proposal candidate plans require a positive assetSlotId.', severity: 'error' })
  }
  const slot = isRecord(parsed.slot) ? parsed.slot : undefined
  if (hasCandidatePlans && !slot) {
    issues.push({ path: '/slot', message: 'Asset proposal draft requires slot.', severity: 'error' })
  } else if (slot) {
    const slotId = numberValue(slot.id ?? slot.ID)
    if (slotId === undefined || slotId <= 0) {
      issues.push({ path: '/slot/id', message: 'Asset proposal slot requires a positive id.', severity: 'error' })
    }
    if (assetSlotId !== undefined && slotId !== undefined && assetSlotId !== slotId) {
      issues.push({ path: '/slot/id', message: 'Asset proposal slot.id must match assetSlotId.', severity: 'error' })
    }
    if (typeof slot.name !== 'string' || !slot.name.trim()) {
      issues.push({ path: '/slot/name', message: 'Asset proposal slot requires name.', severity: 'error' })
    }
    if (typeof slot.kind !== 'string' || !slot.kind.trim()) {
      issues.push({ path: '/slot/kind', message: 'Asset proposal slot requires kind.', severity: 'error' })
    }
  }

  candidatePlans.forEach((plan, index) => {
    const base = `/proposal/candidate_plans/${index}`
    if (!isRecord(plan)) {
      issues.push({ path: base, message: 'Asset proposal candidate plan must be an object.', severity: 'error' })
      return
    }
    const outputKind = typeof plan.output_kind === 'string' ? plan.output_kind : ''
    if (!['image', 'video', 'audio', 'text', 'file'].includes(outputKind)) {
      issues.push({ path: `${base}/output_kind`, message: 'Asset proposal candidate plan output_kind must be image, video, audio, text, or file.', severity: 'error' })
    }
    if (typeof plan.prompt !== 'string' || !plan.prompt.trim()) {
      issues.push({ path: `${base}/prompt`, message: 'Asset proposal candidate plan requires prompt.', severity: 'error' })
    }
    if (!Array.isArray(plan.input_resource_ids)) {
      issues.push({ path: `${base}/input_resource_ids`, message: 'Asset proposal candidate plan requires input_resource_ids array.', severity: 'error' })
    } else {
      plan.input_resource_ids.forEach((value, resourceIndex) => {
        const resourceId = numberValue(value)
        if (resourceId === undefined || resourceId <= 0) {
          issues.push({ path: `${base}/input_resource_ids/${resourceIndex}`, message: 'Asset proposal input resource ids must be positive numbers.', severity: 'error' })
        }
      })
    }
    if (!Array.isArray(plan.acceptance_criteria) || plan.acceptance_criteria.length === 0) {
      issues.push({ path: `${base}/acceptance_criteria`, message: 'Asset proposal candidate plan requires acceptance_criteria.', severity: 'warning' })
    }
    const modelCapability = typeof plan.model_capability === 'string' ? plan.model_capability : ''
    if (modelCapability && !['image', 'image_edit', 'video', 'video_i2v'].includes(modelCapability)) {
      issues.push({ path: `${base}/model_capability`, message: 'Asset proposal model_capability must be image, image_edit, video, or video_i2v.', severity: 'error' })
    }
  })
}

function validateContentUnitProposalDraft(draft: AgentDraft, issues: AgentDraftValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Content unit proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Content unit proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== DRAFT_CONTENT_SCHEMA_IDS.contentUnitProposal) {
    issues.push({ path: '/schema', message: `Content unit proposal draft schema must be ${DRAFT_CONTENT_SCHEMA_IDS.contentUnitProposal}.`, severity: 'error' })
  }
  if (parsed.scope !== 'content_unit_proposal') {
    issues.push({ path: '/scope', message: 'Content unit proposal draft scope must be content_unit_proposal.', severity: 'error' })
  }
  if (numberValue(parsed.productionId ?? parsed.production_id) === undefined) {
    issues.push({ path: '/productionId', message: 'Content unit proposal draft requires productionId.', severity: 'error' })
  }
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Content unit proposal draft requires proposal.', severity: 'error' })
    return
  }
  const units = Array.isArray(proposal.units) ? proposal.units : []
  if (units.length === 0) {
    issues.push({ path: '/proposal/units', message: 'Content unit proposal draft requires at least one content unit.', severity: 'error' })
    return
  }
  const allowedKinds = new Set(['shot', 'visual_segment', 'caption_card', 'narration', 'transition', 'music_beat', 'product_showcase'])
  units.forEach((unit, index) => {
    const base = `/proposal/units/${index}`
    if (!isRecord(unit)) {
      issues.push({ path: base, message: 'Content unit proposal unit must be an object.', severity: 'error' })
      return
    }
    if (typeof unit.title !== 'string' || !unit.title.trim()) {
      issues.push({ path: `${base}/title`, message: 'Content unit proposal unit requires title.', severity: 'error' })
    }
    if ('action' in unit) {
      issues.push({ path: `${base}/action`, message: 'Content unit proposal uses snapshot mode; remove operation fields and provide the complete proposed unit snapshot.', severity: 'error' })
    }
    const kind = typeof unit.kind === 'string' ? unit.kind.trim() : ''
    if (!allowedKinds.has(kind)) {
      issues.push({ path: `${base}/kind`, message: 'Content unit proposal unit kind must be shot, visual_segment, caption_card, narration, transition, music_beat, or product_showcase.', severity: 'error' })
    }
  })
}

function validateContentUnitMediaProposalDraft(draft: AgentDraft, issues: AgentDraftValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Content unit media proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Content unit media proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== DRAFT_CONTENT_SCHEMA_IDS.contentUnitMediaProposal) {
    issues.push({ path: '/schema', message: `Content unit media proposal draft schema must be ${DRAFT_CONTENT_SCHEMA_IDS.contentUnitMediaProposal}.`, severity: 'error' })
  }
  if (parsed.scope !== 'content_unit_media_proposal') {
    issues.push({ path: '/scope', message: 'Content unit media proposal draft scope must be content_unit_media_proposal.', severity: 'error' })
  }
  if (numberValue(parsed.contentUnitId ?? parsed.content_unit_id) === undefined) {
    issues.push({ path: '/contentUnitId', message: 'Content unit media proposal draft requires contentUnitId.', severity: 'error' })
  }
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Content unit media proposal draft requires proposal.', severity: 'error' })
    return
  }
  const outputs = Array.isArray(proposal.outputs) ? proposal.outputs : []
  if (outputs.length === 0) {
    issues.push({ path: '/proposal/outputs', message: 'Content unit media proposal draft requires at least one output plan.', severity: 'error' })
    return
  }
  outputs.forEach((output, index) => {
    const base = `/proposal/outputs/${index}`
    if (!isRecord(output)) {
      issues.push({ path: base, message: 'Content unit media output plan must be an object.', severity: 'error' })
      return
    }
    const outputKind = typeof output.output_kind === 'string' ? output.output_kind.trim() : ''
    if (!['image', 'video'].includes(outputKind)) {
      issues.push({ path: `${base}/output_kind`, message: 'Content unit media output kind must be image or video.', severity: 'error' })
    }
    if (typeof output.prompt !== 'string' || !output.prompt.trim()) {
      issues.push({ path: `${base}/prompt`, message: 'Content unit media output plan requires prompt.', severity: 'error' })
    }
  })
}

function validateProductionProposalDraft(draft: AgentDraft, issues: AgentDraftValidationIssue[]): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    issues.push({ path: '/content', message: 'Production proposal draft content must be valid JSON.', severity: 'error' })
    return
  }
  if (!isRecord(parsed)) {
    issues.push({ path: '/content', message: 'Production proposal draft content must be a JSON object.', severity: 'error' })
    return
  }
  if (parsed.schema !== DRAFT_CONTENT_SCHEMA_IDS.productionProposal) {
    issues.push({ path: '/schema', message: `Production proposal draft schema must be ${DRAFT_CONTENT_SCHEMA_IDS.productionProposal}.`, severity: 'error' })
  }
  if (numberValue(parsed.productionId ?? parsed.production_id) === undefined) {
    issues.push({ path: '/productionId', message: 'Production proposal draft requires productionId.', severity: 'error' })
  }
  if (parsed.mode !== 'snapshot') {
    issues.push({ path: '/mode', message: 'Production proposal draft requires mode "snapshot".', severity: 'error' })
  }
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : undefined
  if (!proposal) {
    issues.push({ path: '/proposal', message: 'Production proposal draft requires proposal.', severity: 'error' })
    return
  }
  const segments = Array.isArray(proposal.segments) ? proposal.segments : []
  if (segments.length === 0) {
    issues.push({ path: '/proposal/segments', message: 'Production proposal draft requires at least one segment.', severity: 'error' })
    return
  }
  segments.forEach((segment, segmentIndex) => {
    const base = `/proposal/segments/${segmentIndex}`
    if (!isRecord(segment)) {
      issues.push({ path: base, message: 'Production proposal segment must be an object.', severity: 'error' })
      return
    }
    if (segment.action !== undefined) {
      issues.push({ path: `${base}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof segment.title !== 'string' || !segment.title.trim()) {
      issues.push({ path: `${base}/title`, message: 'Production proposal segment requires title.', severity: 'error' })
    }
    const sceneMoments = Array.isArray(segment.scene_moments) ? segment.scene_moments : []
    if (sceneMoments.length === 0) {
      issues.push({ path: `${base}/scene_moments`, message: 'Production proposal segment requires at least one scene moment.', severity: 'warning' })
    }
    sceneMoments.forEach((sceneMoment, sceneIndex) => {
      const sceneBase = `${base}/scene_moments/${sceneIndex}`
      if (!isRecord(sceneMoment)) {
        issues.push({ path: sceneBase, message: 'Scene moment must be an object.', severity: 'error' })
        return
      }
      if (sceneMoment.action !== undefined) {
        issues.push({ path: `${sceneBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
      }
      if (typeof sceneMoment.title !== 'string' || !sceneMoment.title.trim()) {
        issues.push({ path: `${sceneBase}/title`, message: 'Scene moment requires title.', severity: 'error' })
      }
      const creativeReferences = Array.isArray(sceneMoment.creative_references) ? sceneMoment.creative_references : []
      const assetSlots = Array.isArray(sceneMoment.asset_slots) ? sceneMoment.asset_slots : []
      creativeReferences.forEach((reference, referenceIndex) => {
        const referenceBase = `${sceneBase}/creative_references/${referenceIndex}`
        if (!isRecord(reference)) {
          issues.push({ path: referenceBase, message: 'Creative reference binding must be an object.', severity: 'error' })
          return
        }
        if (reference.action !== undefined) {
          issues.push({ path: `${referenceBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
        }
        if (numberValue(reference.id) === undefined) {
          issues.push({ path: `${referenceBase}/id`, message: 'Production proposal creative_reference must reference an existing project-level id.', severity: 'error' })
        }
      })
      assetSlots.forEach((slot, slotIndex) => {
        const slotBase = `${sceneBase}/asset_slots/${slotIndex}`
        if (!isRecord(slot)) {
          issues.push({ path: slotBase, message: 'Asset slot must be an object.', severity: 'error' })
          return
        }
        if (slot.action !== undefined) {
          issues.push({ path: `${slotBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
        }
      })
      if (creativeReferences.length === 0 && assetSlots.length === 0) {
        issues.push({
          path: sceneBase,
          message: 'Scene moment has no creative_references or asset_slots; downstream generation context may be incomplete.',
          severity: 'warning',
        })
      }
      validateProductionProposalContentUnits(sceneMoment.content_units, `${sceneBase}/content_units`, issues)
      validateProductionProposalKeyframes(sceneMoment.keyframes, `${sceneBase}/keyframes`, issues)
    })
  })
}

function validateProductionProposalContentUnits(value: unknown, basePath: string, issues: AgentDraftValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: basePath, message: 'Production proposal content_units must be an array.', severity: 'error' })
    return
  }
  value.forEach((unit, index) => {
    const unitBase = `${basePath}/${index}`
    if (!isRecord(unit)) {
      issues.push({ path: unitBase, message: 'Content unit must be an object.', severity: 'error' })
      return
    }
    if (unit.action !== undefined) {
      issues.push({ path: `${unitBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof unit.title !== 'string' || !unit.title.trim()) {
      issues.push({ path: `${unitBase}/title`, message: 'Content unit requires title.', severity: 'error' })
    }
    validateProductionProposalKeyframes(unit.keyframes, `${unitBase}/keyframes`, issues)
  })
}

function validateProductionProposalKeyframes(value: unknown, basePath: string, issues: AgentDraftValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: basePath, message: 'Production proposal keyframes must be an array.', severity: 'error' })
    return
  }
  value.forEach((keyframe, index) => {
    const keyframeBase = `${basePath}/${index}`
    if (!isRecord(keyframe)) {
      issues.push({ path: keyframeBase, message: 'Keyframe must be an object.', severity: 'error' })
      return
    }
    if (keyframe.action !== undefined) {
      issues.push({ path: `${keyframeBase}/action`, message: 'Production proposal snapshot must not include action fields.', severity: 'error' })
    }
    if (typeof keyframe.title !== 'string' || !keyframe.title.trim()) {
      issues.push({ path: `${keyframeBase}/title`, message: 'Keyframe requires title.', severity: 'error' })
    }
  })
}

function validateProjectProposalPatchArray(
  key: 'creative_references' | 'asset_slots',
  value: unknown,
  issues: AgentDraftValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path: `/proposal/${key}`, message: `Project proposal draft requires proposal.${key}.`, severity: 'error' })
    return
  }
  value.forEach((item, index) => {
    const base = `/proposal/${key}/${index}`
    if (!isRecord(item)) {
      issues.push({ path: base, message: 'Project proposal node must be an object.', severity: 'error' })
      return
    }
    validateProjectProposalPatchNode(item, key, base, issues)
  })
}

function validateProjectProposalPatchNode(
  node: Record<string, unknown>,
  key: 'creative_references' | 'asset_slots',
  basePath: string,
  issues: AgentDraftValidationIssue[],
): void {
  const allowedKeys = key === 'creative_references'
    ? new Set(['client_id', 'id', 'merge_candidates', 'source_script_id', 'source_analysis_id', 'kind', 'name', 'alias', 'description', 'content', 'importance', 'status', 'profile_json', 'tags_json'])
    : new Set(['client_id', 'id', 'owner', 'production_id', 'creative_reference_id', 'creative_reference_state_id', 'owner_type', 'owner_id', 'kind', 'name', 'description', 'slot_key', 'prompt_hint', 'status', 'priority', 'resource_id', 'locked_asset_slot_id', 'metadata_json'])
  for (const nodeKey of Object.keys(node)) {
    if (!allowedKeys.has(nodeKey)) {
      issues.push({
        path: `${basePath}/${nodeKey}`,
        message: 'Project proposal snapshot nodes only allow direct backend snapshot fields. Do not use fields wrappers or action fields.',
        severity: 'error',
      })
    }
  }
  for (const forbidden of ['action', 'entity', 'target_id', 'targetId', 'source_ids', 'sourceIds', 'payload']) {
    if (node[forbidden] !== undefined) {
      issues.push({
        path: `${basePath}/${forbidden}`,
        message: 'Project proposal nodes are editable snapshot rows; do not use operation fields.',
        severity: 'error',
      })
    }
  }
  const id = numberValue(node.id)
  if (node.id !== undefined && (id === undefined || id <= 0)) {
    issues.push({ path: `${basePath}/id`, message: 'Project proposal id must be a positive existing entity id when present.', severity: 'error' })
  }
  if (node.fields !== undefined) {
    issues.push({ path: `${basePath}/fields`, message: 'Project proposal snapshot nodes must put editable values directly on the node; fields is deprecated.', severity: 'error' })
  }
  if (id === undefined && !snapshotNodeName(node)) {
    issues.push({ path: `${basePath}/name`, message: `New project proposal ${key} entries require name.`, severity: 'error' })
  }
  if (key === 'creative_references') {
    validateProjectProposalMergeCandidates(node.merge_candidates, id, basePath, issues)
  }
  if (key === 'asset_slots') {
    validateProjectProposalOwner(node.owner, basePath, issues)
    const ownerType = isRecord(node.owner) ? node.owner.type : node.owner_type
    if (typeof ownerType === 'string' && ownerType.trim() && !isProjectProposalAssetSlotOwnerType(ownerType)) {
      issues.push({
        path: isRecord(node.owner) ? `${basePath}/owner/type` : `${basePath}/owner_type`,
        message: 'Project proposal asset slot owner type must use a backend snake_case owner type such as creative_reference, scene_moment, or content_unit.',
        severity: 'error',
      })
    }
  }
}

function validateProjectProposalMergeCandidates(value: unknown, targetID: number | undefined, basePath: string, issues: AgentDraftValidationIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path: `${basePath}/merge_candidates`, message: 'Project proposal merge_candidates must be an array.', severity: 'error' })
    return
  }
  if (targetID === undefined) {
    issues.push({ path: `${basePath}/merge_candidates`, message: 'Project proposal merge_candidates require the target creative reference id on the same node.', severity: 'error' })
  }
  value.forEach((candidate, index) => {
    const path = `${basePath}/merge_candidates/${index}`
    if (!isRecord(candidate)) {
      issues.push({ path, message: 'Project proposal merge candidate must be an object.', severity: 'error' })
      return
    }
    const sourceID = numberValue(candidate.source_id)
    if (sourceID === undefined || sourceID <= 0) {
      issues.push({ path: `${path}/source_id`, message: 'Project proposal merge candidate requires a positive source_id.', severity: 'error' })
    }
    if (targetID !== undefined && sourceID === targetID) {
      issues.push({ path: `${path}/source_id`, message: 'Project proposal merge candidate source_id must not equal the target id.', severity: 'error' })
    }
  })
}

function validateProjectProposalOwner(value: unknown, basePath: string, issues: AgentDraftValidationIssue[]): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    issues.push({ path: `${basePath}/owner`, message: 'Project proposal owner must be an object.', severity: 'error' })
    return
  }
  const id = numberValue(value.id)
  const clientID = typeof value.client_id === 'string' && value.client_id.trim() ? value.client_id.trim() : ''
  if (value.id !== undefined && (id === undefined || id <= 0)) {
    issues.push({ path: `${basePath}/owner/id`, message: 'Project proposal owner.id must be a positive id when present.', severity: 'error' })
  }
  if (id === undefined && !clientID) {
    issues.push({ path: `${basePath}/owner`, message: 'Project proposal owner requires id or client_id when present.', severity: 'error' })
  }
}

function isProjectProposalAssetSlotOwnerType(value: string): boolean {
  return new Set([
    'creative_reference',
    'creative_reference_state',
    'segment',
    'scene_moment',
    'content_unit',
    'storyboard_line',
    'keyframe',
  ]).has(value.trim())
}

function snapshotNodeName(node: Record<string, unknown>): boolean {
  return typeof node.name === 'string' && node.name.trim().length > 0
}

function hasScriptSplitBodyText(value: Record<string, unknown>): boolean {
  return ['content', 'text', 'body', 'rawText', 'raw_text', 'sourceText', 'source_text']
    .some((key) => typeof value[key] === 'string' && value[key].trim().length > 0)
}

function normalizeStoredDraft(draft: AgentDraft): AgentDraft {
  const now = new Date().toISOString()
  return {
    ...draft,
    filePath: draft.filePath ?? resolve('/movscript-agent/drafts', `${draft.id}.draft`),
    kind: normalizeDraftKind(draft.kind),
    title: normalizeTitle(draft.title),
    content: typeof draft.content === 'string' ? draft.content : '',
    status: normalizeDraftStatus(draft.status) ?? 'draft',
    createdAt: typeof draft.createdAt === 'string' ? draft.createdAt : now,
    updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : now,
  }
}

function matchesDraftQuery(draft: AgentDraft, query: ListAgentDraftsQuery): boolean {
  if (typeof query.projectId === 'number' && draft.projectId !== query.projectId) return false
  if (query.kind && draft.kind !== query.kind) return false
  if (query.status && draft.status !== query.status) return false
  if (query.statuses && query.statuses.length > 0 && !query.statuses.includes(draft.status)) return false
  if (query.threadId && draft.createdByThreadId !== query.threadId && draft.source?.threadId !== query.threadId) return false
  if (query.runId && draft.createdByRunId !== query.runId && draft.source?.runId !== query.runId) return false
  if (query.sourceEntityType && draft.source?.entityType !== query.sourceEntityType) return false
  if (query.sourceEntityId !== undefined && draft.source?.entityId !== query.sourceEntityId) return false
  if (query.pageKey && draft.source?.pageKey !== query.pageKey) return false
  if (query.pageType && draft.source?.pageType !== query.pageType) return false
  if (query.pageRoute && draft.source?.pageRoute !== query.pageRoute) return false
  if (query.pageEntityType && draft.source?.pageEntityType !== query.pageEntityType) return false
  if (query.pageEntityId !== undefined && draft.source?.pageEntityId !== query.pageEntityId) return false
  return true
}

function makeDraftId(): string {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

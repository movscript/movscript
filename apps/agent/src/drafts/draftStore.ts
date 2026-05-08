import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JSONValue } from '../types.js'
import { atomicWriteJSON, resolveAgentStatePath } from '../runtime/store/fileStore.js'

// AgentDraft is a local runtime/client review artifact. It is the protocol shape
// used to pass proposed changes to the UI for preview, revision, approval, or
// rejection. It is not a formal backend domain entity until a separate apply
// flow writes accepted content to backend APIs.
export type AgentDraftKind =
  | 'script_split'
  | 'script'
  | 'asset_slot'
  | 'storyboard_line'
  | 'content_unit'
  | 'prompt'
  | 'note'
  | 'pipeline'
  | 'segment'
  | 'scene_moment'
  | 'production_proposal'
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
  createdByRunId?: string
  createdByThreadId?: string
  metadata?: unknown
}

export interface ListAgentDraftsQuery {
  projectId?: number
  kind?: AgentDraftKind
  status?: AgentDraftStatus
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
  getDraft(id: string): AgentDraft | undefined
  listDrafts(query?: ListAgentDraftsQuery): AgentDraft[]
}

export class InMemoryAgentDraftStore implements AgentDraftStore {
  private readonly drafts = new Map<string, AgentDraft>()

  createDraft(input: CreateAgentDraftInput): AgentDraft {
    const now = new Date().toISOString()
    const draft: AgentDraft = {
      id: makeDraftId(),
      ...(typeof input.projectId === 'number' && Number.isFinite(input.projectId) ? { projectId: input.projectId } : {}),
      kind: normalizeDraftKind(input.kind),
      title: normalizeTitle(input.title),
      content: typeof input.content === 'string' ? input.content : '',
      status: 'draft',
      ...(normalizeDraftSource(input.source) ? { source: normalizeDraftSource(input.source) } : {}),
      ...(normalizeDraftTarget(input.target) ? { target: normalizeDraftTarget(input.target) } : {}),
      ...(input.createdByRunId ? { createdByRunId: input.createdByRunId } : {}),
      ...(input.createdByThreadId ? { createdByThreadId: input.createdByThreadId } : {}),
      ...(normalizeMetadata(input.metadata) ? { metadata: normalizeMetadata(input.metadata) } : {}),
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
}

interface DraftStateFile {
  version: 1
  drafts: AgentDraft[]
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

  private load(): void {
    if (!existsSync(this.filePath)) return
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<DraftStateFile>
    this.loadDrafts(Array.isArray(parsed.drafts) ? parsed.drafts : [])
  }

  private persist(): void {
    atomicWriteJSON(this.filePath, {
      version: 1,
      drafts: this.allDrafts(),
    } satisfies DraftStateFile)
  }
}

export function resolveAgentDraftPath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_DRAFT_PATH) return process.env.MOVSCRIPT_AGENT_DRAFT_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.drafts.json')
  return join(statePath, 'drafts.json')
}

export function normalizeDraftKind(value: unknown): AgentDraftKind {
  return value === 'script_split'
    || value === 'script'
    || value === 'asset_slot'
    || value === 'storyboard_line'
    || value === 'content_unit'
    || value === 'prompt'
    || value === 'note'
    || value === 'pipeline'
    || value === 'segment'
    || value === 'scene_moment'
    || value === 'production_proposal'
    ? value
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
  if (draft.kind === 'script_split') {
    validateScriptSplitDraft(draft, issues)
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
  if (parsed.schema !== 'movscript.script_split_analysis.v1') {
    issues.push({ path: '/schema', message: 'Script split draft schema must be movscript.script_split_analysis.v1.', severity: 'error' })
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
  })
}

function hasScriptSplitBodyText(value: Record<string, unknown>): boolean {
  return ['content', 'text', 'body', 'rawText', 'raw_text', 'sourceText', 'source_text']
    .some((key) => typeof value[key] === 'string' && value[key].trim().length > 0)
}

function normalizeStoredDraft(draft: AgentDraft): AgentDraft {
  const now = new Date().toISOString()
  return {
    ...draft,
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

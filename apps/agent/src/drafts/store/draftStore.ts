import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { JSONValue } from '../../shared/protocol/types.js'
import { isJSONValue, isRecord } from '../../shared/json/jsonValue.js'
import { atomicWriteJSON, resolveAgentStatePath } from '../../state/store/file/fileStore.js'
import { DRAFT_KIND_VALUES, type DraftKindValue } from '@movscript/drafts'
import type { RuntimeTelemetryRegistry } from '../../telemetry/runtime/runtimeTelemetry.js'

export { validateDraft } from './draft-store/validation.js'

// AgentDraft is a local runtime/client review artifact. It is the protocol shape
// used to pass proposed changes to the UI for preview, revision, approval, or
// rejection. It is not a formal backend domain entity until a separate apply
// flow writes accepted content to backend APIs.
export type AgentDraftKind = DraftKindValue
// Kept for wire compatibility with older clients. The local draft itself now
// remains a mutable work copy; apply/reject outcomes are recorded in metadata.
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
  projectId?: number
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
      ...(isValidDraftProjectId(input.projectId) ? { projectId: input.projectId } : {}),
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
    const target = normalizeDraftTarget(input.target)
    const appliedByUserId = normalizeDraftIdValue(input.appliedByUserId)
    const metadata = normalizeMetadata(input.metadata)
    const updated: AgentDraft = {
      ...current,
      filePath: current.filePath ?? this.getDraftFilePath(current.id),
      ...(typeof input.title === 'string' ? { title: normalizeTitle(input.title) } : {}),
      ...(typeof input.content === 'string' ? { content: input.content } : {}),
      ...(target ? { target } : {}),
      ...(appliedByUserId !== undefined ? { appliedByUserId } : {}),
      ...(input.appliedAt ? { appliedAt: input.appliedAt } : {}),
      ...(typeof input.rejectedReason === 'string' ? { rejectedReason: input.rejectedReason } : {}),
      ...(metadata ? { metadata: { ...(current.metadata ?? {}), ...metadata } } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.drafts.set(id, clone(updated))
    return clone(updated)
  }

  getDraft(id: string): AgentDraft | undefined {
    const draft = this.drafts.get(id)
    return draft ? clone(draft) : undefined
  }

  getDraftFilePath(id: string): string {
    return resolve('/movscript-agent/drafts', `${id}.draft.json`)
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
    if (query.projectId !== undefined && !isValidDraftProjectId(query.projectId)) return []
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
  private loaded = false

  constructor(filePath = resolveAgentDraftPath(), private readonly telemetry?: RuntimeTelemetryRegistry) {
    super()
    this.filePath = filePath
  }

  override createDraft(input: CreateAgentDraftInput): AgentDraft {
    this.ensureLoaded()
    const draft = super.createDraft(input)
    this.persist()
    return draft
  }

  override updateDraft(id: string, input: UpdateAgentDraftInput): AgentDraft {
    this.ensureLoaded()
    const draft = super.updateDraft(id, input)
    this.persist()
    return draft
  }

  override getDraft(id: string): AgentDraft | undefined {
    this.ensureLoaded()
    const draft = super.getDraft(id)
    if (!draft) return undefined
    return this.syncDraftContentFromFile(draft)
  }

  override listDrafts(query: ListAgentDraftsQuery = {}): AgentDraft[] {
    this.ensureLoaded()
    return super.listDrafts(query).map((draft) => this.syncDraftContentFromFile(draft))
  }

  override getDraftFilePath(id: string): string {
    return contentFilePath(this.filePath, id)
  }

  override readDraftFile(filePath: string): ReadAgentDraftResult {
    this.ensureLoaded()
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
    this.ensureLoaded()
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

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    const loadStartedAt = Date.now()
    let parsed: unknown
    let rawBytes = 0
    let readMs = 0
    let parseMs = 0
    try {
      const readStartedAt = Date.now()
      const raw = readFileSync(this.filePath, 'utf8')
      readMs = Date.now() - readStartedAt
      rawBytes = Buffer.byteLength(raw)
      const parseStartedAt = Date.now()
      parsed = JSON.parse(raw) as unknown
      parseMs = Date.now() - parseStartedAt
    } catch {
      return
    }
    if (!isRecord(parsed)) return
    const normalizeStartedAt = Date.now()
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts.flatMap((draft) => normalizeStoredDraftRecord(draft)) : []
    const normalizeMs = Date.now() - normalizeStartedAt
    const readFilesStartedAt = Date.now()
    const loadedDrafts = drafts.map((draft) => {
      const filePath = this.getDraftFilePath(draft.id)
      const fileContent = readDraftContent(filePath, draft.content)
      return {
        ...draft,
        filePath,
        content: fileContent,
      }
    })
    const readFilesMs = Date.now() - readFilesStartedAt
    const hydrateStartedAt = Date.now()
    this.loadDrafts(loadedDrafts)
    const hydrateMs = Date.now() - hydrateStartedAt
    console.info([
      '[agent] startup draft-store load-detail',
      `total=${Date.now() - loadStartedAt}ms`,
      `read=${readMs}ms`,
      `parse=${parseMs}ms`,
      `normalize=${normalizeMs}ms`,
      `readFiles=${readFilesMs}ms`,
      `hydrate=${hydrateMs}ms`,
      `rawBytes=${rawBytes}`,
      `drafts=${loadedDrafts.length}`,
    ].join(' '))
  }

  private syncDraftContentFromFile(draft: AgentDraft): AgentDraft {
    const filePath = draft.filePath ?? this.getDraftFilePath(draft.id)
    const content = readDraftContent(filePath, draft.content)
    if (content === draft.content && draft.filePath) return draft
    const updated = super.updateDraft(draft.id, { content })
    this.persist()
    return updated
  }

  private persist(): void {
    const startedAt = Date.now()
    try {
      const drafts = this.allDrafts()
      atomicWriteJSON(this.filePath, {
        version: 2,
        drafts,
      })
      mkdirSync(dirname(this.filePath), { recursive: true })
      for (const draft of drafts) {
        writeDraftContent(this.getDraftFilePath(draft.id), draft.content)
      }
      this.recordStorageFlush('success', Date.now() - startedAt)
    } catch (error) {
      this.recordStorageFlush('error', Date.now() - startedAt)
      throw error
    }
  }

  private recordStorageFlush(status: 'success' | 'error', durationMs: number): void {
    this.telemetry?.recordMetric({
      name: 'movscript_agent_storage_flush_duration_ms',
      value: Math.max(0, durationMs),
      unit: 'ms',
      labels: {
        component: 'draft_store',
        kind: 'draft_files',
        stage: 'flush',
        status,
      },
    })
    if (status !== 'success') return
    this.recordStorageFileBytes('draft_index_file', fileSizeSafe(this.filePath), status)
    const contentBytes = this.allDrafts()
      .map((draft) => fileSizeSafe(this.getDraftFilePath(draft.id)) ?? 0)
      .reduce((sum, bytes) => sum + bytes, 0)
    this.recordStorageFileBytes('draft_content_files', contentBytes, status)
  }

  private recordStorageFileBytes(kind: 'draft_index_file' | 'draft_content_files', bytes: number | undefined, status: 'success'): void {
    if (bytes === undefined) return
    this.telemetry?.recordMetric({
      name: 'movscript_agent_storage_file_bytes',
      value: bytes,
      unit: 'bytes',
      labels: {
        component: 'draft_store',
        kind,
        stage: 'flush',
        status,
      },
    })
  }
}

function fileSizeSafe(filePath: string): number | undefined {
  try {
    return statSync(filePath).size
  } catch {
    return undefined
  }
}

export function resolveAgentDraftPath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_DRAFT_PATH) return process.env.MOVSCRIPT_AGENT_DRAFT_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.drafts.json')
  return join(statePath, 'drafts.json')
}

function contentFilePath(indexFilePath: string, draftId: string): string {
  return join(dirname(indexFilePath), 'draft-files', `${draftId}.draft.json`)
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
  if (typeof value !== 'string') return 'project_standards_proposal'
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((DRAFT_KIND_VALUES as readonly string[]).includes(normalized)) return normalized as AgentDraftKind
  return 'project_standards_proposal'
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
  const source = normalizeJSONRecord(value)
  if (!source) return undefined
  for (const key of ['entityId', 'pageEntityId', 'pipelineNodeId', 'userId']) {
    if (key in source && !isValidDraftReferenceId(source[key])) delete source[key]
  }
  return Object.keys(source).length > 0 ? source as AgentDraftSource : undefined
}

function normalizeDraftTarget(value: unknown): AgentDraftTarget | undefined {
  const target = normalizeJSONRecord(value)
  if (!target) return undefined
  if ('entityId' in target && !isValidDraftReferenceId(target.entityId)) delete target.entityId
  if ('projectId' in target && !isValidDraftProjectId(target.projectId)) delete target.projectId
  return Object.keys(target).length > 0 ? target as AgentDraftTarget : undefined
}

function normalizeMetadata(value: unknown): Record<string, JSONValue> | undefined {
  return normalizeJSONRecord(value)
}

function normalizeDraftSeed(value: unknown): JSONValue | undefined {
  if (!isJSONValue(value)) return undefined
  return clone(value)
}

function normalizeJSONRecord(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  const output: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isJSONValue(item)) output[key] = clone(item)
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function normalizeDraftIdValue(value: unknown): number | string | undefined {
  return isValidDraftReferenceId(value) ? value : undefined
}

function isValidDraftReferenceId(value: unknown): value is number | string {
  return isValidDraftProjectId(value) || (typeof value === 'string' && value.trim().length > 0)
}

function normalizeStoredDraft(draft: AgentDraft): AgentDraft {
  const now = new Date().toISOString()
  const source = normalizeDraftSource(draft.source)
  const target = normalizeDraftTarget(draft.target)
  const appliedByUserId = normalizeDraftIdValue(draft.appliedByUserId)
  return {
    ...draft,
    filePath: draft.filePath ?? resolve('/movscript-agent/drafts', `${draft.id}.draft.json`),
    ...(isValidDraftProjectId(draft.projectId) ? { projectId: draft.projectId } : { projectId: undefined }),
    kind: normalizeDraftKind(draft.kind),
    title: normalizeTitle(draft.title),
    content: typeof draft.content === 'string' ? draft.content : '',
    status: 'draft',
    ...(source ? { source } : { source: undefined }),
    ...(target ? { target } : { target: undefined }),
    ...(appliedByUserId !== undefined ? { appliedByUserId } : { appliedByUserId: undefined }),
    createdAt: typeof draft.createdAt === 'string' ? draft.createdAt : now,
    updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : now,
  }
}

function matchesDraftQuery(draft: AgentDraft, query: ListAgentDraftsQuery): boolean {
  if (query.projectId !== undefined) {
    if (!isValidDraftProjectId(query.projectId)) return false
    if (draft.projectId !== query.projectId) return false
  }
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

function isValidDraftProjectId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function makeDraftId(): string {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

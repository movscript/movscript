import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JSONValue } from '../types.js'
import { atomicWriteJSON, resolveAgentStatePath } from './fileStore.js'

export type AgentDraftKind =
  | 'script'
  | 'setting'
  | 'asset_slot'
  | 'storyboard_line'
  | 'content_unit'
  | 'prompt'
  | 'note'
  | 'pipeline'
export type AgentDraftStatus = 'draft' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface AgentDraftSource {
  entityType?: string
  entityId?: number | string
  pipelineNodeId?: number | string
  runId?: string
  threadId?: string
  userId?: number | string
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

export interface AgentDraftStore {
  createDraft(input: CreateAgentDraftInput): AgentDraft
  updateDraft(id: string, input: UpdateAgentDraftInput): AgentDraft
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
  return value === 'script'
    || value === 'setting'
    || value === 'asset_slot'
    || value === 'storyboard_line'
    || value === 'content_unit'
    || value === 'prompt'
    || value === 'note'
    || value === 'pipeline'
    ? value
    : 'note'
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
  return true
}

function makeDraftId(): string {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

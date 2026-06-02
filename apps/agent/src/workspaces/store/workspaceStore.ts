import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { JSONValue } from '../../shared/protocol/types.js'
import { isJSONValue, isRecord } from '../../shared/json/jsonValue.js'
import { atomicWriteJSON, resolveAgentStatePath } from '../../state/store/file/fileStore.js'
import { WORKSPACE_KIND_VALUES, type WorkspaceKindValue } from '@movscript/workspaces'
import type { RuntimeTelemetryRegistry } from '../../telemetry/runtime/runtimeTelemetry.js'

export { validateWorkspace } from './workspace-store/validation.js'

// AgentWorkspace is a local runtime/client review artifact. It is the protocol shape
// used to pass proposed changes to the UI for preview, revision, approval, or
// rejection. It is not a formal backend domain entity until a separate apply
// flow writes accepted content to backend APIs.
export type AgentWorkspaceKind = WorkspaceKindValue
// Kept for wire compatibility with older clients. The local workspace itself now
// remains a mutable work copy; apply/reject outcomes are recorded in metadata.
export type AgentWorkspaceStatus = 'workspace' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface AgentWorkspaceSource {
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

export interface AgentWorkspaceTarget {
  entityType?: string
  entityId?: number | string
  projectId?: number
  field?: string
  [key: string]: JSONValue | undefined
}

export interface AgentWorkspace {
  id: string
  filePath?: string
  projectId?: number
  kind: AgentWorkspaceKind
  title: string
  content: string
  status: AgentWorkspaceStatus
  source?: AgentWorkspaceSource
  target?: AgentWorkspaceTarget
  createdByRunId?: string
  createdByThreadId?: string
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
}

export interface CreateAgentWorkspaceInput {
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

export interface ListAgentWorkspacesQuery {
  projectId?: number
  kind?: AgentWorkspaceKind
  status?: AgentWorkspaceStatus
  statuses?: AgentWorkspaceStatus[]
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

export interface UpdateAgentWorkspaceInput {
  status?: AgentWorkspaceStatus
  title?: string
  content?: string
  target?: AgentWorkspaceTarget
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, JSONValue>
}

export interface ReadAgentWorkspaceResult {
  workspace: AgentWorkspace
  filePath: string
  content: string
}

export interface EditAgentWorkspaceInput {
  oldString?: unknown
  newString?: unknown
  replaceAll?: unknown
}

export interface EditAgentWorkspaceResult {
  workspace: AgentWorkspace
  filePath: string
  replacementCount: number
}

export interface AgentWorkspaceValidationIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface AgentWorkspaceValidationResult {
  ok: boolean
  workspaceId: string
  kind: AgentWorkspaceKind
  issues: AgentWorkspaceValidationIssue[]
}

export interface AgentWorkspaceStore {
  createWorkspace(input: CreateAgentWorkspaceInput): AgentWorkspace
  updateWorkspace(id: string, input: UpdateAgentWorkspaceInput): AgentWorkspace
  getWorkspaceFilePath(id: string): string
  readWorkspaceFile(filePath: string): ReadAgentWorkspaceResult
  editWorkspaceFile(filePath: string, input: EditAgentWorkspaceInput): EditAgentWorkspaceResult
  getWorkspace(id: string): AgentWorkspace | undefined
  listWorkspaces(query?: ListAgentWorkspacesQuery): AgentWorkspace[]
}

export class InMemoryAgentWorkspaceStore implements AgentWorkspaceStore {
  private readonly workspaces = new Map<string, AgentWorkspace>()
  protected readonly lastReadContentByPath = new Map<string, string>()

  createWorkspace(input: CreateAgentWorkspaceInput): AgentWorkspace {
    const now = new Date().toISOString()
    const workspaceId = makeWorkspaceId()
    const metadata = normalizeMetadata(input.metadata)
    const seed = normalizeWorkspaceSeed(input.seed)
    const workspace: AgentWorkspace = {
      id: workspaceId,
      filePath: this.getWorkspaceFilePath(workspaceId),
      ...(isValidWorkspaceProjectId(input.projectId) ? { projectId: input.projectId } : {}),
      kind: normalizeWorkspaceKind(input.kind),
      title: normalizeTitle(input.title),
      content: typeof input.content === 'string' ? input.content : '',
      status: 'workspace',
      ...(normalizeWorkspaceSource(input.source) ? { source: normalizeWorkspaceSource(input.source) } : {}),
      ...(normalizeWorkspaceTarget(input.target) ? { target: normalizeWorkspaceTarget(input.target) } : {}),
      ...(input.createdByRunId ? { createdByRunId: input.createdByRunId } : {}),
      ...(input.createdByThreadId ? { createdByThreadId: input.createdByThreadId } : {}),
      ...(metadata || seed ? { metadata: { ...(metadata ?? {}), ...(seed ? { seed } : {}) } } : {}),
      createdAt: now,
      updatedAt: now,
    }
    this.workspaces.set(workspace.id, clone(workspace))
    return clone(workspace)
  }

  updateWorkspace(id: string, input: UpdateAgentWorkspaceInput): AgentWorkspace {
    const current = this.workspaces.get(id)
    if (!current) throw new Error(`workspace not found: ${id}`)
    const target = normalizeWorkspaceTarget(input.target)
    const appliedByUserId = normalizeWorkspaceIdValue(input.appliedByUserId)
    const metadata = normalizeMetadata(input.metadata)
    const updated: AgentWorkspace = {
      ...current,
      filePath: current.filePath ?? this.getWorkspaceFilePath(current.id),
      ...(typeof input.title === 'string' ? { title: normalizeTitle(input.title) } : {}),
      ...(typeof input.content === 'string' ? { content: input.content } : {}),
      ...(target ? { target } : {}),
      ...(appliedByUserId !== undefined ? { appliedByUserId } : {}),
      ...(input.appliedAt ? { appliedAt: input.appliedAt } : {}),
      ...(typeof input.rejectedReason === 'string' ? { rejectedReason: input.rejectedReason } : {}),
      ...(metadata ? { metadata: { ...(current.metadata ?? {}), ...metadata } } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.workspaces.set(id, clone(updated))
    return clone(updated)
  }

  getWorkspace(id: string): AgentWorkspace | undefined {
    const workspace = this.workspaces.get(id)
    return workspace ? clone(workspace) : undefined
  }

  getWorkspaceFilePath(id: string): string {
    return resolve('/movscript-agent/workspaces', `${id}.workspace.json`)
  }

  readWorkspaceFile(filePath: string): ReadAgentWorkspaceResult {
    const workspace = this.requireWorkspaceByFilePath(filePath)
    const normalizedPath = normalizeFilePath(filePath)
    this.lastReadContentByPath.set(normalizedPath, workspace.content)
    return {
      workspace: clone(workspace),
      filePath: normalizedPath,
      content: workspace.content,
    }
  }

  editWorkspaceFile(filePath: string, input: EditAgentWorkspaceInput): EditAgentWorkspaceResult {
    const workspace = this.requireWorkspaceByFilePath(filePath)
    const normalizedPath = normalizeFilePath(filePath)
    const lastReadContent = this.lastReadContentByPath.get(normalizedPath)
    if (lastReadContent === undefined) {
      throw new Error(`edit_workspace requires reading the file first: ${normalizedPath}`)
    }
    if (lastReadContent !== workspace.content) {
      throw new Error(`edit_workspace cannot edit stale content; read the file again: ${normalizedPath}`)
    }

    const oldString = normalizeEditString(input.oldString, 'old_string')
    const newString = normalizeEditString(input.newString, 'new_string')
    if (oldString === newString) throw new Error('edit_workspace requires new_string to differ from old_string')
    const replaceAll = input.replaceAll === true
    const matches = countOccurrences(workspace.content, oldString)
    if (replaceAll) {
      if (matches === 0) throw new Error('edit_workspace old_string was not found')
    } else if (matches !== 1) {
      throw new Error(`edit_workspace old_string must match exactly once; found ${matches}`)
    }

    const updatedContent = replaceAll
      ? workspace.content.split(oldString).join(newString)
      : workspace.content.replace(oldString, newString)
    const updated = this.updateWorkspace(workspace.id, { content: updatedContent })
    this.lastReadContentByPath.delete(normalizedPath)
    return {
      workspace: updated,
      filePath: normalizedPath,
      replacementCount: matches,
    }
  }

  listWorkspaces(query: ListAgentWorkspacesQuery = {}): AgentWorkspace[] {
    if (query.projectId !== undefined && !isValidWorkspaceProjectId(query.projectId)) return []
    const limit = typeof query.limit === 'number' && Number.isFinite(query.limit)
      ? Math.max(1, Math.min(Math.floor(query.limit), 100))
      : 50
    return Array.from(this.workspaces.values())
      .filter((workspace) => matchesWorkspaceQuery(workspace, query))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((workspace) => clone(workspace))
  }

  protected loadWorkspaces(workspaces: AgentWorkspace[]): void {
    for (const workspace of workspaces) {
      this.workspaces.set(workspace.id, clone(normalizeStoredWorkspace(workspace)))
    }
  }

  protected allWorkspaces(): AgentWorkspace[] {
    return Array.from(this.workspaces.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((workspace) => clone(workspace))
  }

  protected requireWorkspaceByFilePath(filePath: string): AgentWorkspace {
    const normalizedPath = normalizeFilePath(filePath)
    const workspace = Array.from(this.workspaces.values()).find((candidate) => normalizeFilePath(candidate.filePath ?? this.getWorkspaceFilePath(candidate.id)) === normalizedPath)
    if (!workspace) throw new Error(`workspace file not found: ${normalizedPath}`)
    return clone(workspace)
  }
}

export class FileAgentWorkspaceStore extends InMemoryAgentWorkspaceStore {
  readonly filePath: string
  private loaded = false

  constructor(filePath = resolveAgentWorkspacePath(), private readonly telemetry?: RuntimeTelemetryRegistry) {
    super()
    this.filePath = filePath
  }

  override createWorkspace(input: CreateAgentWorkspaceInput): AgentWorkspace {
    this.ensureLoaded()
    const workspace = super.createWorkspace(input)
    this.persist()
    return workspace
  }

  override updateWorkspace(id: string, input: UpdateAgentWorkspaceInput): AgentWorkspace {
    this.ensureLoaded()
    const workspace = super.updateWorkspace(id, input)
    this.persist()
    return workspace
  }

  override getWorkspace(id: string): AgentWorkspace | undefined {
    this.ensureLoaded()
    const workspace = super.getWorkspace(id)
    if (!workspace) return undefined
    return this.syncWorkspaceContentFromFile(workspace)
  }

  override listWorkspaces(query: ListAgentWorkspacesQuery = {}): AgentWorkspace[] {
    this.ensureLoaded()
    return super.listWorkspaces(query).map((workspace) => this.syncWorkspaceContentFromFile(workspace))
  }

  override getWorkspaceFilePath(id: string): string {
    return contentFilePath(this.filePath, id)
  }

  override readWorkspaceFile(filePath: string): ReadAgentWorkspaceResult {
    this.ensureLoaded()
    const workspace = this.requireWorkspaceByFilePath(filePath)
    const normalizedPath = normalizeFilePath(filePath)
    const content = readWorkspaceContent(normalizedPath, workspace.content)
    this.lastReadContentByPath.set(normalizedPath, content)
    return {
      workspace: clone({ ...workspace, content }),
      filePath: normalizedPath,
      content,
    }
  }

  override editWorkspaceFile(filePath: string, input: EditAgentWorkspaceInput): EditAgentWorkspaceResult {
    this.ensureLoaded()
    const normalizedPath = normalizeFilePath(filePath)
    const workspace = this.requireWorkspaceByFilePath(normalizedPath)
    const currentContent = readWorkspaceContent(normalizedPath, workspace.content)
    const lastReadContent = this.lastReadContentByPath.get(normalizedPath)
    if (lastReadContent === undefined) {
      throw new Error(`edit_workspace requires reading the file first: ${normalizedPath}`)
    }
    if (lastReadContent !== currentContent) {
      throw new Error(`edit_workspace cannot edit stale content; read the file again: ${normalizedPath}`)
    }
    const oldString = normalizeEditString(input.oldString, 'old_string')
    const newString = normalizeEditString(input.newString, 'new_string')
    if (oldString === newString) throw new Error('edit_workspace requires new_string to differ from old_string')
    const replaceAll = input.replaceAll === true
    const matches = countOccurrences(currentContent, oldString)
    if (replaceAll) {
      if (matches === 0) throw new Error('edit_workspace old_string was not found')
    } else if (matches !== 1) {
      throw new Error(`edit_workspace old_string must match exactly once; found ${matches}`)
    }

    const updatedContent = replaceAll
      ? currentContent.split(oldString).join(newString)
      : currentContent.replace(oldString, newString)
    writeWorkspaceContent(normalizedPath, updatedContent)
    const updated = super.updateWorkspace(workspace.id, { content: updatedContent })
    this.lastReadContentByPath.delete(normalizedPath)
    this.persist()
    return {
      workspace: updated,
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
    const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces.flatMap((workspace) => normalizeStoredWorkspaceRecord(workspace)) : []
    const normalizeMs = Date.now() - normalizeStartedAt
    const readFilesStartedAt = Date.now()
    const loadedWorkspaces = workspaces.map((workspace) => {
      const filePath = this.getWorkspaceFilePath(workspace.id)
      const fileContent = readWorkspaceContent(filePath, workspace.content)
      return {
        ...workspace,
        filePath,
        content: fileContent,
      }
    })
    const readFilesMs = Date.now() - readFilesStartedAt
    const hydrateStartedAt = Date.now()
    this.loadWorkspaces(loadedWorkspaces)
    const hydrateMs = Date.now() - hydrateStartedAt
    console.info([
      '[agent] startup workspace-store load-detail',
      `total=${Date.now() - loadStartedAt}ms`,
      `read=${readMs}ms`,
      `parse=${parseMs}ms`,
      `normalize=${normalizeMs}ms`,
      `readFiles=${readFilesMs}ms`,
      `hydrate=${hydrateMs}ms`,
      `rawBytes=${rawBytes}`,
      `workspaces=${loadedWorkspaces.length}`,
    ].join(' '))
  }

  private syncWorkspaceContentFromFile(workspace: AgentWorkspace): AgentWorkspace {
    const filePath = workspace.filePath ?? this.getWorkspaceFilePath(workspace.id)
    const content = readWorkspaceContent(filePath, workspace.content)
    if (content === workspace.content && workspace.filePath) return workspace
    const updated = super.updateWorkspace(workspace.id, { content })
    this.persist()
    return updated
  }

  private persist(): void {
    const startedAt = Date.now()
    try {
      const workspaces = this.allWorkspaces()
      atomicWriteJSON(this.filePath, {
        version: 2,
        workspaces,
      })
      mkdirSync(dirname(this.filePath), { recursive: true })
      for (const workspace of workspaces) {
        writeWorkspaceContent(this.getWorkspaceFilePath(workspace.id), workspace.content)
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
        component: 'workspace_store',
        kind: 'workspace_files',
        stage: 'flush',
        status,
      },
    })
    if (status !== 'success') return
    this.recordStorageFileBytes('workspace_index_file', fileSizeSafe(this.filePath), status)
    const contentBytes = this.allWorkspaces()
      .map((workspace) => fileSizeSafe(this.getWorkspaceFilePath(workspace.id)) ?? 0)
      .reduce((sum, bytes) => sum + bytes, 0)
    this.recordStorageFileBytes('workspace_content_files', contentBytes, status)
  }

  private recordStorageFileBytes(kind: 'workspace_index_file' | 'workspace_content_files', bytes: number | undefined, status: 'success'): void {
    if (bytes === undefined) return
    this.telemetry?.recordMetric({
      name: 'movscript_agent_storage_file_bytes',
      value: bytes,
      unit: 'bytes',
      labels: {
        component: 'workspace_store',
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

export function resolveAgentWorkspacePath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_WORKSPACE_PATH) return process.env.MOVSCRIPT_AGENT_WORKSPACE_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.workspaces.json')
  return join(statePath, 'workspaces.json')
}

function contentFilePath(indexFilePath: string, workspaceId: string): string {
  return join(dirname(indexFilePath), 'workspace-files', `${workspaceId}.workspace.json`)
}

function readWorkspaceContent(filePath: string, fallback: string): string {
  if (!existsSync(filePath)) {
    writeWorkspaceContent(filePath, fallback)
    return fallback
  }
  return readFileSync(filePath, 'utf8')
}

function writeWorkspaceContent(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

function normalizeFilePath(filePath: string): string {
  return resolve(filePath)
}

function normalizeEditString(value: unknown, field: 'old_string' | 'new_string'): string {
  if (typeof value !== 'string') throw new Error(`edit_workspace requires ${field}`)
  return value
}

function normalizeStoredWorkspaceRecord(value: unknown): AgentWorkspace[] {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return []
  return [normalizeStoredWorkspace({
    ...(value as unknown as AgentWorkspace),
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

export function normalizeWorkspaceKind(value: unknown): AgentWorkspaceKind {
  if (typeof value !== 'string') return 'project_standards_workspace'
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((WORKSPACE_KIND_VALUES as readonly string[]).includes(normalized)) return normalized as AgentWorkspaceKind
  return 'project_standards_workspace'
}

export function normalizeWorkspaceStatus(value: unknown): AgentWorkspaceStatus | undefined {
  return value === 'workspace'
    || value === 'accepted'
    || value === 'rejected'
    || value === 'applied'
    || value === 'superseded'
    ? value
    : undefined
}

function normalizeTitle(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'Untitled workspace'
}

function normalizeWorkspaceSource(value: unknown): AgentWorkspaceSource | undefined {
  const source = normalizeJSONRecord(value)
  if (!source) return undefined
  for (const key of ['entityId', 'pageEntityId', 'pipelineNodeId', 'userId']) {
    if (key in source && !isValidWorkspaceReferenceId(source[key])) delete source[key]
  }
  return Object.keys(source).length > 0 ? source as AgentWorkspaceSource : undefined
}

function normalizeWorkspaceTarget(value: unknown): AgentWorkspaceTarget | undefined {
  const target = normalizeJSONRecord(value)
  if (!target) return undefined
  if ('entityId' in target && !isValidWorkspaceReferenceId(target.entityId)) delete target.entityId
  if ('projectId' in target && !isValidWorkspaceProjectId(target.projectId)) delete target.projectId
  return Object.keys(target).length > 0 ? target as AgentWorkspaceTarget : undefined
}

function normalizeMetadata(value: unknown): Record<string, JSONValue> | undefined {
  return normalizeJSONRecord(value)
}

function normalizeWorkspaceSeed(value: unknown): JSONValue | undefined {
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

function normalizeWorkspaceIdValue(value: unknown): number | string | undefined {
  return isValidWorkspaceReferenceId(value) ? value : undefined
}

function isValidWorkspaceReferenceId(value: unknown): value is number | string {
  return isValidWorkspaceProjectId(value) || (typeof value === 'string' && value.trim().length > 0)
}

function normalizeStoredWorkspace(workspace: AgentWorkspace): AgentWorkspace {
  const now = new Date().toISOString()
  const source = normalizeWorkspaceSource(workspace.source)
  const target = normalizeWorkspaceTarget(workspace.target)
  const appliedByUserId = normalizeWorkspaceIdValue(workspace.appliedByUserId)
  return {
    ...workspace,
    filePath: workspace.filePath ?? resolve('/movscript-agent/workspaces', `${workspace.id}.workspace.json`),
    ...(isValidWorkspaceProjectId(workspace.projectId) ? { projectId: workspace.projectId } : { projectId: undefined }),
    kind: normalizeWorkspaceKind(workspace.kind),
    title: normalizeTitle(workspace.title),
    content: typeof workspace.content === 'string' ? workspace.content : '',
    status: 'workspace',
    ...(source ? { source } : { source: undefined }),
    ...(target ? { target } : { target: undefined }),
    ...(appliedByUserId !== undefined ? { appliedByUserId } : { appliedByUserId: undefined }),
    createdAt: typeof workspace.createdAt === 'string' ? workspace.createdAt : now,
    updatedAt: typeof workspace.updatedAt === 'string' ? workspace.updatedAt : now,
  }
}

function matchesWorkspaceQuery(workspace: AgentWorkspace, query: ListAgentWorkspacesQuery): boolean {
  if (query.projectId !== undefined) {
    if (!isValidWorkspaceProjectId(query.projectId)) return false
    if (workspace.projectId !== query.projectId) return false
  }
  if (query.kind && workspace.kind !== query.kind) return false
  if (query.status && workspace.status !== query.status) return false
  if (query.statuses && query.statuses.length > 0 && !query.statuses.includes(workspace.status)) return false
  if (query.threadId && workspace.createdByThreadId !== query.threadId && workspace.source?.threadId !== query.threadId) return false
  if (query.runId && workspace.createdByRunId !== query.runId && workspace.source?.runId !== query.runId) return false
  if (query.sourceEntityType && workspace.source?.entityType !== query.sourceEntityType) return false
  if (query.sourceEntityId !== undefined && workspace.source?.entityId !== query.sourceEntityId) return false
  if (query.pageKey && workspace.source?.pageKey !== query.pageKey) return false
  if (query.pageType && workspace.source?.pageType !== query.pageType) return false
  if (query.pageRoute && workspace.source?.pageRoute !== query.pageRoute) return false
  if (query.pageEntityType && workspace.source?.pageEntityType !== query.pageEntityType) return false
  if (query.pageEntityId !== undefined && workspace.source?.pageEntityId !== query.pageEntityId) return false
  return true
}

function isValidWorkspaceProjectId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function makeWorkspaceId(): string {
  return `workspace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

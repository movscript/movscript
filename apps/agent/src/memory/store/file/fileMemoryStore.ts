import { existsSync, readFileSync, statSync } from 'node:fs'
import { atomicWriteJSON, resolveAgentMemoryPath } from '../../../state/store/file/fileStore.js'
import { isRecord } from '../../../shared/json/jsonValue.js'
import { isValidMemoryProjectId, type AgentMemory, type CreateMemoryInput } from '../../shared/types.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from '../in-memory/memoryStore.js'
import type { RuntimeTelemetryRegistry } from '../../../telemetry/runtime/runtimeTelemetry.js'

interface MemoryStateFile {
  version: 2
  memories: AgentMemory[]
}

export class FileAgentMemoryStore extends InMemoryAgentMemoryStore implements AgentMemoryStore {
  readonly filePath: string
  private loaded = false

  constructor(filePath = resolveAgentMemoryPath(), private readonly telemetry?: RuntimeTelemetryRegistry) {
    super()
    this.filePath = filePath
  }

  override listMemories(query?: Parameters<InMemoryAgentMemoryStore['listMemories']>[0]): AgentMemory[] {
    this.ensureLoaded()
    return super.listMemories(query)
  }

  override getMemory(id: string): AgentMemory | undefined {
    this.ensureLoaded()
    return super.getMemory(id)
  }

  override createMemory(input: CreateMemoryInput): AgentMemory {
    this.ensureLoaded()
    const memory = super.createMemory(input)
    this.persist()
    return memory
  }

  override deleteMemory(id: string): boolean {
    this.ensureLoaded()
    const deleted = super.deleteMemory(id)
    if (deleted) this.persist()
    return deleted
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
      this.recordStorageOperation('load', 'error', Date.now() - loadStartedAt, rawBytes)
      return
    }
    if (!isRecord(parsed)) {
      this.recordStorageOperation('load', 'error', Date.now() - loadStartedAt, rawBytes)
      return
    }
    const normalizeStartedAt = Date.now()
    const memories = Array.isArray(parsed.memories) ? parsed.memories : []
    const normalizedMemories = memories.flatMap((memory) => normalizeMemory(memory))
    const normalizeMs = Date.now() - normalizeStartedAt
    const hydrateStartedAt = Date.now()
    this.replaceMemories(normalizedMemories)
    const hydrateMs = Date.now() - hydrateStartedAt
    console.info([
      '[agent] startup memory-store load-detail',
      `total=${Date.now() - loadStartedAt}ms`,
      `read=${readMs}ms`,
      `parse=${parseMs}ms`,
      `normalize=${normalizeMs}ms`,
      `hydrate=${hydrateMs}ms`,
      `rawBytes=${rawBytes}`,
      `memories=${normalizedMemories.length}`,
    ].join(' '))
    this.recordStorageOperation('load', 'success', Date.now() - loadStartedAt, rawBytes)
  }

  private persist(): void {
    const startedAt = Date.now()
    try {
      atomicWriteJSON(this.filePath, {
        version: 2,
        memories: this.snapshotMemories(),
      } satisfies MemoryStateFile)
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
        component: 'memory_store',
        kind: 'memory_file',
        stage: 'flush',
        status,
      },
    })
    if (status !== 'success') return
    const bytes = fileSizeSafe(this.filePath)
    if (bytes !== undefined) {
      this.telemetry?.recordMetric({
        name: 'movscript_agent_storage_file_bytes',
        value: bytes,
        unit: 'bytes',
        labels: {
          component: 'memory_store',
          kind: 'memory_file',
          stage: 'flush',
          status,
        },
      })
    }
  }

  private recordStorageOperation(stage: 'load', status: 'success' | 'error', durationMs: number, bytes?: number): void {
    this.telemetry?.recordMetric({
      name: 'movscript_agent_storage_operation_duration_ms',
      value: Math.max(0, durationMs),
      unit: 'ms',
      labels: {
        component: 'memory_store',
        kind: 'memory_file',
        stage,
        status,
      },
    })
    if (typeof bytes === 'number' && bytes >= 0) {
      this.telemetry?.recordMetric({
        name: 'movscript_agent_storage_file_bytes',
        value: bytes,
        unit: 'bytes',
        labels: {
          component: 'memory_store',
          kind: 'memory_file',
          stage,
          status,
        },
      })
    }
  }
}

function fileSizeSafe(filePath: string): number | undefined {
  try {
    return statSync(filePath).size
  } catch {
    return undefined
  }
}

function normalizeMemory(memory: unknown): AgentMemory[] {
  if (!isRecord(memory)) return []
  const record = memory
  const projectId = typeof record.projectId === 'number'
    ? record.projectId
    : typeof record.project_id === 'number'
      ? record.project_id
      : undefined
  const title = typeof record.title === 'string' && record.title.trim()
    ? record.title.trim()
    : typeof record.content === 'string' && record.content.trim()
      ? record.content.trim().slice(0, 40)
      : undefined
  const content = typeof record.content === 'string' ? record.content.trim() : undefined
  const kind = normalizeKind(record.kind)
  if (!isValidMemoryProjectId(projectId) || !title || !content || !kind) return []
  return [{
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : makeFallbackMemoryId(projectId),
    projectId,
    title,
    kind,
    content,
    ...(typeof record.sourceThreadId === 'string' ? { sourceThreadId: record.sourceThreadId } : typeof record.threadId === 'string' ? { sourceThreadId: record.threadId } : {}),
    ...(typeof record.sourceRunId === 'string' ? { sourceRunId: record.sourceRunId } : {}),
    ...(typeof record.sourceMessageId === 'string' ? { sourceMessageId: record.sourceMessageId } : {}),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  }]
}

function normalizeKind(value: unknown): AgentMemory['kind'] | undefined {
  return value === 'preference'
    || value === 'fact'
    || value === 'item_ref'
    || value === 'entity_ref'
    || value === 'workspace'
    || value === 'decision'
    || value === 'warning'
    ? value
    : undefined
}

function makeFallbackMemoryId(projectId: number): string {
  return `mem_${projectId.toString(36)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

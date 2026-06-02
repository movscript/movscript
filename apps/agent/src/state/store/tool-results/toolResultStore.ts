import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { JSONValue, ToolCall } from '../../shared/types.js'
import type { ModelToolResultContext, ModelToolResultRef } from '../../../context/tool-result/toolResultContext.js'
import { isJSONValue, isRecord } from '../../../shared/json/jsonValue.js'
import type { RuntimeTelemetryRegistry } from '../../../telemetry/runtime/runtimeTelemetry.js'

export interface AgentToolResultRecord {
  schema: 'movscript.agent.tool-result.v1'
  key: string
  refKey: string
  resultHash?: string
  runId: string
  threadId: string
  toolName: string
  callId?: string
  args?: Record<string, JSONValue>
  result: JSONValue
  originalChars: number
  renderedChars: number
  dropped: boolean
  reason?: ModelToolResultContext['reason']
  modelProjection: string
  preview: string
  createdAt: string
  updatedAt: string
}

export interface AgentToolResultStore {
  upsertToolResult(record: AgentToolResultRecord): AgentToolResultRecord
  getToolResult(key: string): AgentToolResultRecord | undefined
  listToolResults(query?: AgentToolResultQuery): AgentToolResultRecord[]
  deleteToolResultsForRuns(runIds: string[]): void
}

export interface AgentToolResultQuery {
  runId?: string
  threadId?: string
  resultHash?: string
  refKey?: string
}

export function buildAgentToolResultRecord(input: {
  runId: string
  threadId: string
  call: ToolCall
  result: JSONValue
  modelContext: ModelToolResultContext
  resultRef: ModelToolResultRef
  now?: string
}): AgentToolResultRecord {
  const now = input.now ?? new Date().toISOString()
  return {
    schema: 'movscript.agent.tool-result.v1',
    key: input.resultRef.key,
    refKey: input.resultRef.lookup.refKey,
    ...(input.resultRef.lookup.resultHash ? { resultHash: input.resultRef.lookup.resultHash } : {}),
    runId: input.runId,
    threadId: input.threadId,
    toolName: input.call.name,
    ...(input.call.id ? { callId: input.call.id } : {}),
    ...(input.call.args ? { args: input.call.args } : {}),
    result: input.result,
    originalChars: input.modelContext.originalChars,
    renderedChars: input.modelContext.renderedChars,
    dropped: input.modelContext.dropped,
    ...(input.modelContext.reason ? { reason: input.modelContext.reason } : {}),
    modelProjection: input.modelContext.content,
    preview: previewText(input.modelContext.content),
    createdAt: now,
    updatedAt: now,
  }
}

export function buildModelToolResultContextFromRecord(record: AgentToolResultRecord): ModelToolResultContext {
  return {
    content: record.modelProjection,
    dropped: record.dropped,
    originalChars: record.originalChars,
    renderedChars: record.renderedChars,
    resultRef: {
      key: record.key,
      ...(record.resultHash ? { hash: record.resultHash } : {}),
      evidenceKind: 'tool_result',
      lookup: {
        refKey: record.refKey,
        ...(record.resultHash ? { resultHash: record.resultHash } : {}),
      },
    },
    ...(record.reason ? { reason: record.reason } : {}),
  }
}

export class InMemoryAgentToolResultStore implements AgentToolResultStore {
  private readonly records = new Map<string, AgentToolResultRecord>()

  upsertToolResult(record: AgentToolResultRecord): AgentToolResultRecord {
    const existing = this.records.get(record.key)
    const next: AgentToolResultRecord = existing
      ? {
        ...record,
        createdAt: existing.createdAt,
        updatedAt: record.updatedAt,
      }
      : record
    this.records.set(record.key, clone(next))
    return clone(next)
  }

  getToolResult(key: string): AgentToolResultRecord | undefined {
    const record = this.records.get(key)
    return record ? clone(record) : undefined
  }

  listToolResults(query: AgentToolResultQuery = {}): AgentToolResultRecord[] {
    return Array.from(this.records.values())
      .filter((record) => matchesQuery(record, query))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.key.localeCompare(right.key))
      .map(clone)
  }

  deleteToolResultsForRuns(runIds: string[]): void {
    const deleted = new Set(runIds)
    for (const [key, record] of this.records) {
      if (deleted.has(record.runId)) this.records.delete(key)
    }
  }
}

export class FileAgentToolResultStore extends InMemoryAgentToolResultStore {
  constructor(readonly filePath = resolveAgentToolResultPath(), private readonly telemetry?: RuntimeTelemetryRegistry) {
    super()
    this.load()
  }

  override upsertToolResult(record: AgentToolResultRecord): AgentToolResultRecord {
    const next = super.upsertToolResult(record)
    this.persist()
    return next
  }

  override deleteToolResultsForRuns(runIds: string[]): void {
    super.deleteToolResultsForRuns(runIds)
    this.persist()
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
    } catch {
      return
    }
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.records)) return
    for (const value of parsed.records) {
      const record = normalizeToolResultRecord(value)
      if (record) super.upsertToolResult(record)
    }
  }

  private persist(): void {
    const startedAt = Date.now()
    try {
      atomicWriteJSON(this.filePath, {
        version: 1,
        records: this.listToolResults(),
      })
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
        component: 'tool_result_store',
        kind: 'tool_results_file',
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
          component: 'tool_result_store',
          kind: 'tool_results_file',
          stage: 'flush',
          status,
        },
      })
    }
  }
}

export function resolveAgentToolResultPath(statePath?: string): string {
  if (process.env.MOVSCRIPT_AGENT_TOOL_RESULTS_PATH) return process.env.MOVSCRIPT_AGENT_TOOL_RESULTS_PATH
  if (process.env.MOVSCRIPT_AGENT_USER_DATA_DIR) return join(process.env.MOVSCRIPT_AGENT_USER_DATA_DIR, 'tool-results.json')
  const basePath = statePath ?? process.env.MOVSCRIPT_AGENT_STATE_PATH
  if (basePath) return basePath.replace(/\.json$/, '.tool-results.json')
  return join(process.cwd(), '.movscript-agent', 'tool-results.json')
}

function normalizeToolResultRecord(value: unknown): AgentToolResultRecord | undefined {
  if (!isRecord(value)) return undefined
  if (value.schema !== 'movscript.agent.tool-result.v1') return undefined
  const key = stringValue(value.key)
  const refKey = stringValue(value.refKey)
  const runId = stringValue(value.runId)
  const threadId = stringValue(value.threadId)
  const toolName = stringValue(value.toolName)
  if (!key || !refKey || !runId || !threadId || !toolName) return undefined
  if (!isJSONValue(value.result)) return undefined
  const originalChars = numberValue(value.originalChars)
  const renderedChars = numberValue(value.renderedChars)
  if (originalChars === undefined || renderedChars === undefined) return undefined
  return {
    schema: 'movscript.agent.tool-result.v1',
    key,
    refKey,
    ...(stringValue(value.resultHash) ? { resultHash: stringValue(value.resultHash) } : {}),
    runId,
    threadId,
    toolName,
    ...(stringValue(value.callId) ? { callId: stringValue(value.callId) } : {}),
    ...(isArgs(value.args) ? { args: value.args } : {}),
    result: value.result,
    originalChars,
    renderedChars,
    dropped: value.dropped === true,
    ...(toolResultReason(value.reason) ? { reason: toolResultReason(value.reason) } : {}),
    modelProjection: stringValue(value.modelProjection) ?? '',
    preview: stringValue(value.preview) ?? '',
    createdAt: stringValue(value.createdAt) ?? new Date(0).toISOString(),
    updatedAt: stringValue(value.updatedAt) ?? stringValue(value.createdAt) ?? new Date(0).toISOString(),
  }
}

function matchesQuery(record: AgentToolResultRecord, query: AgentToolResultQuery): boolean {
  if (query.runId && record.runId !== query.runId) return false
  if (query.threadId && record.threadId !== query.threadId) return false
  if (query.resultHash && record.resultHash !== query.resultHash) return false
  if (query.refKey && record.refKey !== query.refKey && record.key !== query.refKey) return false
  return true
}

function isArgs(value: unknown): value is Record<string, JSONValue> {
  return isRecord(value) && Object.values(value).every(isJSONValue)
}

function toolResultReason(value: unknown): AgentToolResultRecord['reason'] | undefined {
  return value === 'deduped' || value === 'budget_dropped' || value === 'summarized' ? value : undefined
}

function previewText(value: string): string {
  const maxChars = 2000
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1)}…`
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function atomicWriteJSON(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function fileSizeSafe(filePath: string): number | undefined {
  try {
    return statSync(filePath).size
  } catch {
    return undefined
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { AgentRunTraceSummary, AgentTraceQuery } from '@movscript/protocol'
import { isRecord } from '../jsonValue.js'
import type { AgentTraceEvent, AgentTraceEventKind, JSONValue } from './types.js'

interface FileTraceIndex {
  version: 1
  threads: Record<string, FileTraceThreadIndex>
  runs: Record<string, FileTraceRunIndex>
}

interface FileTraceThreadIndex {
  threadId: string
  runIds: string[]
  eventCount: number
  firstEventAt?: string
  lastEventAt?: string
  bytes: number
  blobBytes: number
}

interface FileTraceRunIndex {
  runId: string
  threadId?: string
  eventCount: number
  byKind: Partial<Record<AgentTraceEventKind, number>>
  firstEventAt?: string
  lastEventAt?: string
  latestEvent?: AgentTraceEvent
  chunks: string[]
  currentChunk?: string
  bytes: number
  blobBytes: number
}

const DEFAULT_MAX_TRACE_CHUNK_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_PERSISTED_TRACE_EVENT_BYTES = 32 * 1024
const DEFAULT_MAX_PERSISTED_TRACE_DATA_BYTES = 24 * 1024

export class FileTraceStore {
  readonly rootDir: string
  readonly indexPath: string
  private index: FileTraceIndex

  constructor(rootDir: string) {
    this.rootDir = rootDir
    this.indexPath = join(rootDir, 'index.json')
    this.index = this.loadIndex()
  }

  appendTraceEvent(event: AgentTraceEvent, options: { threadId?: string } = {}): void {
    const runIndex = this.ensureRunIndex(event.runId, options.threadId)
    const replacesExistingEvent = this.readRunTraceEvents(event.runId).some((item) => item.id === event.id)
    const storedEvent = this.prepareEventForStorage(event, runIndex)
    const line = `${JSON.stringify(storedEvent)}\n`
    const chunk = this.ensureWritableChunk(runIndex, Buffer.byteLength(line))
    const chunkPath = join(this.rootDir, chunk)
    mkdirSync(dirname(chunkPath), { recursive: true })
    appendFileSync(chunkPath, line, 'utf8')
    runIndex.bytes += Buffer.byteLength(line)
    if (replacesExistingEvent) {
      this.rebuildRunIndexMetrics(runIndex)
    } else {
      runIndex.eventCount += 1
      runIndex.byKind[storedEvent.kind] = (runIndex.byKind[storedEvent.kind] ?? 0) + 1
      runIndex.firstEventAt = minDate(runIndex.firstEventAt, storedEvent.createdAt)
      runIndex.lastEventAt = maxDate(runIndex.lastEventAt, storedEvent.createdAt)
      if (!runIndex.latestEvent || storedEvent.createdAt.localeCompare(runIndex.latestEvent.createdAt) >= 0) {
        runIndex.latestEvent = storedEvent
      }
    }
    this.rebuildThreadIndex()
    this.persistIndex()
  }

  listRunTraceEvents(runId: string, query: AgentTraceQuery = {}): AgentTraceEvent[] {
    const limit = normalizeTraceLimit(query.limit)
    const events = this.readRunTraceEvents(runId)
      .filter((event) => !query.kind || event.kind === query.kind)
      .sort(compareTraceOrder)
    const cursorIndex = query.cursor ? events.findIndex((event) => event.id === query.cursor) : -1
    if (query.cursor && cursorIndex < 0) return []
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0
    return events.slice(startIndex, startIndex + limit).map(clone)
  }

  getRunTraceEventData(runId: string, eventId: string): unknown | undefined {
    const event = this.readRunTraceEvents(runId).find((item) => item.id === eventId)
    if (!event) return undefined
    const data = event.data
    if (!isRecord(data)) return data === undefined ? undefined : clone(data)
    const dataRef = typeof data.dataRef === 'string' ? data.dataRef : undefined
    const dataEncoding = typeof data.dataEncoding === 'string' ? data.dataEncoding : undefined
    if (data.persistedTraceTruncated === true && dataRef && dataEncoding === 'gzip') {
      const rootPath = resolve(this.rootDir)
      const blobPath = resolve(this.rootDir, dataRef)
      const relativeBlobPath = relative(rootPath, blobPath)
      if (relativeBlobPath.startsWith('..') || relativeBlobPath.startsWith('/') || relativeBlobPath === '') return clone(data)
      const parsed = parseJSON(gunzipSync(readFileSync(blobPath)).toString('utf8'))
      return parsed === undefined ? clone(data) : parsed
    }
    return clone(data)
  }

  countRunTraceEvents(runId: string, query: Pick<AgentTraceQuery, 'kind'> = {}): number {
    const runIndex = this.index.runs[runId]
    if (!runIndex) return 0
    return query.kind ? runIndex.byKind[query.kind] ?? 0 : runIndex.eventCount
  }

  summarizeRunTraceEvents(runId: string): AgentRunTraceSummary {
    const runIndex = this.index.runs[runId]
    if (!runIndex) return { runId, total: 0, byKind: {} }
    return {
      runId,
      total: runIndex.eventCount,
      byKind: { ...runIndex.byKind },
      ...(runIndex.latestEvent ? { latestEvent: clone(runIndex.latestEvent) } : {}),
    }
  }

  deleteRunTraceEvents(runIds: string[], options: { threadId?: string } = {}): string[] {
    const uniqueRunIds = Array.from(new Set(runIds))
    const deletedRunIds: string[] = []
    for (const runId of uniqueRunIds) {
      const runIndex = this.index.runs[runId]
      if (!runIndex) continue
      const traceThreadId = options.threadId ?? runIndex.threadId
      const runDir = join(this.rootDir, 'threads', safePathSegment(traceThreadId ?? threadIdForPath(runIndex)), 'runs', safePathSegment(runId))
      rmSync(runDir, { recursive: true, force: true })
      delete this.index.runs[runId]
      deletedRunIds.push(runId)
    }
    if (deletedRunIds.length > 0) {
      this.rebuildThreadIndex()
      if (options.threadId && !this.index.threads[options.threadId]) {
        const threadDir = join(this.rootDir, 'threads', safePathSegment(options.threadId))
        rmSync(threadDir, { recursive: true, force: true })
      }
      if (!options.threadId && Object.keys(this.index.threads).length === 0) {
        rmSync(join(this.rootDir, 'threads'), { recursive: true, force: true })
      }
      this.persistIndex()
    }
    return deletedRunIds
  }

  private readRunTraceEvents(runId: string): AgentTraceEvent[] {
    const runIndex = this.index.runs[runId]
    if (!runIndex) return []
    const eventsById = new Map<string, { event: AgentTraceEvent; sequence: number }>()
    let sequence = 0
    for (const chunk of runIndex.chunks) {
      const chunkPath = join(this.rootDir, chunk)
      if (!existsSync(chunkPath)) continue
      const lines = readFileSync(chunkPath, 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        const parsed = parseJSON(line)
        if (!isTraceEvent(parsed) || parsed.runId !== runId) continue
        sequence += 1
        eventsById.set(parsed.id, { event: parsed, sequence })
      }
    }
    return Array.from(eventsById.values())
      .sort((left, right) => left.sequence - right.sequence)
      .map((item) => item.event)
  }

  private ensureRunIndex(runId: string, threadId?: string): FileTraceRunIndex {
    const existing = this.index.runs[runId]
    if (existing) {
      if (threadId && existing.threadId !== threadId) existing.threadId = threadId
      return existing
    }
    const created: FileTraceRunIndex = {
      runId,
      ...(threadId ? { threadId } : {}),
      eventCount: 0,
      byKind: {},
      chunks: [],
      bytes: 0,
      blobBytes: 0,
    }
    this.index.runs[runId] = created
    return created
  }

  private ensureWritableChunk(runIndex: FileTraceRunIndex, incomingBytes: number): string {
    const maxChunkBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_TRACE_CHUNK_BYTES', DEFAULT_MAX_TRACE_CHUNK_BYTES)
    const current = runIndex.currentChunk
    if (current) {
      const currentPath = join(this.rootDir, current)
      const currentBytes = existsSync(currentPath) ? statSync(currentPath).size : 0
      if (currentBytes + incomingBytes <= maxChunkBytes) return current
    }
    const nextChunk = `threads/${safePathSegment(threadIdForPath(runIndex))}/runs/${safePathSegment(runIndex.runId)}/events-${String(runIndex.chunks.length + 1).padStart(6, '0')}.ndjson`
    runIndex.chunks.push(nextChunk)
    runIndex.currentChunk = nextChunk
    return nextChunk
  }

  private rebuildRunIndexMetrics(runIndex: FileTraceRunIndex): void {
    const events = this.readRunTraceEvents(runIndex.runId).sort(compareTraceOrder)
    const byKind: Partial<Record<AgentTraceEventKind, number>> = {}
    for (const event of events) {
      byKind[event.kind] = (byKind[event.kind] ?? 0) + 1
    }
    runIndex.eventCount = events.length
    runIndex.byKind = byKind
    runIndex.firstEventAt = events[0]?.createdAt
    runIndex.lastEventAt = events.at(-1)?.createdAt
    runIndex.latestEvent = events.at(-1)
  }

  private prepareEventForStorage(event: AgentTraceEvent, runIndex: FileTraceRunIndex): AgentTraceEvent {
    const maxEventBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_MAX_PERSISTED_TRACE_EVENT_BYTES', DEFAULT_MAX_PERSISTED_TRACE_EVENT_BYTES)
    if (jsonByteLength(event) <= maxEventBytes) return clone(event)

    const originalDataBytes = jsonByteLength(event.data)
    const dataRef = event.data === undefined ? undefined : this.writeDataBlob(event, originalDataBytes, runIndex)
    const compacted: AgentTraceEvent = {
      ...event,
      ...(event.data !== undefined ? { data: compactTraceData(event, originalDataBytes, dataRef) } : {}),
    }
    if (jsonByteLength(compacted) <= maxEventBytes) return compacted

    const maxDataBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_MAX_PERSISTED_TRACE_DATA_BYTES', DEFAULT_MAX_PERSISTED_TRACE_DATA_BYTES)
    const previewChars = Math.min(maxDataBytes, Math.max(200, Math.floor(maxEventBytes / 4)))
    return {
      ...event,
      data: {
        persistedTraceTruncated: true,
        originalDataBytes,
        ...(dataRef ? { dataRef: dataRef.path, dataBytes: dataRef.bytes, dataEncoding: 'gzip' } : {}),
        preview: previewJSON(event.data, previewChars),
      },
    }
  }

  private writeDataBlob(event: AgentTraceEvent, originalDataBytes: number, runIndex: FileTraceRunIndex): { path: string; bytes: number } {
    const relativePath = `threads/${safePathSegment(threadIdForPath(runIndex))}/runs/${safePathSegment(event.runId)}/blobs/${safePathSegment(event.id)}.data.json.gz`
    const blobPath = join(this.rootDir, relativePath)
    mkdirSync(dirname(blobPath), { recursive: true })
    const payload = gzipSync(Buffer.from(JSON.stringify(event.data) ?? 'null', 'utf8'))
    writeFileSync(blobPath, payload)
    runIndex.blobBytes += payload.byteLength
    return { path: relativePath, bytes: originalDataBytes }
  }

  private loadIndex(): FileTraceIndex {
    if (!existsSync(this.indexPath)) return { version: 1, threads: {}, runs: {} }
    const parsed = parseJSON(readFileSync(this.indexPath, 'utf8'))
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.runs)) return { version: 1, threads: {}, runs: {} }
    const runs: Record<string, FileTraceRunIndex> = {}
    for (const [runId, value] of Object.entries(parsed.runs)) {
      if (!isRecord(value)) continue
      runs[runId] = {
        runId,
        threadId: stringValue(value.threadId),
        eventCount: finiteNumber(value.eventCount) ?? 0,
        byKind: isRecord(value.byKind) ? sanitizeByKind(value.byKind) : {},
        firstEventAt: stringValue(value.firstEventAt),
        lastEventAt: stringValue(value.lastEventAt),
        latestEvent: isTraceEvent(value.latestEvent) ? value.latestEvent : undefined,
        chunks: Array.isArray(value.chunks) ? value.chunks.filter((item): item is string => typeof item === 'string') : [],
        currentChunk: stringValue(value.currentChunk),
        bytes: finiteNumber(value.bytes) ?? 0,
        blobBytes: finiteNumber(value.blobBytes) ?? 0,
      }
    }
    return {
      version: 1,
      threads: rebuildThreadIndexFromRuns(runs),
      runs,
    }
  }

  private persistIndex(): void {
    atomicWriteJSON(this.indexPath, this.index)
  }

  private rebuildThreadIndex(): void {
    this.index.threads = rebuildThreadIndexFromRuns(this.index.runs)
  }
}

function compactTraceData(
  event: AgentTraceEvent,
  originalDataBytes: number,
  dataRef?: { path: string; bytes: number },
): AgentTraceEvent['data'] {
  const data = isRecord(event.data) ? event.data : undefined
  const refFields: Record<string, JSONValue> = dataRef ? {
    dataRef: dataRef.path,
    dataBytes: dataRef.bytes,
    dataEncoding: 'gzip',
  } : {}
  if (!data) {
    return {
      persistedTraceTruncated: true,
      originalDataBytes,
      ...refFields,
      preview: previewJSON(event.data),
    }
  }
  if (event.kind === 'model_call') return compactModelCallTraceData(data, originalDataBytes, refFields)
  if (event.kind === 'tool_call') return compactToolCallTraceData(data, originalDataBytes, refFields)
  return {
    ...copyPrimitiveFields(data),
    persistedTraceTruncated: true,
    originalDataBytes,
    ...refFields,
    preview: previewJSON(data),
  }
}

function compactModelCallTraceData(
  data: Record<string, unknown>,
  originalDataBytes: number,
  refFields: Record<string, JSONValue>,
): AgentTraceEvent['data'] {
  const request = isRecord(data.request) ? data.request : undefined
  const requestBody = isRecord(request?.body) ? request.body : undefined
  const response = isRecord(data.response) ? data.response : undefined
  const parsedBody = isRecord(response?.parsedBody) ? response.parsedBody : undefined
  const out: Record<string, JSONValue> = {
    ...copyPrimitiveFields(data),
    persistedTraceTruncated: true,
    originalDataBytes,
    ...refFields,
  }
  if (request) {
    const compactRequest: Record<string, JSONValue> = copyPrimitiveFields(request)
    if (requestBody) {
      const body: Record<string, JSONValue> = {}
      setJSONValue(body, 'model', stringValue(requestBody.model))
      if (Array.isArray(requestBody.messages)) body.messageCount = requestBody.messages.length
      if (Array.isArray(requestBody.tools)) body.toolCount = requestBody.tools.length
      if (Object.keys(body).length > 0) compactRequest.body = body
    }
    if (Object.keys(compactRequest).length > 0) out.request = compactRequest
  }
  if (response) {
    const compactResponse: Record<string, JSONValue> = copyPrimitiveFields(response, new Set(['bodyText', 'content']))
    if (typeof response.bodyText === 'string') compactResponse.bodyTextChars = response.bodyText.length
    if (typeof response.content === 'string') compactResponse.contentChars = response.content.length
    if (parsedBody) {
      const compactParsedBody: Record<string, JSONValue> = {}
      if (isJSONRecord(parsedBody.usage)) compactParsedBody.usage = parsedBody.usage
      setJSONValue(compactParsedBody, 'finish_reason', stringValue(parsedBody.finish_reason))
      if (Object.keys(compactParsedBody).length > 0) compactResponse.parsedBody = compactParsedBody
    }
    if (Object.keys(compactResponse).length > 0) out.response = compactResponse
  }
  return out
}

function compactToolCallTraceData(
  data: Record<string, unknown>,
  originalDataBytes: number,
  refFields: Record<string, JSONValue>,
): AgentTraceEvent['data'] {
  const out: Record<string, JSONValue> = {
    ...copyPrimitiveFields(data),
    persistedTraceTruncated: true,
    originalDataBytes,
    ...refFields,
    resultChars: jsonByteLength(data.result),
  }
  setJSONValue(out, 'error', stringValue(data.error))
  return out
}

function isTraceEvent(value: unknown): value is AgentTraceEvent {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.runId === 'string'
    && typeof value.kind === 'string'
    && typeof value.title === 'string'
    && typeof value.status === 'string'
    && typeof value.createdAt === 'string'
}

function sanitizeByKind(value: Record<string, unknown>): Partial<Record<AgentTraceEventKind, number>> {
  const out: Partial<Record<AgentTraceEventKind, number>> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && Number.isFinite(item) && item >= 0) {
      out[key as AgentTraceEventKind] = Math.floor(item)
    }
  }
  return out
}

function rebuildThreadIndexFromRuns(runs: Record<string, FileTraceRunIndex>): Record<string, FileTraceThreadIndex> {
  const threads: Record<string, FileTraceThreadIndex> = {}
  for (const run of Object.values(runs)) {
    const threadId = run.threadId ?? 'unknown_thread'
    const thread = threads[threadId] ?? {
      threadId,
      runIds: [],
      eventCount: 0,
      bytes: 0,
      blobBytes: 0,
    }
    if (!thread.runIds.includes(run.runId)) thread.runIds.push(run.runId)
    thread.eventCount += run.eventCount
    thread.bytes += run.bytes
    thread.blobBytes += run.blobBytes
    if (run.firstEventAt) thread.firstEventAt = minDate(thread.firstEventAt, run.firstEventAt)
    if (run.lastEventAt) thread.lastEventAt = maxDate(thread.lastEventAt, run.lastEventAt)
    threads[threadId] = thread
  }
  for (const thread of Object.values(threads)) {
    thread.runIds.sort()
  }
  return threads
}

function copyPrimitiveFields(value: Record<string, unknown>, omittedKeys = new Set<string>()): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (omittedKeys.has(key)) continue
    if (item === null || typeof item === 'string' || typeof item === 'boolean') out[key] = item
    if (typeof item === 'number' && Number.isFinite(item)) out[key] = item
  }
  return out
}

function setJSONValue(target: Record<string, JSONValue>, key: string, value: JSONValue | undefined): void {
  if (value !== undefined) target[key] = value
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isRecord(value)) return false
  return Object.values(value).every((item) => isJSONValueLike(item))
}

function isJSONValueLike(value: unknown): value is JSONValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJSONValueLike)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValueLike)
}

function parseJSON(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function atomicWriteJSON(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function normalizeTraceLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 200
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(value)))
}

function compareTraceOrder(left: AgentTraceEvent, right: AgentTraceEvent): number {
  return left.createdAt.localeCompare(right.createdAt)
}

function minDate(left: string | undefined, right: string): string {
  return !left || right.localeCompare(left) < 0 ? right : left
}

function maxDate(left: string | undefined, right: string): string {
  return !left || right.localeCompare(left) > 0 ? right : left
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'unknown'
}

function threadIdForPath(runIndex: FileTraceRunIndex): string {
  return runIndex.threadId ?? 'unknown_thread'
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function previewJSON(value: unknown, maxChars = 1_000): string {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return text.length > maxChars ? `${text.slice(0, maxChars)}... [truncated ${text.length - maxChars} chars]` : text
}

function jsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? 'null')
  } catch {
    return Buffer.byteLength(String(value))
  }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

import { createHash } from 'node:crypto'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentSession,
  AgentTask,
  AgentTaskGraph,
  AgentThread,
  AgentTraceEvent,
  JSONValue,
  RuntimeContinuation,
  RuntimeInteraction,
  RuntimeWakeEvent,
} from '../../shared/types.js'
import type { RuntimeWork } from '../../../runtime-work/core/runtimeWork.js'
import type { AgentRunDebugLedger } from '../../../trace/debug/ledger/runDebugLedger.js'
import { isRecord } from '../../../shared/json/jsonValue.js'

export const AGENT_RUNTIME_LOG_EVENT_V1_SCHEMA = 'movscript.agent.runtime-log-event.v1'
export const AGENT_RUNTIME_LOG_MESSAGE_INDEX_V1_SCHEMA = 'movscript.agent.runtime-log-message-index.v1'
export const AGENT_RUNTIME_LOG_STEP_INDEX_V1_SCHEMA = 'movscript.agent.runtime-log-step-index.v1'
export const AGENT_RUNTIME_LOG_TRACE_INDEX_V1_SCHEMA = 'movscript.agent.runtime-log-trace-index.v1'

export type AgentRuntimeLogEntity =
  | { type: 'session'; value: AgentSession }
  | { type: 'thread'; value: AgentThread }
  | { type: 'message'; value: AgentMessage }
  | { type: 'run'; value: AgentRun }
  | { type: 'step'; value: AgentRunStep }
  | { type: 'trace'; value: AgentTraceEvent }
  | { type: 'debug_ledger'; value: AgentRunDebugLedger }
  | { type: 'task_graph'; value: AgentTaskGraph }
  | { type: 'task'; value: AgentTask }
  | { type: 'work'; value: RuntimeWork }
  | { type: 'interaction'; value: RuntimeInteraction }
  | { type: 'continuation'; value: RuntimeContinuation }
  | { type: 'wake_event'; value: RuntimeWakeEvent }

export type AgentRuntimeLogEventKind =
  | 'session.upserted'
  | 'thread.upserted'
  | 'thread.deleted'
  | 'message.upserted'
  | 'run.upserted'
  | 'step.upserted'
  | 'trace.upserted'
  | 'task_graph.upserted'
  | 'task.upserted'
  | 'work.upserted'
  | 'interaction.upserted'
  | 'continuation.upserted'
  | 'wake_event.upserted'
  | 'debug_ledger.upserted'
  | 'scope.cleared'

export interface AgentRuntimeLogCausality {
  sessionId?: string
  threadId?: string
  runId?: string
  messageId?: string
  stepId?: string
  traceId?: string
  interactionId?: string
  workId?: string
  continuationId?: string
  wakeEventId?: string
  taskGraphId?: string
  taskId?: string
  sourceEventId?: string
}

export interface AgentRuntimeLogEvent {
  schema: typeof AGENT_RUNTIME_LOG_EVENT_V1_SCHEMA
  id: string
  ordinal: number
  cursor: string
  emittedAt: string
  kind: AgentRuntimeLogEventKind
  causality?: AgentRuntimeLogCausality
  entity?: AgentRuntimeLogEntity
  payload?: JSONValue
}

export interface AppendRuntimeLogEventInput {
  emittedAt?: string
  kind: AgentRuntimeLogEventKind
  causality?: AgentRuntimeLogCausality
  entity?: AgentRuntimeLogEntity
  payload?: JSONValue
}

export interface RuntimeLogScanProgress {
  bytesRead: number
  totalBytes: number
  linesRead: number
  eventsRead: number
}

export interface RuntimeLogScanResult extends RuntimeLogScanProgress {
  malformedLines: number
}

export interface RuntimeLogThreadMessagesPage {
  threadId: string
  messages: AgentMessage[]
  nextAfterOrdinal?: number
  hasMore: boolean
  scan: RuntimeLogThreadMessagesScanStats
}

export interface RuntimeLogThreadMessagesScanStats {
  durationMs: number
  bytesRead: number
  totalBytes: number
  linesRead: number
  eventsRead: number
  matchedEvents: number
  malformedLines: number
}

export interface RuntimeLogJSONBlobRef {
  runtimeLogBlobRef: true
  path: string
  encoding: 'gzip'
  bytes: number
  originalBytes: number
  hash: string
}

export interface FileRuntimeLogStoreOptions {
  onIndexRebuildProgress?: (progress: RuntimeLogScanProgress) => void
}

interface RuntimeLogIndex {
  version: 1
  eventCount: number
  lastOrdinal: number
  bytes: number
  messageOffsetIndex: RuntimeLogMessageOffsetIndexStats
  stepOffsetIndex: RuntimeLogStepOffsetIndexStats
  traceOffsetIndex: RuntimeLogTraceOffsetIndexStats
  firstEventAt?: string
  lastEventAt?: string
  byKind: Partial<Record<AgentRuntimeLogEventKind, number>>
  sessions: Record<string, RuntimeLogEntityIndex>
  threads: Record<string, RuntimeLogEntityIndex>
  runs: Record<string, RuntimeLogEntityIndex>
  currentEntities: RuntimeLogCurrentEntityIndex
}

interface RuntimeLogEntityIndex {
  id: string
  eventCount: number
  firstEventAt?: string
  lastEventAt?: string
}

interface RuntimeLogCurrentEntityIndex {
  sessions: Record<string, RuntimeLogCurrentEntityRecord>
  threads: Record<string, RuntimeLogCurrentEntityRecord>
  runs: Record<string, RuntimeLogCurrentEntityRecord>
  taskGraphs: Record<string, RuntimeLogCurrentEntityRecord>
  tasks: Record<string, RuntimeLogCurrentEntityRecord>
  works: Record<string, RuntimeLogCurrentEntityRecord>
  interactions: Record<string, RuntimeLogCurrentEntityRecord>
  continuations: Record<string, RuntimeLogCurrentEntityRecord>
  wakeEvents: Record<string, RuntimeLogCurrentEntityRecord>
  debugLedgers: Record<string, RuntimeLogCurrentEntityRecord>
}

interface RuntimeLogCurrentEntityRecord {
  type: AgentRuntimeLogEntity['type']
  id: string
  ordinal: number
  emittedAt: string
  eventOffset: number
  eventBytes: number
  sessionId?: string
  threadId?: string
  runId?: string
  taskGraphId?: string
  taskId?: string
}

interface RuntimeLogMessageOffsetIndexStats {
  recordCount: number
  bytes: number
}

interface RuntimeLogStepOffsetIndexStats {
  recordCount: number
  bytes: number
}

interface RuntimeLogTraceOffsetIndexStats {
  recordCount: number
  bytes: number
}

interface RuntimeLogMessageOffsetIndexRecord {
  schema: typeof AGENT_RUNTIME_LOG_MESSAGE_INDEX_V1_SCHEMA
  threadId: string
  messageId: string
  ordinal: number
  emittedAt: string
  createdAt: string
  eventOffset: number
  eventBytes: number
}

interface RuntimeLogStepOffsetIndexRecord {
  schema: typeof AGENT_RUNTIME_LOG_STEP_INDEX_V1_SCHEMA
  runId: string
  stepId: string
  ordinal: number
  emittedAt: string
  createdAt: string
  eventOffset: number
  eventBytes: number
}

interface RuntimeLogTraceOffsetIndexRecord {
  schema: typeof AGENT_RUNTIME_LOG_TRACE_INDEX_V1_SCHEMA
  runId: string
  traceId: string
  ordinal: number
  emittedAt: string
  createdAt: string
  eventOffset: number
  eventBytes: number
}

interface RuntimeLogScannedEventMeta {
  offset: number
  bytes: number
}

const SCAN_CHUNK_BYTES = 64 * 1024

export class FileRuntimeLogStore {
  readonly rootDir: string
  readonly storageDir: string
  readonly eventsPath: string
  readonly indexPath: string
  readonly messageIndexPath: string
  readonly messageThreadIndexesPath: string
  readonly stepIndexPath: string
  readonly stepRunIndexesPath: string
  readonly traceIndexPath: string
  readonly traceRunIndexesPath: string
  readonly blobsPath: string
  private index: RuntimeLogIndex
  private readonly onIndexRebuildProgress: ((progress: RuntimeLogScanProgress) => void) | undefined

  constructor(rootPath: string, options: FileRuntimeLogStoreOptions = {}) {
    this.rootDir = rootPath
    this.onIndexRebuildProgress = options.onIndexRebuildProgress
    if (extname(rootPath) === '.jsonl') {
      const storageDir = dirname(rootPath)
      const rootBaseName = basename(rootPath, '.jsonl')
      this.storageDir = storageDir
      this.eventsPath = rootPath
      this.indexPath = join(storageDir, `${rootBaseName}.index.json`)
      this.messageIndexPath = join(storageDir, `${rootBaseName}.message-index.jsonl`)
      this.messageThreadIndexesPath = join(storageDir, `${rootBaseName}.message-indexes`, 'threads')
      this.stepIndexPath = join(storageDir, `${rootBaseName}.step-index.jsonl`)
      this.stepRunIndexesPath = join(storageDir, `${rootBaseName}.step-indexes`, 'runs')
      this.traceIndexPath = join(storageDir, `${rootBaseName}.trace-index.jsonl`)
      this.traceRunIndexesPath = join(storageDir, `${rootBaseName}.trace-indexes`, 'runs')
      this.blobsPath = join(storageDir, `${rootBaseName}.blobs`)
    } else {
      this.storageDir = rootPath
      this.eventsPath = join(rootPath, 'events.jsonl')
      this.indexPath = join(rootPath, 'index.json')
      this.messageIndexPath = join(rootPath, 'message-index.jsonl')
      this.messageThreadIndexesPath = join(rootPath, 'message-indexes', 'threads')
      this.stepIndexPath = join(rootPath, 'step-index.jsonl')
      this.stepRunIndexesPath = join(rootPath, 'step-indexes', 'runs')
      this.traceIndexPath = join(rootPath, 'trace-index.jsonl')
      this.traceRunIndexesPath = join(rootPath, 'trace-indexes', 'runs')
      this.blobsPath = join(rootPath, 'blobs')
    }
    this.index = this.loadIndex()
    this.ensureIndexMatchesEvents()
  }

  exists(): boolean {
    return existsSync(this.eventsPath)
  }

  append(input: AppendRuntimeLogEventInput): AgentRuntimeLogEvent {
    const ordinal = this.index.lastOrdinal + 1
    const event: AgentRuntimeLogEvent = {
      schema: AGENT_RUNTIME_LOG_EVENT_V1_SCHEMA,
      id: `runtime-log-event:${ordinal}`,
      ordinal,
      cursor: `runtime-log:${ordinal}`,
      emittedAt: input.emittedAt ?? new Date().toISOString(),
      kind: input.kind,
      ...(input.causality ? { causality: input.causality } : {}),
      ...(input.entity ? { entity: input.entity } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    }
    const line = `${JSON.stringify(event)}\n`
    const eventOffset = this.index.bytes
    const eventBytes = Buffer.byteLength(line)
    mkdirSync(dirname(this.eventsPath), { recursive: true })
    appendFileSync(this.eventsPath, line, 'utf8')
    this.appendMessageOffsetIndexEvent(event, { offset: eventOffset, bytes: eventBytes })
    this.appendStepOffsetIndexEvent(event, { offset: eventOffset, bytes: eventBytes })
    this.appendTraceOffsetIndexEvent(event, { offset: eventOffset, bytes: eventBytes })
    this.applyIndexEvent(event, { offset: eventOffset, bytes: eventBytes })
    this.persistIndex()
    return event
  }

  scan(input: {
    onEvent: (event: AgentRuntimeLogEvent, meta: RuntimeLogScannedEventMeta) => void
    onProgress?: (progress: RuntimeLogScanProgress) => void
  }): RuntimeLogScanResult {
    const totalBytes = fileSizeSafe(this.eventsPath) ?? 0
    if (!existsSync(this.eventsPath)) {
      return { bytesRead: 0, totalBytes: 0, linesRead: 0, eventsRead: 0, malformedLines: 0 }
    }
    const fd = openSync(this.eventsPath, 'r')
    const buffer = Buffer.alloc(SCAN_CHUNK_BYTES)
    let carry = ''
    let bytesReadTotal = 0
    let linesRead = 0
    let eventsRead = 0
    let malformedLines = 0
    let nextLineOffset = 0
    try {
      while (true) {
        const read = readSync(fd, buffer, 0, buffer.length, null)
        if (read <= 0) break
        bytesReadTotal += read
        const text = carry + buffer.subarray(0, read).toString('utf8')
        const lines = text.split('\n')
        carry = lines.pop() ?? ''
        for (const line of lines) {
          const lineBytes = Buffer.byteLength(`${line}\n`)
          const lineOffset = nextLineOffset
          nextLineOffset += lineBytes
          const parsed = parseRuntimeLogLine(line)
          linesRead += 1
          if (!parsed) {
            if (line.trim()) malformedLines += 1
            continue
          }
          eventsRead += 1
          input.onEvent(parsed, { offset: lineOffset, bytes: lineBytes })
        }
        input.onProgress?.({ bytesRead: bytesReadTotal, totalBytes, linesRead, eventsRead })
      }
      if (carry.trim()) {
        const lineBytes = Buffer.byteLength(carry)
        const parsed = parseRuntimeLogLine(carry)
        linesRead += 1
        if (parsed) {
          eventsRead += 1
          input.onEvent(parsed, { offset: nextLineOffset, bytes: lineBytes })
        } else {
          malformedLines += 1
        }
      }
    } finally {
      closeSync(fd)
    }
    const result = { bytesRead: bytesReadTotal, totalBytes, linesRead, eventsRead, malformedLines }
    input.onProgress?.(result)
    return result
  }

  listThreadMessagesPage(input: {
    threadId: string
    afterOrdinal?: number
    limit?: number
    direction?: 'asc' | 'desc'
  }): RuntimeLogThreadMessagesPage {
    const startedAt = Date.now()
    const limit = clampPositiveInteger(input.limit, 100, 1, 500)
    const afterOrdinal = Math.max(0, Math.floor(input.afterOrdinal ?? 0))
    const direction = input.direction ?? 'asc'
    let indexScan = this.scanMessageOffsetIndex({ threadId: input.threadId })
    if (indexScan.malformedLines > 0) {
      this.rebuildIndexFromEvents()
      indexScan = this.scanMessageOffsetIndex({ threadId: input.threadId })
    }
    const orderedRecords = currentMessageOffsetRecords(indexScan.records, direction)
      .filter((item) => direction === 'asc' ? item.orderOrdinal > afterOrdinal : afterOrdinal <= 0 || item.orderOrdinal < afterOrdinal)
    const pageRecords = orderedRecords.slice(0, limit)
    const hasMore = orderedRecords.length > limit
    const pageMessages: Array<{ orderOrdinal: number; message: AgentMessage }> = []
    let eventBytesRead = 0
    for (const item of pageRecords) {
      const record = item.record
      const event = this.readEventAtOffset(record.eventOffset, record.eventBytes)
      if (event?.kind !== 'message.upserted' || event.entity?.type !== 'message') continue
      if (event.entity.value.threadId !== input.threadId) continue
      eventBytesRead += record.eventBytes
      pageMessages.push({ orderOrdinal: item.orderOrdinal, message: event.entity.value })
    }
    const lastPageMessage = pageMessages.at(-1)
    return {
      threadId: input.threadId,
      messages: pageMessages.map((item) => item.message),
      ...(lastPageMessage ? { nextAfterOrdinal: lastPageMessage.orderOrdinal } : {}),
      hasMore,
      scan: {
        durationMs: Date.now() - startedAt,
        bytesRead: indexScan.bytesRead + eventBytesRead,
        totalBytes: indexScan.totalBytes + (fileSizeSafe(this.eventsPath) ?? 0),
        linesRead: indexScan.linesRead,
        eventsRead: indexScan.recordsRead,
        matchedEvents: indexScan.matchedRecords,
        malformedLines: indexScan.malformedLines,
      },
    }
  }

  listRunSteps(runId: string): AgentRunStep[] {
    let indexScan = this.scanStepOffsetIndex({ runId })
    if (indexScan.malformedLines > 0) {
      this.rebuildIndexFromEvents()
      indexScan = this.scanStepOffsetIndex({ runId })
    }
    const matchedSteps: Array<{ ordinal: number; step: AgentRunStep }> = []
    for (const record of indexScan.records) {
      const event = this.readEventAtOffset(record.eventOffset, record.eventBytes)
      if (event?.kind !== 'step.upserted' || event.entity?.type !== 'step') continue
      if (event.entity.value.runId !== runId) continue
      matchedSteps.push({ ordinal: event.ordinal, step: event.entity.value })
    }
    return dedupeStepEventsById(matchedSteps).map((item) => item.step)
  }

  listRunTraceEvents(runId: string): AgentTraceEvent[] {
    let indexScan = this.scanTraceOffsetIndex({ runId })
    if (indexScan.malformedLines > 0) {
      this.rebuildIndexFromEvents()
      indexScan = this.scanTraceOffsetIndex({ runId })
    }
    const matchedTraces: Array<{ ordinal: number; trace: AgentTraceEvent }> = []
    for (const record of indexScan.records) {
      const event = this.readEventAtOffset(record.eventOffset, record.eventBytes)
      if (event?.kind !== 'trace.upserted' || event.entity?.type !== 'trace') continue
      if (event.entity.value.runId !== runId) continue
      matchedTraces.push({ ordinal: event.ordinal, trace: event.entity.value })
    }
    return dedupeTraceEventsById(matchedTraces).map((item) => item.trace)
  }

  writeJSONBlob(value: unknown, input: { scope: string[]; name: string }): RuntimeLogJSONBlobRef {
    const raw = Buffer.from(JSON.stringify(value) ?? 'null', 'utf8')
    const hash = sha256(raw)
    const compressed = gzipSync(raw)
    const blobPath = join(
      this.blobsPath,
      ...input.scope.map(safePathSegment),
      `${safePathSegment(input.name)}.${hash.slice('sha256:'.length, 'sha256:'.length + 16)}.json.gz`,
    )
    const relativePath = relative(this.storageDir, blobPath).split('\\').join('/')
    mkdirSync(dirname(blobPath), { recursive: true })
    if (!existsSync(blobPath)) writeFileSync(blobPath, compressed)
    return {
      runtimeLogBlobRef: true,
      path: relativePath,
      encoding: 'gzip',
      bytes: compressed.byteLength,
      originalBytes: raw.byteLength,
      hash,
    }
  }

  readJSONBlob(ref: RuntimeLogJSONBlobRef): unknown | undefined {
    if (!isRuntimeLogJSONBlobRef(ref)) return undefined
    const rootPath = resolve(this.storageDir)
    const blobPath = resolve(this.storageDir, ref.path)
    const relativeBlobPath = relative(rootPath, blobPath)
    if (relativeBlobPath.startsWith('..') || relativeBlobPath.startsWith('/') || relativeBlobPath === '') return undefined
    try {
      const raw = gunzipSync(readFileSync(blobPath))
      if (sha256(raw) !== ref.hash) return undefined
      return JSON.parse(raw.toString('utf8')) as unknown
    } catch {
      return undefined
    }
  }

  listCurrentEntityEvents(): AgentRuntimeLogEvent[] {
    const records: RuntimeLogCurrentEntityRecord[] = Object.values(this.index.currentEntities)
      .flatMap((items: Record<string, RuntimeLogCurrentEntityRecord>) => Object.values(items))
    return records
      .sort((left, right) => left.ordinal - right.ordinal)
      .flatMap((record) => {
        const event = this.readEventAtOffset(record.eventOffset, record.eventBytes)
        return event ? [event] : []
      })
  }

  rebuildIndexFromEvents(input: { onProgress?: (progress: RuntimeLogScanProgress) => void } = {}): RuntimeLogScanResult {
    this.index = emptyIndex()
    const messageIndexTmpPath = `${this.messageIndexPath}.${process.pid}.${Date.now()}.tmp`
    const stepIndexTmpPath = `${this.stepIndexPath}.${process.pid}.${Date.now()}.tmp`
    const traceIndexTmpPath = `${this.traceIndexPath}.${process.pid}.${Date.now()}.tmp`
    mkdirSync(dirname(messageIndexTmpPath), { recursive: true })
    mkdirSync(dirname(stepIndexTmpPath), { recursive: true })
    mkdirSync(dirname(traceIndexTmpPath), { recursive: true })
    writeFileSync(messageIndexTmpPath, '', 'utf8')
    writeFileSync(stepIndexTmpPath, '', 'utf8')
    writeFileSync(traceIndexTmpPath, '', 'utf8')
    rmSync(this.messageThreadIndexesPath, { recursive: true, force: true })
    rmSync(this.stepRunIndexesPath, { recursive: true, force: true })
    rmSync(this.traceRunIndexesPath, { recursive: true, force: true })
    const result = this.scan({
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
      onEvent: (event, meta) => {
        this.appendMessageOffsetIndexEvent(event, meta, messageIndexTmpPath)
        this.appendStepOffsetIndexEvent(event, meta, stepIndexTmpPath)
        this.appendTraceOffsetIndexEvent(event, meta, traceIndexTmpPath)
        this.applyIndexEvent(event, meta)
      },
    })
    this.index.bytes = fileSizeSafe(this.eventsPath) ?? this.index.bytes
    renameSync(messageIndexTmpPath, this.messageIndexPath)
    renameSync(stepIndexTmpPath, this.stepIndexPath)
    renameSync(traceIndexTmpPath, this.traceIndexPath)
    this.persistIndex()
    return result
  }

  private loadIndex(): RuntimeLogIndex {
    if (!existsSync(this.indexPath)) return emptyIndex()
    try {
      const parsed = JSON.parse(readFileSync(this.indexPath, 'utf8')) as unknown
      if (!isRecord(parsed) || parsed.version !== 1) return emptyIndex()
      return {
        version: 1,
        eventCount: nonNegativeInteger(parsed.eventCount),
        lastOrdinal: nonNegativeInteger(parsed.lastOrdinal),
        bytes: nonNegativeInteger(parsed.bytes),
        messageOffsetIndex: offsetIndexStats<RuntimeLogMessageOffsetIndexStats>(parsed.messageOffsetIndex),
        stepOffsetIndex: offsetIndexStats<RuntimeLogStepOffsetIndexStats>(parsed.stepOffsetIndex),
        traceOffsetIndex: offsetIndexStats<RuntimeLogTraceOffsetIndexStats>(parsed.traceOffsetIndex),
        ...(typeof parsed.firstEventAt === 'string' ? { firstEventAt: parsed.firstEventAt } : {}),
        ...(typeof parsed.lastEventAt === 'string' ? { lastEventAt: parsed.lastEventAt } : {}),
        byKind: isRecord(parsed.byKind) ? parsed.byKind as Partial<Record<AgentRuntimeLogEventKind, number>> : {},
        sessions: entityIndexRecord(parsed.sessions),
        threads: entityIndexRecord(parsed.threads),
        runs: entityIndexRecord(parsed.runs),
        currentEntities: currentEntityIndex(parsed.currentEntities),
      }
    } catch {
      return emptyIndex()
    }
  }

  private ensureIndexMatchesEvents(): void {
    const eventsBytes = fileSizeSafe(this.eventsPath)
    if (eventsBytes === undefined) return
    const messageIndexBytes = fileSizeSafe(this.messageIndexPath) ?? 0
    const stepIndexBytes = fileSizeSafe(this.stepIndexPath) ?? 0
    const traceIndexBytes = fileSizeSafe(this.traceIndexPath) ?? 0
    const messageEventCount = this.index.byKind['message.upserted'] ?? 0
    const stepEventCount = this.index.byKind['step.upserted'] ?? 0
    const traceEventCount = this.index.byKind['trace.upserted'] ?? 0
    if (
      this.index.bytes !== eventsBytes
      || (messageEventCount > 0 && !existsSync(this.messageIndexPath))
      || (messageEventCount > 0 && !existsSync(this.messageThreadIndexesPath))
      || this.index.messageOffsetIndex.bytes !== messageIndexBytes
      || (stepEventCount > 0 && !existsSync(this.stepIndexPath))
      || (stepEventCount > 0 && !existsSync(this.stepRunIndexesPath))
      || this.index.stepOffsetIndex.bytes !== stepIndexBytes
      || (traceEventCount > 0 && !existsSync(this.traceIndexPath))
      || (traceEventCount > 0 && !existsSync(this.traceRunIndexesPath))
      || this.index.traceOffsetIndex.bytes !== traceIndexBytes
    ) {
      this.rebuildIndexFromEvents({ onProgress: this.onIndexRebuildProgress })
    }
  }

  private applyIndexEvent(event: AgentRuntimeLogEvent, meta: RuntimeLogScannedEventMeta): void {
    this.index.eventCount += 1
    this.index.lastOrdinal = Math.max(this.index.lastOrdinal, event.ordinal)
    this.index.bytes += meta.bytes
    this.index.byKind[event.kind] = (this.index.byKind[event.kind] ?? 0) + 1
    this.index.firstEventAt = minDate(this.index.firstEventAt, event.emittedAt)
    this.index.lastEventAt = maxDate(this.index.lastEventAt, event.emittedAt)
    if (event.causality?.sessionId) updateEntityIndex(this.index.sessions, event.causality.sessionId, event.emittedAt)
    if (event.causality?.threadId) updateEntityIndex(this.index.threads, event.causality.threadId, event.emittedAt)
    if (event.causality?.runId) updateEntityIndex(this.index.runs, event.causality.runId, event.emittedAt)
    applyCurrentEntityIndexEvent(this.index.currentEntities, event, meta)
  }

  private appendMessageOffsetIndexEvent(event: AgentRuntimeLogEvent, meta: RuntimeLogScannedEventMeta, outputPath = this.messageIndexPath): void {
    if (event.kind !== 'message.upserted' || event.entity?.type !== 'message') return
    const message = event.entity.value
    const record: RuntimeLogMessageOffsetIndexRecord = {
      schema: AGENT_RUNTIME_LOG_MESSAGE_INDEX_V1_SCHEMA,
      threadId: message.threadId,
      messageId: message.id,
      ordinal: event.ordinal,
      emittedAt: event.emittedAt,
      createdAt: message.createdAt,
      eventOffset: meta.offset,
      eventBytes: meta.bytes,
    }
    const lineBytes = this.appendMessageOffsetIndexRecord(outputPath, record)
    this.appendMessageOffsetIndexRecord(this.threadMessageIndexPath(message.threadId), record)
    this.index.messageOffsetIndex.recordCount += 1
    this.index.messageOffsetIndex.bytes += lineBytes
  }

  private appendMessageOffsetIndexRecord(outputPath: string, record: RuntimeLogMessageOffsetIndexRecord): number {
    const line = `${JSON.stringify(record)}\n`
    mkdirSync(dirname(outputPath), { recursive: true })
    appendFileSync(outputPath, line, 'utf8')
    return Buffer.byteLength(line)
  }

  private threadMessageIndexPath(threadId: string): string {
    return join(this.messageThreadIndexesPath, `${safePathSegment(threadId)}.jsonl`)
  }
  private appendStepOffsetIndexEvent(event: AgentRuntimeLogEvent, meta: RuntimeLogScannedEventMeta, outputPath = this.stepIndexPath): void {
    if (event.kind !== 'step.upserted' || event.entity?.type !== 'step') return
    const step = event.entity.value
    const record: RuntimeLogStepOffsetIndexRecord = {
      schema: AGENT_RUNTIME_LOG_STEP_INDEX_V1_SCHEMA,
      runId: step.runId,
      stepId: step.id,
      ordinal: event.ordinal,
      emittedAt: event.emittedAt,
      createdAt: step.createdAt ?? event.emittedAt,
      eventOffset: meta.offset,
      eventBytes: meta.bytes,
    }
    const lineBytes = this.appendStepOffsetIndexRecord(outputPath, record)
    this.appendStepOffsetIndexRecord(this.runStepIndexPath(step.runId), record)
    this.index.stepOffsetIndex.recordCount += 1
    this.index.stepOffsetIndex.bytes += lineBytes
  }

  private appendStepOffsetIndexRecord(outputPath: string, record: RuntimeLogStepOffsetIndexRecord): number {
    const line = `${JSON.stringify(record)}\n`
    mkdirSync(dirname(outputPath), { recursive: true })
    appendFileSync(outputPath, line, 'utf8')
    return Buffer.byteLength(line)
  }

  private runStepIndexPath(runId: string): string {
    return join(this.stepRunIndexesPath, `${safePathSegment(runId)}.jsonl`)
  }

  private appendTraceOffsetIndexEvent(event: AgentRuntimeLogEvent, meta: RuntimeLogScannedEventMeta, outputPath = this.traceIndexPath): void {
    if (event.kind !== 'trace.upserted' || event.entity?.type !== 'trace') return
    const trace = event.entity.value
    const record: RuntimeLogTraceOffsetIndexRecord = {
      schema: AGENT_RUNTIME_LOG_TRACE_INDEX_V1_SCHEMA,
      runId: trace.runId,
      traceId: trace.id,
      ordinal: event.ordinal,
      emittedAt: event.emittedAt,
      createdAt: trace.createdAt,
      eventOffset: meta.offset,
      eventBytes: meta.bytes,
    }
    const lineBytes = this.appendTraceOffsetIndexRecord(outputPath, record)
    this.appendTraceOffsetIndexRecord(this.runTraceIndexPath(trace.runId), record)
    this.index.traceOffsetIndex.recordCount += 1
    this.index.traceOffsetIndex.bytes += lineBytes
  }

  private appendTraceOffsetIndexRecord(outputPath: string, record: RuntimeLogTraceOffsetIndexRecord): number {
    const line = `${JSON.stringify(record)}\n`
    mkdirSync(dirname(outputPath), { recursive: true })
    appendFileSync(outputPath, line, 'utf8')
    return Buffer.byteLength(line)
  }

  private runTraceIndexPath(runId: string): string {
    return join(this.traceRunIndexesPath, `${safePathSegment(runId)}.jsonl`)
  }

  private scanMessageOffsetIndex(input: { threadId: string }): {
    records: RuntimeLogMessageOffsetIndexRecord[]
    bytesRead: number
    totalBytes: number
    linesRead: number
    recordsRead: number
    matchedRecords: number
    malformedLines: number
  } {
    const threadIndexPath = this.threadMessageIndexPath(input.threadId)
    const indexPath = existsSync(threadIndexPath) ? threadIndexPath : this.messageIndexPath
    const totalBytes = fileSizeSafe(indexPath) ?? 0
    if (!existsSync(indexPath)) {
      return { records: [], bytesRead: 0, totalBytes: 0, linesRead: 0, recordsRead: 0, matchedRecords: 0, malformedLines: 0 }
    }
    const records: RuntimeLogMessageOffsetIndexRecord[] = []
    const fd = openSync(indexPath, 'r')
    const buffer = Buffer.alloc(SCAN_CHUNK_BYTES)
    let carry = ''
    let bytesReadTotal = 0
    let linesRead = 0
    let recordsRead = 0
    let malformedLines = 0
    try {
      while (true) {
        const read = readSync(fd, buffer, 0, buffer.length, null)
        if (read <= 0) break
        bytesReadTotal += read
        const text = carry + buffer.subarray(0, read).toString('utf8')
        const lines = text.split('\n')
        carry = lines.pop() ?? ''
        for (const line of lines) {
          linesRead += 1
          const record = parseMessageOffsetIndexLine(line)
          if (!record) {
            if (line.trim()) malformedLines += 1
            continue
          }
          recordsRead += 1
          if (record.threadId === input.threadId) records.push(record)
        }
      }
      if (carry.trim()) {
        linesRead += 1
        const record = parseMessageOffsetIndexLine(carry)
        if (record) {
          recordsRead += 1
          if (record.threadId === input.threadId) records.push(record)
        } else {
          malformedLines += 1
        }
      }
    } finally {
      closeSync(fd)
    }
    return {
      records,
      bytesRead: bytesReadTotal,
      totalBytes,
      linesRead,
      recordsRead,
      matchedRecords: records.length,
      malformedLines,
    }
  }

  private scanStepOffsetIndex(input: { runId: string }): {
    records: RuntimeLogStepOffsetIndexRecord[]
    bytesRead: number
    totalBytes: number
    linesRead: number
    recordsRead: number
    matchedRecords: number
    malformedLines: number
  } {
    const runIndexPath = this.runStepIndexPath(input.runId)
    const indexPath = existsSync(runIndexPath) ? runIndexPath : this.stepIndexPath
    const totalBytes = fileSizeSafe(indexPath) ?? 0
    if (!existsSync(indexPath)) {
      return { records: [], bytesRead: 0, totalBytes: 0, linesRead: 0, recordsRead: 0, matchedRecords: 0, malformedLines: 0 }
    }
    const records: RuntimeLogStepOffsetIndexRecord[] = []
    const fd = openSync(indexPath, 'r')
    const buffer = Buffer.alloc(SCAN_CHUNK_BYTES)
    let carry = ''
    let bytesReadTotal = 0
    let linesRead = 0
    let recordsRead = 0
    let malformedLines = 0
    try {
      while (true) {
        const read = readSync(fd, buffer, 0, buffer.length, null)
        if (read <= 0) break
        bytesReadTotal += read
        const text = carry + buffer.subarray(0, read).toString('utf8')
        const lines = text.split('\n')
        carry = lines.pop() ?? ''
        for (const line of lines) {
          linesRead += 1
          const record = parseStepOffsetIndexLine(line)
          if (!record) {
            if (line.trim()) malformedLines += 1
            continue
          }
          recordsRead += 1
          if (record.runId === input.runId) records.push(record)
        }
      }
      if (carry.trim()) {
        linesRead += 1
        const record = parseStepOffsetIndexLine(carry)
        if (record) {
          recordsRead += 1
          if (record.runId === input.runId) records.push(record)
        } else {
          malformedLines += 1
        }
      }
    } finally {
      closeSync(fd)
    }
    return {
      records,
      bytesRead: bytesReadTotal,
      totalBytes,
      linesRead,
      recordsRead,
      matchedRecords: records.length,
      malformedLines,
    }
  }

  private scanTraceOffsetIndex(input: { runId: string }): {
    records: RuntimeLogTraceOffsetIndexRecord[]
    bytesRead: number
    totalBytes: number
    linesRead: number
    recordsRead: number
    matchedRecords: number
    malformedLines: number
  } {
    const runIndexPath = this.runTraceIndexPath(input.runId)
    const indexPath = existsSync(runIndexPath) ? runIndexPath : this.traceIndexPath
    const totalBytes = fileSizeSafe(indexPath) ?? 0
    if (!existsSync(indexPath)) {
      return { records: [], bytesRead: 0, totalBytes: 0, linesRead: 0, recordsRead: 0, matchedRecords: 0, malformedLines: 0 }
    }
    const records: RuntimeLogTraceOffsetIndexRecord[] = []
    const fd = openSync(indexPath, 'r')
    const buffer = Buffer.alloc(SCAN_CHUNK_BYTES)
    let carry = ''
    let bytesReadTotal = 0
    let linesRead = 0
    let recordsRead = 0
    let malformedLines = 0
    try {
      while (true) {
        const read = readSync(fd, buffer, 0, buffer.length, null)
        if (read <= 0) break
        bytesReadTotal += read
        const text = carry + buffer.subarray(0, read).toString('utf8')
        const lines = text.split('\n')
        carry = lines.pop() ?? ''
        for (const line of lines) {
          linesRead += 1
          const record = parseTraceOffsetIndexLine(line)
          if (!record) {
            if (line.trim()) malformedLines += 1
            continue
          }
          recordsRead += 1
          if (record.runId === input.runId) records.push(record)
        }
      }
      if (carry.trim()) {
        linesRead += 1
        const record = parseTraceOffsetIndexLine(carry)
        if (record) {
          recordsRead += 1
          if (record.runId === input.runId) records.push(record)
        } else {
          malformedLines += 1
        }
      }
    } finally {
      closeSync(fd)
    }
    return {
      records,
      bytesRead: bytesReadTotal,
      totalBytes,
      linesRead,
      recordsRead,
      matchedRecords: records.length,
      malformedLines,
    }
  }

  private readEventAtOffset(offset: number, bytes: number): AgentRuntimeLogEvent | undefined {
    if (offset < 0 || bytes <= 0) return undefined
    if (!existsSync(this.eventsPath)) return undefined
    const fd = openSync(this.eventsPath, 'r')
    try {
      const buffer = Buffer.alloc(bytes)
      const read = readSync(fd, buffer, 0, bytes, offset)
      if (read <= 0) return undefined
      return parseRuntimeLogLine(buffer.subarray(0, read).toString('utf8'))
    } finally {
      closeSync(fd)
    }
  }

  private persistIndex(): void {
    mkdirSync(dirname(this.indexPath), { recursive: true })
    const tmpPath = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmpPath, `${JSON.stringify(this.index, null, 2)}\n`, 'utf8')
    renameSync(tmpPath, this.indexPath)
  }
}

export function isRuntimeLogJSONBlobRef(value: unknown): value is RuntimeLogJSONBlobRef {
  return isRecord(value)
    && value.runtimeLogBlobRef === true
    && typeof value.path === 'string'
    && value.encoding === 'gzip'
    && typeof value.bytes === 'number'
    && Number.isFinite(value.bytes)
    && typeof value.originalBytes === 'number'
    && Number.isFinite(value.originalBytes)
    && typeof value.hash === 'string'
}

function parseRuntimeLogLine(line: string): AgentRuntimeLogEvent | undefined {
  if (!line.trim()) return undefined
  try {
    const parsed = JSON.parse(line) as unknown
    if (!isRuntimeLogEvent(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function isRuntimeLogEvent(value: unknown): value is AgentRuntimeLogEvent {
  return isRecord(value)
    && value.schema === AGENT_RUNTIME_LOG_EVENT_V1_SCHEMA
    && typeof value.id === 'string'
    && typeof value.ordinal === 'number'
    && Number.isFinite(value.ordinal)
    && typeof value.cursor === 'string'
    && typeof value.emittedAt === 'string'
    && typeof value.kind === 'string'
}

function parseMessageOffsetIndexLine(line: string): RuntimeLogMessageOffsetIndexRecord | undefined {
  if (!line.trim()) return undefined
  try {
    const parsed = JSON.parse(line) as unknown
    if (!isMessageOffsetIndexRecord(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function isMessageOffsetIndexRecord(value: unknown): value is RuntimeLogMessageOffsetIndexRecord {
  return isRecord(value)
    && value.schema === AGENT_RUNTIME_LOG_MESSAGE_INDEX_V1_SCHEMA
    && typeof value.threadId === 'string'
    && typeof value.messageId === 'string'
    && typeof value.ordinal === 'number'
    && Number.isFinite(value.ordinal)
    && typeof value.emittedAt === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.eventOffset === 'number'
    && Number.isFinite(value.eventOffset)
    && typeof value.eventBytes === 'number'
    && Number.isFinite(value.eventBytes)
}

function parseStepOffsetIndexLine(line: string): RuntimeLogStepOffsetIndexRecord | undefined {
  if (!line.trim()) return undefined
  try {
    const parsed = JSON.parse(line) as unknown
    if (!isStepOffsetIndexRecord(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function isStepOffsetIndexRecord(value: unknown): value is RuntimeLogStepOffsetIndexRecord {
  return isRecord(value)
    && value.schema === AGENT_RUNTIME_LOG_STEP_INDEX_V1_SCHEMA
    && typeof value.runId === 'string'
    && typeof value.stepId === 'string'
    && typeof value.ordinal === 'number'
    && Number.isFinite(value.ordinal)
    && typeof value.emittedAt === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.eventOffset === 'number'
    && Number.isFinite(value.eventOffset)
    && typeof value.eventBytes === 'number'
    && Number.isFinite(value.eventBytes)
}

function parseTraceOffsetIndexLine(line: string): RuntimeLogTraceOffsetIndexRecord | undefined {
  if (!line.trim()) return undefined
  try {
    const parsed = JSON.parse(line) as unknown
    if (!isTraceOffsetIndexRecord(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function isTraceOffsetIndexRecord(value: unknown): value is RuntimeLogTraceOffsetIndexRecord {
  return isRecord(value)
    && value.schema === AGENT_RUNTIME_LOG_TRACE_INDEX_V1_SCHEMA
    && typeof value.runId === 'string'
    && typeof value.traceId === 'string'
    && typeof value.ordinal === 'number'
    && Number.isFinite(value.ordinal)
    && typeof value.emittedAt === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.eventOffset === 'number'
    && Number.isFinite(value.eventOffset)
    && typeof value.eventBytes === 'number'
    && Number.isFinite(value.eventBytes)
}

function emptyIndex(): RuntimeLogIndex {
  return {
    version: 1,
    eventCount: 0,
    lastOrdinal: 0,
    bytes: 0,
    messageOffsetIndex: { recordCount: 0, bytes: 0 },
    stepOffsetIndex: { recordCount: 0, bytes: 0 },
    traceOffsetIndex: { recordCount: 0, bytes: 0 },
    byKind: {},
    sessions: {},
    threads: {},
    runs: {},
    currentEntities: emptyCurrentEntityIndex(),
  }
}

function emptyCurrentEntityIndex(): RuntimeLogCurrentEntityIndex {
  return {
    sessions: {},
    threads: {},
    runs: {},
    taskGraphs: {},
    tasks: {},
    works: {},
    interactions: {},
    continuations: {},
    wakeEvents: {},
    debugLedgers: {},
  }
}

function offsetIndexStats<T extends { recordCount: number; bytes: number }>(value: unknown): T {
  if (!isRecord(value)) return { recordCount: 0, bytes: 0 } as T
  return {
    recordCount: nonNegativeInteger(value.recordCount),
    bytes: nonNegativeInteger(value.bytes),
  } as T
}

function entityIndexRecord(value: unknown): Record<string, RuntimeLogEntityIndex> {
  if (!isRecord(value)) return {}
  const result: Record<string, RuntimeLogEntityIndex> = {}
  for (const [id, item] of Object.entries(value)) {
    if (!isRecord(item)) continue
    result[id] = {
      id,
      eventCount: nonNegativeInteger(item.eventCount),
      ...(typeof item.firstEventAt === 'string' ? { firstEventAt: item.firstEventAt } : {}),
      ...(typeof item.lastEventAt === 'string' ? { lastEventAt: item.lastEventAt } : {}),
    }
  }
  return result
}

function currentEntityIndex(value: unknown): RuntimeLogCurrentEntityIndex {
  if (!isRecord(value)) return emptyCurrentEntityIndex()
  return {
    sessions: currentEntityRecordMap(value.sessions),
    threads: currentEntityRecordMap(value.threads),
    runs: currentEntityRecordMap(value.runs),
    taskGraphs: currentEntityRecordMap(value.taskGraphs),
    tasks: currentEntityRecordMap(value.tasks),
    works: currentEntityRecordMap(value.works),
    interactions: currentEntityRecordMap(value.interactions),
    continuations: currentEntityRecordMap(value.continuations),
    wakeEvents: currentEntityRecordMap(value.wakeEvents),
    debugLedgers: currentEntityRecordMap(value.debugLedgers),
  }
}

function currentEntityRecordMap(value: unknown): Record<string, RuntimeLogCurrentEntityRecord> {
  if (!isRecord(value)) return {}
  const records: Record<string, RuntimeLogCurrentEntityRecord> = {}
  for (const [id, item] of Object.entries(value)) {
    if (!isRecord(item)) continue
    const record = currentEntityRecord(id, item)
    if (record) records[id] = record
  }
  return records
}

function currentEntityRecord(id: string, value: Record<string, unknown>): RuntimeLogCurrentEntityRecord | undefined {
  if (typeof value.type !== 'string'
    || typeof value.ordinal !== 'number'
    || typeof value.emittedAt !== 'string'
    || typeof value.eventOffset !== 'number'
    || typeof value.eventBytes !== 'number') return undefined
  return {
    type: value.type as AgentRuntimeLogEntity['type'],
    id,
    ordinal: nonNegativeInteger(value.ordinal),
    emittedAt: value.emittedAt,
    eventOffset: nonNegativeInteger(value.eventOffset),
    eventBytes: nonNegativeInteger(value.eventBytes),
    ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}),
    ...(typeof value.threadId === 'string' ? { threadId: value.threadId } : {}),
    ...(typeof value.runId === 'string' ? { runId: value.runId } : {}),
    ...(typeof value.taskGraphId === 'string' ? { taskGraphId: value.taskGraphId } : {}),
    ...(typeof value.taskId === 'string' ? { taskId: value.taskId } : {}),
  }
}

function applyCurrentEntityIndexEvent(index: RuntimeLogCurrentEntityIndex, event: AgentRuntimeLogEvent, meta: RuntimeLogScannedEventMeta): void {
  if (event.kind === 'scope.cleared') {
    clearRuntimeScopedCurrentEntities(index)
    return
  }
  if (event.kind === 'thread.deleted' && event.causality?.threadId) {
    removeCurrentEntitiesForThread(index, event.causality.threadId, event.payload)
    return
  }
  const entity = event.entity
  if (!entity) return
  const target = currentEntityTarget(index, entity.type)
  const id = currentEntityId(entity)
  if (!target || !id) return
  target[id] = {
    type: entity.type,
    id,
    ordinal: event.ordinal,
    emittedAt: event.emittedAt,
    eventOffset: meta.offset,
    eventBytes: meta.bytes,
    ...(event.causality?.sessionId ? { sessionId: event.causality.sessionId } : {}),
    ...(event.causality?.threadId ? { threadId: event.causality.threadId } : {}),
    ...(event.causality?.runId ? { runId: event.causality.runId } : {}),
    ...(event.causality?.taskGraphId ? { taskGraphId: event.causality.taskGraphId } : {}),
    ...(event.causality?.taskId ? { taskId: event.causality.taskId } : {}),
  }
}

function clearRuntimeScopedCurrentEntities(index: RuntimeLogCurrentEntityIndex): void {
  index.threads = {}
  index.runs = {}
  index.taskGraphs = {}
  index.tasks = {}
  index.works = {}
  index.interactions = {}
  index.continuations = {}
  index.wakeEvents = {}
  index.debugLedgers = {}
}

function removeCurrentEntitiesForThread(index: RuntimeLogCurrentEntityIndex, threadId: string, payload: unknown): void {
  delete index.threads[threadId]
  removeRecordsForThread(index.runs, threadId)
  removeRecordsForThread(index.taskGraphs, threadId)
  removeRecordsForThread(index.works, threadId)
  removeRecordsForThread(index.interactions, threadId)
  removeRecordsForThread(index.continuations, threadId)
  removeRecordsForThread(index.wakeEvents, threadId)
  removeRecordsForThread(index.debugLedgers, threadId)
  for (const id of stringArrayFromRecord(payload, 'deletedRunIds')) {
    delete index.runs[id]
    delete index.debugLedgers[id]
  }
  for (const id of stringArrayFromRecord(payload, 'deletedTaskGraphIds')) delete index.taskGraphs[id]
  for (const id of stringArrayFromRecord(payload, 'deletedTaskIds')) delete index.tasks[id]
  for (const id of stringArrayFromRecord(payload, 'deletedRuntimeWorkIds')) delete index.works[id]
  for (const id of stringArrayFromRecord(payload, 'deletedRuntimeInteractionIds')) delete index.interactions[id]
  for (const id of stringArrayFromRecord(payload, 'deletedRuntimeContinuationIds')) delete index.continuations[id]
  const deletedTaskGraphIds = new Set(stringArrayFromRecord(payload, 'deletedTaskGraphIds'))
  for (const [id, record] of Object.entries(index.tasks)) {
    if (record.threadId === threadId || (record.taskGraphId && deletedTaskGraphIds.has(record.taskGraphId))) delete index.tasks[id]
  }
}

function removeRecordsForThread(records: Record<string, RuntimeLogCurrentEntityRecord>, threadId: string): void {
  for (const [id, record] of Object.entries(records)) {
    if (record.threadId === threadId) delete records[id]
  }
}

function stringArrayFromRecord(value: unknown, key: string): string[] {
  if (!isRecord(value)) return []
  const candidate = value[key]
  return Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === 'string') : []
}

function currentEntityTarget(index: RuntimeLogCurrentEntityIndex, type: AgentRuntimeLogEntity['type']): Record<string, RuntimeLogCurrentEntityRecord> | undefined {
  if (type === 'session') return index.sessions
  if (type === 'thread') return index.threads
  if (type === 'run') return index.runs
  if (type === 'task_graph') return index.taskGraphs
  if (type === 'task') return index.tasks
  if (type === 'work') return index.works
  if (type === 'interaction') return index.interactions
  if (type === 'continuation') return index.continuations
  if (type === 'wake_event') return index.wakeEvents
  if (type === 'debug_ledger') return index.debugLedgers
  return undefined
}

function currentEntityId(entity: AgentRuntimeLogEntity): string | undefined {
  if (entity.type === 'session') return entity.value.id
  if (entity.type === 'thread') return entity.value.id
  if (entity.type === 'run') return entity.value.id
  if (entity.type === 'task_graph') return entity.value.id
  if (entity.type === 'task') return entity.value.id
  if (entity.type === 'work') return entity.value.id
  if (entity.type === 'interaction') return entity.value.id
  if (entity.type === 'continuation') return entity.value.id
  if (entity.type === 'wake_event') return entity.value.id
  if (entity.type === 'debug_ledger') return entity.value.runId
  return undefined
}

function updateEntityIndex(index: Record<string, RuntimeLogEntityIndex>, id: string, emittedAt: string): void {
  const current = index[id] ?? { id, eventCount: 0 }
  current.eventCount += 1
  current.firstEventAt = minDate(current.firstEventAt, emittedAt)
  current.lastEventAt = maxDate(current.lastEventAt, emittedAt)
  index[id] = current
}

function minDate(left: string | undefined, right: string): string {
  return left && left.localeCompare(right) <= 0 ? left : right
}

function maxDate(left: string | undefined, right: string): string {
  return left && left.localeCompare(right) >= 0 ? left : right
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function fileSizeSafe(filePath: string): number | undefined {
  try {
    return statSync(filePath).size
  } catch {
    return undefined
  }
}

function currentMessageOffsetRecords(records: RuntimeLogMessageOffsetIndexRecord[], direction: 'asc' | 'desc'): Array<{ orderOrdinal: number; record: RuntimeLogMessageOffsetIndexRecord }> {
  const byId = new Map<string, { orderOrdinal: number; record: RuntimeLogMessageOffsetIndexRecord }>()
  for (const record of records) {
    const current = byId.get(record.messageId)
    if (!current) {
      byId.set(record.messageId, { orderOrdinal: record.ordinal, record })
      continue
    }
    current.orderOrdinal = Math.min(current.orderOrdinal, record.ordinal)
    if (record.ordinal >= current.record.ordinal) current.record = record
  }
  const sorted = Array.from(byId.values()).sort((a, b) => {
    const byCreatedAt = a.record.createdAt.localeCompare(b.record.createdAt)
    if (byCreatedAt !== 0) return byCreatedAt
    return a.orderOrdinal - b.orderOrdinal
  })
  return direction === 'asc' ? sorted : sorted.reverse()
}

function dedupeStepEventsById(steps: Array<{ ordinal: number; step: AgentRunStep }>): Array<{ ordinal: number; step: AgentRunStep }> {
  const byId = new Map<string, { ordinal: number; step: AgentRunStep }>()
  for (const item of steps) byId.set(item.step.id, item)
  return Array.from(byId.values()).sort((a, b) => {
    const byCreatedAt = runStepEventTime(a.step, '').localeCompare(runStepEventTime(b.step, ''))
    if (byCreatedAt !== 0) return byCreatedAt
    return a.ordinal - b.ordinal
  })
}

function dedupeTraceEventsById(traces: Array<{ ordinal: number; trace: AgentTraceEvent }>): Array<{ ordinal: number; trace: AgentTraceEvent }> {
  const byId = new Map<string, { ordinal: number; trace: AgentTraceEvent }>()
  for (const item of traces) byId.set(item.trace.id, item)
  return Array.from(byId.values()).sort((a, b) => {
    const byCreatedAt = a.trace.createdAt.localeCompare(b.trace.createdAt)
    if (byCreatedAt !== 0) return byCreatedAt
    return a.ordinal - b.ordinal
  })
}

function runStepEventTime(step: AgentRunStep, fallback: string): string {
  const legacyStep = step as AgentRunStep & { startedAt?: unknown }
  const startedAt = typeof legacyStep.startedAt === 'string' ? legacyStep.startedAt : undefined
  return step.completedAt ?? startedAt ?? step.createdAt ?? fallback
}

function clampPositiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const integer = Math.floor(parsed)
  if (integer < min) return min
  if (integer > max) return max
  return integer
}

function jsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? 'null')
  } catch {
    return Buffer.byteLength(String(value))
  }
}

function safePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+$/, '_')
  return sanitized || '_'
}

function sha256(value: Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

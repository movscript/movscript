import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { RuntimeWork } from '../runtimeWork/runtimeWork.js'
import type {
  AgentSession,
  AgentTaskGraph,
  AgentRun,
  AgentRunStep,
  AgentTask,
  AgentThread,
  AgentTraceEvent,
  JSONValue,
  RuntimeContinuation,
  RuntimeInteraction,
  RuntimeWakeEvent,
} from './types.js'
import type { AgentRunTraceSummary, AgentTraceQuery } from '@movscript/protocol'
import { InMemoryAgentStore, type AgentStore, type AgentThreadClearResult, type AgentThreadDeletionResult } from './store.js'
import { FileTraceStore } from './fileTraceStore.js'
import type { AgentRunDebugLedger } from './runDebugLedger.js'
import { isRecord } from '../jsonValue.js'
import { isValidAgentProjectId } from '../context/runtimeContext.js'

interface AgentStateFile {
  version: 6
  sessions: AgentSession[]
  threads: AgentThread[]
  runs: AgentRun[]
  plans?: AgentTaskGraph[]
  tasks?: AgentTask[]
  runtimeWorks?: RuntimeWork[]
  runtimeInteractions?: RuntimeInteraction[]
  runtimeContinuations?: RuntimeContinuation[]
  runtimeWakeEvents: RuntimeWakeEvent[]
  traceEvents?: AgentTraceEvent[]
  debugLedgers?: AgentRunDebugLedger[]
}

const DEFAULT_COMPACT_LOAD_BYTES = 128 * 1024 * 1024
const DEFAULT_MAX_PERSISTED_RUN_STEP_RESULT_BYTES = 8 * 1024
const DEFAULT_MAX_PERSISTED_ROLLBACK_RECORD_BYTES = 16 * 1024
const DEFAULT_MAX_PERSISTED_ROLLBACK_RECORDS = 100
const DEFAULT_MAX_PERSISTED_ROLLBACK_RECORDS_BYTES = 64 * 1024
const MAX_COMPACT_SCALAR_STRING_CHARS = 500

export class FileAgentStore extends InMemoryAgentStore implements AgentStore {
  readonly filePath: string
  readonly tracePath: string
  private persistTimer: NodeJS.Timeout | undefined
  private dirty = false
  private flushing = false
  private readonly flushBeforeExit: () => void
  private readonly traceStore: FileTraceStore

  constructor(filePath = resolveAgentStatePath()) {
    super()
    this.filePath = filePath
    this.tracePath = resolveAgentTracePath(filePath)
    this.traceStore = new FileTraceStore(this.tracePath)
    const compactedOnLoad = this.load()
    this.flushBeforeExit = () => this.flush()
    process.once('beforeExit', this.flushBeforeExit)
    process.once('exit', this.flushBeforeExit)
    if (compactedOnLoad) {
      this.dirty = true
      const flushStartedAt = Date.now()
      this.flush()
      console.info(`[agent] startup state-store compact-flush elapsed=${Date.now() - flushStartedAt}ms ${this.filePath}`)
    }
  }

  override createSession(session: AgentSession): void {
    super.createSession(session)
    this.schedulePersist()
  }

  override updateSession(session: AgentSession): void {
    super.updateSession(session)
    this.schedulePersist()
  }

  override createThread(thread: AgentThread): void {
    super.createThread(thread)
    this.schedulePersist()
  }

  override updateThread(thread: AgentThread): void {
    super.updateThread(thread)
    this.schedulePersist()
  }

  override deleteThread(threadId: string): AgentThreadDeletionResult {
    const deletion = super.deleteThread(threadId)
    if (!deletion.deleted) return deletion
    this.traceStore.deleteRunTraceEvents(deletion.deletedRunIds, { threadId })
    this.schedulePersist()
    this.flush()
    return deletion
  }

  override deleteAllThreads(): AgentThreadClearResult {
    const deletion = super.deleteAllThreads()
    if (!deletion.deleted) return deletion
    this.traceStore.deleteRunTraceEvents(deletion.deletedRunIds)
    this.schedulePersist()
    this.flush()
    return deletion
  }

  override createRun(run: AgentRun): void {
    super.createRun(run)
    for (const event of Array.isArray(run.traceEvents) ? run.traceEvents : []) {
      this.traceStore.appendTraceEvent(event, { threadId: run.threadId })
    }
    this.schedulePersist()
  }

  override updateRun(run: AgentRun): void {
    super.updateRun(run)
    for (const event of Array.isArray(run.traceEvents) ? run.traceEvents : []) {
      this.traceStore.appendTraceEvent(event, { threadId: run.threadId })
    }
    this.schedulePersist()
  }

  override createTaskGraph(taskGraph: AgentTaskGraph): void {
    super.createTaskGraph(taskGraph)
    this.schedulePersist()
  }

  override updateTaskGraph(taskGraph: AgentTaskGraph): void {
    super.updateTaskGraph(taskGraph)
    this.schedulePersist()
  }

  override createTask(task: AgentTask): void {
    super.createTask(task)
    this.schedulePersist()
  }

  override updateTask(task: AgentTask): void {
    super.updateTask(task)
    this.schedulePersist()
  }

  override createRuntimeWork(work: RuntimeWork): void {
    super.createRuntimeWork(work)
    this.schedulePersist()
  }

  override updateRuntimeWork(work: RuntimeWork): void {
    super.updateRuntimeWork(work)
    this.schedulePersist()
  }

  override createRuntimeInteraction(interaction: RuntimeInteraction): void {
    super.createRuntimeInteraction(interaction)
    this.schedulePersist()
  }

  override updateRuntimeInteraction(interaction: RuntimeInteraction): void {
    super.updateRuntimeInteraction(interaction)
    this.schedulePersist()
  }

  override createRuntimeContinuation(continuation: RuntimeContinuation): void {
    super.createRuntimeContinuation(continuation)
    this.schedulePersist()
  }

  override updateRuntimeContinuation(continuation: RuntimeContinuation): void {
    super.updateRuntimeContinuation(continuation)
    this.schedulePersist()
  }

  override createRuntimeWakeEvent(event: RuntimeWakeEvent): void {
    super.createRuntimeWakeEvent(event)
    this.schedulePersist()
  }

  override updateRuntimeWakeEvent(event: RuntimeWakeEvent): void {
    super.updateRuntimeWakeEvent(event)
    this.schedulePersist()
  }

  override appendTraceEvent(event: AgentTraceEvent): void {
    super.appendTraceEvent(event)
    this.traceStore.appendTraceEvent(event, { threadId: super.getRun(event.runId)?.threadId })
    this.schedulePersist()
  }

  override listRunTraceEvents(runId: string, query: AgentTraceQuery = {}): AgentTraceEvent[] {
    return this.traceStore.listRunTraceEvents(runId, query) as AgentTraceEvent[]
  }

  override getRunTraceEventData(runId: string, eventId: string): unknown | undefined {
    return this.traceStore.getRunTraceEventData(runId, eventId)
  }

  override countRunTraceEvents(runId: string, query: Pick<AgentTraceQuery, 'kind'> = {}): number {
    return this.traceStore.countRunTraceEvents(runId, query)
  }

  override summarizeRunTraceEvents(runId: string): AgentRunTraceSummary {
    return this.traceStore.summarizeRunTraceEvents(runId)
  }

  override updateRunDebugLedger(runId: string, ledger: AgentRunDebugLedger): void {
    super.updateRunDebugLedger(runId, ledger)
    this.schedulePersist()
  }

  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = undefined
    }
    if (!this.dirty || this.flushing) return
    this.flushing = true
    try {
      this.dirty = false
      this.persist()
    } finally {
      this.flushing = false
      if (this.dirty) this.schedulePersist()
    }
  }

  private load(): boolean {
    if (!existsSync(this.filePath)) return false
    const loadStartedAt = Date.now()
    let parsed: unknown
    let compactedOnLoad = false
    let rawBytes = 0
    let readMs = 0
    let stripMs = 0
    let parseMs = 0
    try {
      const readStartedAt = Date.now()
      const raw = readFileSync(this.filePath, 'utf8')
      readMs = Date.now() - readStartedAt
      rawBytes = Buffer.byteLength(raw)
      const oversizedBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_STATE_COMPACT_LOAD_BYTES', DEFAULT_COMPACT_LOAD_BYTES)
      const shouldCompact = statSync(this.filePath).size > oversizedBytes
      const stripStartedAt = Date.now()
      const stateText = shouldCompact ? stripTopLevelArrayProperty(raw, 'traceEvents') : { text: raw, replaced: false }
      stripMs = Date.now() - stripStartedAt
      compactedOnLoad = stateText.replaced
      if (compactedOnLoad) {
        console.warn(`[agent] state file exceeded ${oversizedBytes} bytes; loading without persisted traceEvents and rewriting compact state (${this.filePath})`)
      }
      const parseStartedAt = Date.now()
      parsed = JSON.parse(stateText.text) as unknown
      parseMs = Date.now() - parseStartedAt
    } catch {
      return false
    }
    if (!isRecord(parsed)) return false
    const hydrateStartedAt = Date.now()
    let compactedRunCount = 0
    let migratedTraceEventCount = 0
    let debugLedgerCount = 0
    if (parsed.version !== 6) return false
    for (const session of arrayValue(parsed.sessions)) {
      if (!isRecord(session)) continue
      super.createSession(session as unknown as AgentSession)
    }
    for (const thread of arrayValue(parsed.threads)) {
      if (!isRecord(thread)) continue
      super.createThread(normalizeThread(thread as unknown as AgentThread))
    }
    for (const run of arrayValue(parsed.runs)) {
      if (!isRecord(run)) continue
      const compactedRun = compactPersistedRun(run as unknown as AgentRun)
      if (compactedRun.compacted) compactedRunCount += 1
      compactedOnLoad ||= compactedRun.compacted
      super.createRun(compactedRun.run)
    }
    for (const taskGraph of arrayValue(parsed.plans)) {
      if (!isRecord(taskGraph)) continue
      super.createTaskGraph(taskGraph as unknown as AgentTaskGraph)
    }
    for (const task of arrayValue(parsed.tasks)) {
      if (!isRecord(task)) continue
      super.createTask(task as unknown as AgentTask)
    }
    for (const work of arrayValue(parsed.runtimeWorks)) {
      if (!isRecord(work)) continue
      super.createRuntimeWork(work as unknown as RuntimeWork)
    }
    for (const interaction of arrayValue(parsed.runtimeInteractions)) {
      if (!isRecord(interaction)) continue
      super.createRuntimeInteraction(interaction as unknown as RuntimeInteraction)
    }
    for (const continuation of arrayValue(parsed.runtimeContinuations)) {
      if (!isRecord(continuation)) continue
      super.createRuntimeContinuation(continuation as unknown as RuntimeContinuation)
    }
    for (const event of arrayValue(parsed.runtimeWakeEvents)) {
      if (!isRecord(event)) continue
      super.createRuntimeWakeEvent(event as unknown as RuntimeWakeEvent)
    }
    for (const event of arrayValue(parsed.traceEvents)) {
      if (!isRecord(event)) continue
      const traceEvent = event as unknown as AgentTraceEvent
      migratedTraceEventCount += 1
      super.appendTraceEvent(traceEvent)
      this.traceStore.appendTraceEvent(traceEvent, { threadId: super.getRun(traceEvent.runId)?.threadId })
    }
    for (const ledger of arrayValue(parsed.debugLedgers)) {
      if (!isRecord(ledger) || ledger.schema !== 'movscript.agent.run-debug-ledger.v1' || typeof ledger.runId !== 'string') continue
      debugLedgerCount += 1
      super.updateRunDebugLedger(ledger.runId, ledger as unknown as AgentRunDebugLedger)
    }
    const hydrateMs = Date.now() - hydrateStartedAt
    console.info([
      '[agent] startup state-store load-detail',
      `total=${Date.now() - loadStartedAt}ms`,
      `read=${readMs}ms`,
      `strip=${stripMs}ms`,
      `parse=${parseMs}ms`,
      `hydrate=${hydrateMs}ms`,
      `rawBytes=${rawBytes}`,
      `sessions=${this.listSessions().length}`,
      `threads=${this.listThreads().length}`,
      `runs=${this.listRuns().length}`,
      `compactedRuns=${compactedRunCount}`,
      `migratedTraceEvents=${migratedTraceEventCount}`,
      `debugLedgers=${debugLedgerCount}`,
    ].join(' '))
    return compactedOnLoad
  }

  private schedulePersist(): void {
    this.dirty = true
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined
      this.flush()
    }, 250)
    this.persistTimer.unref?.()
  }

  private persist(): void {
    const runs = this.listRuns().map((run) => compactPersistedRun(run).run)
    const state: AgentStateFile = {
      version: 6,
      sessions: this.listSessions(),
      threads: this.listThreads(),
      runs,
      plans: this.listTaskGraphs(),
      tasks: this.listTasks(),
      runtimeWorks: this.listRuntimeWorks(),
      runtimeInteractions: this.listRuntimeInteractions(),
      runtimeContinuations: this.listRuntimeContinuations(),
      runtimeWakeEvents: this.listRuntimeWakeEvents(),
      debugLedgers: runs.flatMap((run) => this.getRunDebugLedger(run.id) ?? []),
    }
    atomicWriteJSON(this.filePath, state)
  }
}

export function resolveAgentStatePath(): string {
  if (process.env.MOVSCRIPT_AGENT_STATE_PATH) return process.env.MOVSCRIPT_AGENT_STATE_PATH
  if (process.env.MOVSCRIPT_AGENT_USER_DATA_DIR) {
    return join(process.env.MOVSCRIPT_AGENT_USER_DATA_DIR, 'state.json')
  }
  return join(process.cwd(), '.movscript-agent', 'state.json')
}

export function resolveAgentMemoryPath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_MEMORY_PATH) return process.env.MOVSCRIPT_AGENT_MEMORY_PATH
  if (statePath.endsWith('.json')) return statePath.replace(/\.json$/, '.memories.json')
  return join(statePath, 'memories.json')
}

export function resolveAgentTracePath(statePath = resolveAgentStatePath()): string {
  if (process.env.MOVSCRIPT_AGENT_TRACE_PATH) return process.env.MOVSCRIPT_AGENT_TRACE_PATH
  if (process.env.MOVSCRIPT_AGENT_USER_DATA_DIR) {
    return join(process.env.MOVSCRIPT_AGENT_USER_DATA_DIR, 'traces')
  }
  return join(dirname(statePath), 'traces')
}

export function fallbackUserStatePath(): string {
  return join(homedir(), '.movscript-agent', 'state.json')
}

export function atomicWriteJSON(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function normalizeThread(thread: AgentThread): AgentThread {
  const projectId = isValidAgentProjectId(thread.projectId) ? thread.projectId : undefined
  return {
    ...thread,
    ...(projectId !== undefined ? { projectId } : { projectId: undefined }),
    archived: thread.archived === true,
    status: thread.status ?? threadStatusFromRunStatus(thread.lastRunStatus),
    messages: Array.isArray(thread.messages) ? thread.messages : [],
  }
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function compactPersistedRun(run: AgentRun): { run: AgentRun; compacted: boolean } {
  let compacted = false
  const steps = Array.isArray(run.steps)
    ? run.steps.map((step) => {
      const next = compactPersistedRunStep(step)
      compacted ||= next.compacted
      return next.step
    })
    : []
  const metadata = compactPersistedRunMetadata(run.metadata)
  compacted ||= metadata.compacted
  return {
    run: {
      ...run,
      steps,
      ...(metadata.metadata ? { metadata: metadata.metadata } : { metadata: undefined }),
      traceEvents: [],
    },
    compacted: compacted || (Array.isArray(run.traceEvents) && run.traceEvents.length > 0),
  }
}

function compactPersistedRunStep(step: AgentRunStep): { step: AgentRunStep; compacted: boolean } {
  let compacted = false
  const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_MAX_PERSISTED_RUN_STEP_RESULT_BYTES', DEFAULT_MAX_PERSISTED_RUN_STEP_RESULT_BYTES)
  const next: AgentRunStep = { ...step }
  if (step.result !== undefined && shouldCompactJSONValue(step.result, 'persistedStepResultTruncated', maxBytes)) {
    next.result = compactPersistedJSONValue(step.result, {
      marker: 'persistedStepResultTruncated',
      originalBytesKey: 'originalResultBytes',
      previewLabel: 'resultPreview',
      maxBytes,
    })
    compacted = true
  }
  if (step.errorData !== undefined && shouldCompactJSONValue(step.errorData, 'persistedStepErrorDataTruncated', maxBytes)) {
    next.errorData = compactPersistedJSONValue(step.errorData, {
      marker: 'persistedStepErrorDataTruncated',
      originalBytesKey: 'originalErrorDataBytes',
      previewLabel: 'errorDataPreview',
      maxBytes,
    })
    compacted = true
  }
  return { step: next, compacted }
}

function compactPersistedRunMetadata(metadata: AgentRun['metadata']): { metadata?: AgentRun['metadata']; compacted: boolean } {
  if (!metadata) return { compacted: false }
  let compacted = false
  const next: NonNullable<AgentRun['metadata']> = { ...metadata }
  if (Array.isArray(metadata.rollbackRecords)) {
    if (isPersistedRollbackRecordArray(metadata.rollbackRecords)) {
      next.rollbackRecords = metadata.rollbackRecords as unknown as JSONValue
      return { metadata: next, compacted: false }
    }
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORD_BYTES', DEFAULT_MAX_PERSISTED_ROLLBACK_RECORD_BYTES)
    const maxRecords = readPositiveIntegerEnv('MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS', DEFAULT_MAX_PERSISTED_ROLLBACK_RECORDS)
    const maxRecordsBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_MAX_PERSISTED_ROLLBACK_RECORDS_BYTES', DEFAULT_MAX_PERSISTED_ROLLBACK_RECORDS_BYTES)
    const originalRecords = metadata.rollbackRecords
    const records = originalRecords.map((record) => {
      if (!shouldCompactJSONValue(record, 'persistedRollbackRecordTruncated', maxBytes)
        || isPersistedCompactRecord(record, 'persistedRollbackRecordSummary')) {
        return record as JSONValue
      }
      compacted = true
      return compactPersistedJSONValue(record, {
        marker: 'persistedRollbackRecordTruncated',
        originalBytesKey: 'originalRollbackRecordBytes',
        previewLabel: 'rollbackRecordPreview',
        maxBytes,
      })
    })
    const totalBytes = jsonByteLength(records)
    if (records.length > maxRecords || totalBytes > maxRecordsBytes) {
      compacted = true
      next.rollbackRecords = compactPersistedRollbackRecordArray(records, {
        originalCount: originalRecords.length,
        originalBytes: jsonByteLength(originalRecords),
        maxRecords,
        maxRecordsBytes,
      }) as unknown as JSONValue
      return { metadata: next, compacted }
    }
    next.rollbackRecords = records as unknown as JSONValue
  }
  return { metadata: next, compacted }
}

function shouldCompactJSONValue(value: unknown, marker: string, maxBytes: number): boolean {
  if (jsonByteLength(value) <= maxBytes) return false
  const record = isRecord(value) ? value : undefined
  return !record || record[marker] === true
    ? true
    : !isPersistedCompactRecord(record, marker)
}

function isPersistedRollbackRecordArray(records: unknown[]): boolean {
  return isPersistedCompactRecord(records[0], 'persistedRollbackRecordsTruncated')
}

function compactPersistedRollbackRecordArray(
  records: JSONValue[],
  input: {
    originalCount: number
    originalBytes: number
    maxRecords: number
    maxRecordsBytes: number
  },
): JSONValue[] {
  const keepCount = Math.max(1, input.maxRecords)
  const keptRecords = records.slice(-keepCount).map((record) => compactRollbackRecordSummary(record))
  const summary: Record<string, JSONValue> = {
    persistedRollbackRecordsTruncated: true,
    originalRollbackRecordCount: input.originalCount,
    originalRollbackRecordsBytes: input.originalBytes,
    keptRollbackRecordCount: keptRecords.length,
    maxRollbackRecords: input.maxRecords,
    maxRollbackRecordsBytes: input.maxRecordsBytes,
  }
  return [summary, ...keptRecords]
}

function compactRollbackRecordSummary(value: JSONValue): JSONValue {
  if (!isRecord(value)) return value
  const call = isRecord(value.call) ? value.call : undefined
  const rollback = isRecord(value.rollback) ? value.rollback : undefined
  const summary: Record<string, JSONValue> = {}
  if (call) {
    const callSummary: Record<string, JSONValue> = {}
    if (typeof call.id === 'string') callSummary.id = call.id
    if (typeof call.name === 'string') callSummary.name = call.name
    if (Object.keys(callSummary).length > 0) summary.call = callSummary
  }
  if (rollback) {
    const rollbackSummary: Record<string, JSONValue> = {}
    if (typeof rollback.policy === 'string') rollbackSummary.policy = rollback.policy
    if (typeof rollback.reason === 'string') rollbackSummary.reason = rollback.reason
    if (typeof rollback.artifactUri === 'string') rollbackSummary.artifactUri = rollback.artifactUri
    if (Object.keys(rollbackSummary).length > 0) summary.rollback = rollbackSummary
  }
  if (Object.keys(summary).length > 0) return summary
  return compactPersistedJSONValue(value, {
    marker: 'persistedRollbackRecordSummary',
    originalBytesKey: 'originalRollbackRecordBytes',
    previewLabel: 'rollbackRecordPreview',
    maxBytes: 1024,
  })
}

function compactPersistedJSONValue(
  value: unknown,
  input: {
    marker: string
    originalBytesKey: string
    previewLabel: string
    maxBytes: number
  },
): JSONValue {
  const originalBytes = jsonByteLength(value)
  const record = isRecord(value) ? value : undefined
  const compact: Record<string, JSONValue> = {
    [input.marker]: true,
    [input.originalBytesKey]: originalBytes,
  }
  if (record) {
    for (const [key, item] of Object.entries(record)) {
      if (key === 'result' || key === 'content' || key === 'bodyText' || key === 'snapshot' || key === 'proposal') continue
      if (item === null || typeof item === 'boolean') compact[key] = item
      if (typeof item === 'number' && Number.isFinite(item)) compact[key] = item
      if (typeof item === 'string') compact[key] = compactStringField(item)
    }
  }
  compact[input.previewLabel] = previewJSON(value, Math.min(2_000, Math.max(200, Math.floor(input.maxBytes / 4))))
  return compact
}

function isPersistedCompactRecord(value: unknown, marker: string): boolean {
  return isRecord(value) && value[marker] === true
}

function compactStringField(value: string): string {
  return value.length > MAX_COMPACT_SCALAR_STRING_CHARS
    ? `${value.slice(0, MAX_COMPACT_SCALAR_STRING_CHARS)}... [truncated ${value.length - MAX_COMPACT_SCALAR_STRING_CHARS} chars]`
    : value
}

function stripTopLevelArrayProperty(text: string, property: string): { text: string; replaced: boolean } {
  const key = JSON.stringify(property)
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (depth === 1 && text.startsWith(key, i)) {
      const colonIndex = text.indexOf(':', i + key.length)
      if (colonIndex < 0) return { text, replaced: false }
      const valueStart = findNextNonWhitespace(text, colonIndex + 1)
      if (valueStart < 0 || text[valueStart] !== '[') return { text, replaced: false }
      const valueEnd = findMatchingBracket(text, valueStart)
      if (valueEnd < 0) return { text, replaced: false }
      return {
        text: `${text.slice(0, valueStart)}[]${text.slice(valueEnd + 1)}`,
        replaced: true,
      }
    }
    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      depth -= 1
    }
  }
  return { text, replaced: false }
}

function findNextNonWhitespace(text: string, start: number): number {
  for (let i = start; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) return i
  }
  return -1
}

function findMatchingBracket(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '[') {
      depth += 1
    } else if (char === ']') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
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

function threadStatusFromRunStatus(status: AgentThread['lastRunStatus']): AgentThread['status'] {
  if (!status) return 'idle'
  if (status === 'queued' || status === 'in_progress') return 'running'
  if (status === 'requires_action') return 'requires_action'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return 'completed'
}

import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { updateAgentSessionRecord, type AgentSessionRuntimePaths } from '@movscript/agent-runtime'
import type { RuntimeWork } from '../../../runtime-work/core/runtimeWork.js'
import type {
  AgentApprovalRequest,
  AgentInputRequest,
  AgentMessage,
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
} from '../../shared/types.js'
import type { AgentRunTraceSummary, AgentTraceQuery } from '@movscript/protocol'
import { InMemoryAgentStore, type AgentStore, type AgentThreadClearResult, type AgentThreadDeletionResult } from '../core/store.js'
import { FileTraceStore } from '../trace/fileTraceStore.js'
import { FileRuntimeLogStore, type AgentRuntimeLogEvent, type AppendRuntimeLogEventInput, type RuntimeLogJSONBlobRef, type RuntimeLogThreadMessagesPage } from '../runtime-log/runtimeLogStore.js'
import { buildRunDebugLedgerFromTrace, type AgentRunDebugLedger } from '../../../trace/debug/ledger/runDebugLedger.js'
import { isRecord } from '../../../shared/json/jsonValue.js'
import type { RuntimeTelemetryRegistry } from '../../../telemetry/runtime/runtimeTelemetry.js'

interface RuntimeLogReplayState {
  wakeEvents: RuntimeWakeEvent[]
  stepsByRun: Map<string, AgentRunStep[]>
  messagesByThread: Map<string, AgentMessage[]>
}

const DEFAULT_MAX_PERSISTED_RUN_STEP_RESULT_BYTES = 8 * 1024
const DEFAULT_MAX_PERSISTED_ROLLBACK_RECORD_BYTES = 16 * 1024
const DEFAULT_MAX_PERSISTED_ROLLBACK_RECORDS = 100
const DEFAULT_MAX_PERSISTED_ROLLBACK_RECORDS_BYTES = 64 * 1024
const DEFAULT_MAX_PERSISTED_RUNTIME_WAKE_EVENTS = 500
const RUNTIME_LOG_LOAD_PROGRESS_BYTES = 8 * 1024 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_RUN_INPUT_BYTES = 8 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_RUN_PENDING_ACTIONS_BYTES = 8 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_TRACE_DATA_BYTES = 8 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_STEP_VALUE_BYTES = 8 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_WORK_VALUE_BYTES = 8 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_INTERACTION_VALUE_BYTES = 8 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_CONTINUATION_VALUE_BYTES = 8 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_WAKE_PAYLOAD_BYTES = 8 * 1024
const DEFAULT_RUNTIME_LOG_INLINE_TASK_VALUE_BYTES = 8 * 1024
const MAX_COMPACT_SCALAR_STRING_CHARS = 500

export class FileAgentStore extends InMemoryAgentStore implements AgentStore {
  readonly runtimeDataDir: string
  readonly tracePath: string
  readonly runtimeLogPath: string
  private readonly traceStore: FileTraceStore
  private readonly runtimeLogStore: FileRuntimeLogStore

  private readonly sessionRuntimePaths?: AgentSessionRuntimePaths

  constructor(runtimeDataDir = resolveAgentRuntimeDataDir(), telemetry?: RuntimeTelemetryRegistry, options: { runtimeLogPath?: string; sessionRuntimePaths?: AgentSessionRuntimePaths } = {}) {
    super()
    this.runtimeDataDir = runtimeDataDir
    this.tracePath = resolveAgentTracePath(this.runtimeDataDir)
    this.runtimeLogPath = options.runtimeLogPath ?? resolveAgentRuntimeLogPath(this.runtimeDataDir)
    this.sessionRuntimePaths = options.sessionRuntimePaths
    this.traceStore = new FileTraceStore(this.tracePath, telemetry)
    let lastIndexRebuildProgressLoggedBytes = 0
    this.runtimeLogStore = new FileRuntimeLogStore(this.runtimeLogPath, {
      onIndexRebuildProgress: (progress) => {
        if (progress.totalBytes < RUNTIME_LOG_LOAD_PROGRESS_BYTES) return
        const shouldLog = progress.bytesRead === progress.totalBytes
          || progress.bytesRead - lastIndexRebuildProgressLoggedBytes >= RUNTIME_LOG_LOAD_PROGRESS_BYTES
        if (!shouldLog) return
        lastIndexRebuildProgressLoggedBytes = progress.bytesRead
        const percent = progress.totalBytes > 0 ? Math.round((progress.bytesRead / progress.totalBytes) * 100) : 100
        console.info([
          '[agent] startup runtime-log index-rebuild-progress',
          `bytes=${progress.bytesRead}`,
          `totalBytes=${progress.totalBytes}`,
          `percent=${percent}`,
          `lines=${progress.linesRead}`,
          `events=${progress.eventsRead}`,
        ].join(' '))
      },
    })
    this.loadRuntimeLog()
  }

  override createSession(session: AgentSession): void {
    super.createSession(session)
    this.syncSessionRecord(session)
    this.appendRuntimeLogEvent({
      kind: 'session.upserted',
      emittedAt: session.createdAt,
      causality: sessionLogCausality(session),
      entity: { type: 'session', value: session },
    })
  }

  override updateSession(session: AgentSession): void {
    super.updateSession(session)
    this.syncSessionRecord(session)
    this.appendRuntimeLogEvent({
      kind: 'session.upserted',
      emittedAt: session.updatedAt,
      causality: sessionLogCausality(session),
      entity: { type: 'session', value: session },
    })
  }

  private syncSessionRecord(session: AgentSession): void {
    if (!this.sessionRuntimePaths || session.id !== this.sessionRuntimePaths.sessionId) return
    try {
      updateAgentSessionRecord(this.sessionRuntimePaths, {
        ...(session.title ? { title: session.title } : {}),
        ...(typeof session.projectId === 'number' ? { projectId: session.projectId } : {}),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
    } catch (error) {
      console.warn(`[agent] failed to sync session record: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  override createThread(thread: AgentThread): void {
    super.createThread(thread)
    const storedThread = super.getThread(thread.id) ?? thread
    const logThread = compactRuntimeLogThread(storedThread)
    this.appendRuntimeLogEvent({
      kind: 'thread.upserted',
      emittedAt: logThread.createdAt,
      causality: threadLogCausality(logThread),
      entity: { type: 'thread', value: logThread },
    })
    this.appendRuntimeLogThreadMessages(storedThread)
  }

  override updateThread(thread: AgentThread): void {
    const previousThread = super.getThread(thread.id)
    super.updateThread(thread)
    const storedThread = super.getThread(thread.id) ?? thread
    const logThread = compactRuntimeLogThread(storedThread)
    this.appendRuntimeLogEvent({
      kind: 'thread.upserted',
      emittedAt: logThread.updatedAt,
      causality: threadLogCausality(logThread),
      entity: { type: 'thread', value: logThread },
    })
    this.appendRuntimeLogThreadMessages(storedThread, previousThread)
  }

  override deleteThread(threadId: string): AgentThreadDeletionResult {
    const deletion = super.deleteThread(threadId)
    if (!deletion.deleted) return deletion
    this.traceStore.deleteRunTraceEvents(deletion.deletedRunIds, { threadId })
    this.appendRuntimeLogEvent({
      kind: 'thread.deleted',
      causality: { threadId },
      payload: deletion as unknown as JSONValue,
    })
    return deletion
  }

  override deleteAllThreads(): AgentThreadClearResult {
    const deletion = super.deleteAllThreads()
    if (!deletion.deleted) return deletion
    this.traceStore.deleteRunTraceEvents(deletion.deletedRunIds)
    this.appendRuntimeLogEvent({
      kind: 'scope.cleared',
      payload: deletion as unknown as JSONValue,
    })
    return deletion
  }

  override createRun(run: AgentRun): void {
    super.createRun(run)
    const storedRun = super.getRun(run.id) ?? compactPersistedRun(run).run
    const logRun = this.compactRuntimeLogRun(storedRun)
    this.appendRuntimeLogEvent({
      kind: 'run.upserted',
      emittedAt: logRun.createdAt,
      causality: runLogCausality(logRun),
      entity: { type: 'run', value: logRun },
    })
    this.appendRuntimeLogRunSteps(storedRun)
    for (const event of Array.isArray(run.traceEvents) ? run.traceEvents : []) {
      this.traceStore.appendTraceEvent(event, { threadId: run.threadId })
      this.appendRuntimeLogEvent({
        kind: 'trace.upserted',
        emittedAt: event.createdAt,
        causality: traceLogCausality(event, storedRun),
        entity: { type: 'trace', value: this.compactRuntimeLogTraceEvent(event) },
      })
    }
  }

  override updateRun(run: AgentRun): void {
    const previousRun = super.getRun(run.id)
    super.updateRun(run)
    const storedRun = super.getRun(run.id) ?? compactPersistedRun(run).run
    const logRun = this.compactRuntimeLogRun(storedRun)
    this.appendRuntimeLogEvent({
      kind: 'run.upserted',
      emittedAt: logRun.updatedAt,
      causality: runLogCausality(logRun),
      entity: { type: 'run', value: logRun },
    })
    this.appendRuntimeLogRunSteps(storedRun, previousRun)
    for (const event of Array.isArray(run.traceEvents) ? run.traceEvents : []) {
      this.traceStore.appendTraceEvent(event, { threadId: run.threadId })
      this.appendRuntimeLogEvent({
        kind: 'trace.upserted',
        emittedAt: event.createdAt,
        causality: traceLogCausality(event, storedRun),
        entity: { type: 'trace', value: this.compactRuntimeLogTraceEvent(event) },
      })
    }
  }

  override createTaskGraph(taskGraph: AgentTaskGraph): void {
    super.createTaskGraph(taskGraph)
    this.appendRuntimeLogEvent({
      kind: 'task_graph.upserted',
      emittedAt: taskGraph.createdAt,
      causality: taskGraphLogCausality(taskGraph),
      entity: { type: 'task_graph', value: this.compactRuntimeLogTaskGraph(taskGraph) },
    })
  }

  override updateTaskGraph(taskGraph: AgentTaskGraph): void {
    super.updateTaskGraph(taskGraph)
    this.appendRuntimeLogEvent({
      kind: 'task_graph.upserted',
      emittedAt: taskGraph.updatedAt,
      causality: taskGraphLogCausality(taskGraph),
      entity: { type: 'task_graph', value: this.compactRuntimeLogTaskGraph(taskGraph) },
    })
  }

  override createTask(task: AgentTask): void {
    super.createTask(task)
    this.appendRuntimeLogEvent({
      kind: 'task.upserted',
      emittedAt: task.createdAt,
      causality: taskLogCausality(task),
      entity: { type: 'task', value: this.compactRuntimeLogTask(task) },
    })
  }

  override updateTask(task: AgentTask): void {
    super.updateTask(task)
    this.appendRuntimeLogEvent({
      kind: 'task.upserted',
      emittedAt: task.updatedAt,
      causality: taskLogCausality(task),
      entity: { type: 'task', value: this.compactRuntimeLogTask(task) },
    })
  }

  override createRuntimeWork(work: RuntimeWork): void {
    super.createRuntimeWork(work)
    const logWork = this.compactRuntimeLogWork(work)
    this.appendRuntimeLogEvent({
      kind: 'work.upserted',
      emittedAt: logWork.createdAt,
      causality: workLogCausality(logWork),
      entity: { type: 'work', value: logWork },
    })
  }

  override updateRuntimeWork(work: RuntimeWork): void {
    super.updateRuntimeWork(work)
    const logWork = this.compactRuntimeLogWork(work)
    this.appendRuntimeLogEvent({
      kind: 'work.upserted',
      emittedAt: logWork.updatedAt,
      causality: workLogCausality(logWork),
      entity: { type: 'work', value: logWork },
    })
  }

  override createRuntimeInteraction(interaction: RuntimeInteraction): void {
    super.createRuntimeInteraction(interaction)
    const logInteraction = this.compactRuntimeLogInteraction(interaction)
    this.appendRuntimeLogEvent({
      kind: 'interaction.upserted',
      emittedAt: logInteraction.createdAt,
      causality: interactionLogCausality(logInteraction),
      entity: { type: 'interaction', value: logInteraction },
    })
  }

  override updateRuntimeInteraction(interaction: RuntimeInteraction): void {
    super.updateRuntimeInteraction(interaction)
    const logInteraction = this.compactRuntimeLogInteraction(interaction)
    this.appendRuntimeLogEvent({
      kind: 'interaction.upserted',
      emittedAt: logInteraction.updatedAt,
      causality: interactionLogCausality(logInteraction),
      entity: { type: 'interaction', value: logInteraction },
    })
  }

  override createRuntimeContinuation(continuation: RuntimeContinuation): void {
    super.createRuntimeContinuation(continuation)
    const logContinuation = this.compactRuntimeLogContinuation(continuation)
    this.appendRuntimeLogEvent({
      kind: 'continuation.upserted',
      emittedAt: logContinuation.createdAt,
      causality: continuationLogCausality(logContinuation),
      entity: { type: 'continuation', value: logContinuation },
    })
  }

  override updateRuntimeContinuation(continuation: RuntimeContinuation): void {
    super.updateRuntimeContinuation(continuation)
    const logContinuation = this.compactRuntimeLogContinuation(continuation)
    this.appendRuntimeLogEvent({
      kind: 'continuation.upserted',
      emittedAt: logContinuation.updatedAt,
      causality: continuationLogCausality(logContinuation),
      entity: { type: 'continuation', value: logContinuation },
    })
  }

  override createRuntimeWakeEvent(event: RuntimeWakeEvent): void {
    super.createRuntimeWakeEvent(event)
    const logEvent = this.compactRuntimeLogWakeEvent(event)
    this.appendRuntimeLogEvent({
      kind: 'wake_event.upserted',
      emittedAt: logEvent.createdAt,
      causality: wakeEventLogCausality(logEvent),
      entity: { type: 'wake_event', value: logEvent },
    })
  }

  override updateRuntimeWakeEvent(event: RuntimeWakeEvent): void {
    super.updateRuntimeWakeEvent(event)
    const logEvent = this.compactRuntimeLogWakeEvent(event)
    this.appendRuntimeLogEvent({
      kind: 'wake_event.upserted',
      emittedAt: logEvent.updatedAt,
      causality: wakeEventLogCausality(logEvent),
      entity: { type: 'wake_event', value: logEvent },
    })
  }

  override appendTraceEvent(event: AgentTraceEvent): void {
    super.appendTraceEvent(event)
    const run = super.getRun(event.runId)
    this.traceStore.appendTraceEvent(event, { threadId: run?.threadId })
    this.appendRuntimeLogEvent({
      kind: 'trace.upserted',
      emittedAt: event.createdAt,
      causality: traceLogCausality(event, run),
      entity: { type: 'trace', value: this.compactRuntimeLogTraceEvent(event) },
    })
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

  listThreadMessagesPage(input: { threadId: string; afterOrdinal?: number; limit?: number; direction?: 'asc' | 'desc' }): RuntimeLogThreadMessagesPage {
    return this.runtimeLogStore.listThreadMessagesPage(input)
  }

  override getRunDebugLedger(runId: string): AgentRunDebugLedger | undefined {
    const ledger = super.getRunDebugLedger(runId)
    const traceCount = this.traceStore.countRunTraceEvents(runId)
    if ((ledger?.evidenceIndex.length ?? 0) > 0 || traceCount === 0) return ledger

    const run = super.getRun(runId)
    if (!run) return ledger
    const events = this.listAllRunTraceEvents(runId)
    if (events.length === 0) return ledger
    const rebuiltLedger = buildRunDebugLedgerFromTrace({ run, events })
    super.updateRunDebugLedger(runId, rebuiltLedger)
    return rebuiltLedger
  }

  private listAllRunTraceEvents(runId: string): AgentTraceEvent[] {
    const events: AgentTraceEvent[] = []
    let cursor: string | undefined
    for (let pageCount = 0; pageCount < 10_000; pageCount += 1) {
      const page = this.traceStore.listRunTraceEvents(runId, { cursor, limit: 500 }) as AgentTraceEvent[]
      if (page.length === 0) break
      events.push(...page)
      const nextCursor = page.at(-1)?.id
      if (!nextCursor || nextCursor === cursor) break
      cursor = nextCursor
    }
    return events
  }

  override updateRunDebugLedger(runId: string, ledger: AgentRunDebugLedger): void {
    super.updateRunDebugLedger(runId, ledger)
    const compactLedger = super.getRunDebugLedger(runId) ?? ledger
    const run = super.getRun(runId)
    this.appendRuntimeLogEvent({
      kind: 'debug_ledger.upserted',
      emittedAt: compactLedger.generatedAt,
      causality: { ...(run ? runLogCausality(run) : { runId }) },
      entity: { type: 'debug_ledger', value: compactLedger },
    })
  }

  private loadRuntimeLog(): boolean {
    if (!this.runtimeLogStore.exists()) return false
    return this.loadRuntimeLogFromIndex() || this.loadRuntimeLogByScan()
  }

  private loadRuntimeLogFromIndex(): boolean {
    const startedAt = Date.now()
    let currentEvents: AgentRuntimeLogEvent[]
    try {
      currentEvents = this.runtimeLogStore.listCurrentEntityEvents()
    } catch {
      return false
    }
    if (currentEvents.length === 0) return false
    const replay = createRuntimeLogReplayState()
    try {
      for (const event of currentEvents) {
        if (!event.entity) continue
        this.applyRuntimeLogEntity(event.entity, replay)
      }
      this.hydrateIndexedRuntimeLogMessages(replay)
      this.hydrateIndexedRuntimeLogRunSteps(replay)
      this.hydrateIndexedRuntimeLogRunTraces(replay)
      this.applyRuntimeLogWakeEvents(replay.wakeEvents)
    } catch {
      return false
    }
    console.info([
      '[agent] startup runtime-log indexed-load-detail',
      `total=${Date.now() - startedAt}ms`,
      `events=${currentEvents.length}`,
      `sessions=${this.listSessions().length}`,
      `threads=${this.listThreads().length}`,
      `runs=${this.listRuns().length}`,
    ].join(' '))
    return true
  }

  private loadRuntimeLogByScan(): boolean {
    let loaded = false
    const replay = createRuntimeLogReplayState()
    const startedAt = Date.now()
    let lastProgressLoggedBytes = 0
    const result = this.runtimeLogStore.scan({
      onEvent: (event) => {
        loaded = true
        if (event.kind === 'thread.deleted' && event.causality?.threadId) {
          super.deleteThread(event.causality.threadId)
          replay.messagesByThread.delete(event.causality.threadId)
          for (let index = replay.wakeEvents.length - 1; index >= 0; index -= 1) {
            if (replay.wakeEvents[index]?.threadId === event.causality.threadId) replay.wakeEvents.splice(index, 1)
          }
          return
        }
        if (event.kind === 'scope.cleared') {
          super.deleteAllThreads()
          replay.wakeEvents.length = 0
          replay.stepsByRun.clear()
          replay.messagesByThread.clear()
          return
        }
        if (event.entity) this.applyRuntimeLogEntity(event.entity, replay)
      },
      onProgress: (progress) => {
        if (progress.totalBytes < RUNTIME_LOG_LOAD_PROGRESS_BYTES) return
        const shouldLog = progress.bytesRead === progress.totalBytes
          || progress.bytesRead - lastProgressLoggedBytes >= RUNTIME_LOG_LOAD_PROGRESS_BYTES
        if (!shouldLog) return
        lastProgressLoggedBytes = progress.bytesRead
        const percent = progress.totalBytes > 0 ? Math.round((progress.bytesRead / progress.totalBytes) * 100) : 100
        console.info([
          '[agent] startup runtime-log load-progress',
          `bytes=${progress.bytesRead}`,
          `totalBytes=${progress.totalBytes}`,
          `percent=${percent}`,
          `lines=${progress.linesRead}`,
          `events=${progress.eventsRead}`,
        ].join(' '))
      },
    })
    this.applyRuntimeLogWakeEvents(replay.wakeEvents)
    if (!loaded) return false
    console.info([
      '[agent] startup runtime-log load-detail',
      `total=${Date.now() - startedAt}ms`,
      `bytes=${result.bytesRead}`,
      `lines=${result.linesRead}`,
      `events=${result.eventsRead}`,
      `malformed=${result.malformedLines}`,
      `sessions=${this.listSessions().length}`,
      `threads=${this.listThreads().length}`,
      `runs=${this.listRuns().length}`,
    ].join(' '))
    return true
  }

  private applyRuntimeLogEntity(entity: NonNullable<AgentRuntimeLogEvent['entity']>, replay: RuntimeLogReplayState): void {
    if (entity.type === 'session') {
      super.updateSession(entity.value)
      return
    }
    if (entity.type === 'thread') {
      const projectedThread = preserveRuntimeLogThreadMessages(super.getThread(entity.value.id), entity.value)
      super.updateThread(projectedThread)
      const pendingMessages = replay.messagesByThread.get(entity.value.id) ?? []
      for (const message of pendingMessages) {
        const mergedThread = mergeRuntimeLogMessage(super.getThread(message.threadId), message)
        if (mergedThread) super.updateThread(mergedThread)
      }
      replay.messagesByThread.delete(entity.value.id)
      return
    }
    if (entity.type === 'message') {
      const mergedThread = mergeRuntimeLogMessage(super.getThread(entity.value.threadId), entity.value)
      if (mergedThread) super.updateThread(mergedThread)
      else replay.messagesByThread.set(entity.value.threadId, [...(replay.messagesByThread.get(entity.value.threadId) ?? []), entity.value])
      return
    }
    if (entity.type === 'run') {
      const runValue = this.hydrateRuntimeLogRun(entity.value)
      const projectedRun = preserveRuntimeLogRunSteps(super.getRun(runValue.id), runValue)
      super.updateRun(projectedRun)
      const pendingSteps = replay.stepsByRun.get(runValue.id) ?? []
      for (const step of pendingSteps) {
        const mergedRun = mergeRuntimeLogStep(super.getRun(step.runId), step)
        if (mergedRun) super.updateRun(mergedRun)
      }
      replay.stepsByRun.delete(runValue.id)
      return
    }
    if (entity.type === 'step') {
      const mergedRun = mergeRuntimeLogStep(super.getRun(entity.value.runId), entity.value)
      if (mergedRun) super.updateRun(mergedRun)
      else replay.stepsByRun.set(entity.value.runId, [...(replay.stepsByRun.get(entity.value.runId) ?? []), entity.value])
      return
    }
    if (entity.type === 'trace') {
      const traceValue = this.hydrateRuntimeLogTraceEvent(entity.value)
      super.appendTraceEvent(traceValue)
      this.traceStore.appendTraceEvent(traceValue, { threadId: super.getRun(traceValue.runId)?.threadId })
      return
    }
    if (entity.type === 'debug_ledger') {
      super.updateRunDebugLedger(entity.value.runId, entity.value)
      return
    }
    if (entity.type === 'task_graph') {
      super.updateTaskGraph(this.hydrateRuntimeLogTaskGraph(entity.value))
      return
    }
    if (entity.type === 'task') {
      super.updateTask(this.hydrateRuntimeLogTask(entity.value))
      return
    }
    if (entity.type === 'work') {
      super.updateRuntimeWork(entity.value)
      return
    }
    if (entity.type === 'interaction') {
      super.updateRuntimeInteraction(entity.value)
      return
    }
    if (entity.type === 'continuation') {
      super.updateRuntimeContinuation(entity.value)
      return
    }
    if (entity.type === 'wake_event') {
      replay.wakeEvents.push(entity.value)
    }
  }

  private hydrateIndexedRuntimeLogMessages(replay: RuntimeLogReplayState): void {
    for (const thread of this.listThreads()) {
      let afterOrdinal: number | undefined
      for (let pageCount = 0; pageCount < 10_000; pageCount += 1) {
        const page = this.runtimeLogStore.listThreadMessagesPage({ threadId: thread.id, afterOrdinal, limit: 500 })
        for (const message of page.messages) this.applyRuntimeLogEntity({ type: 'message', value: message }, replay)
        if (!page.hasMore || page.nextAfterOrdinal === undefined || page.nextAfterOrdinal === afterOrdinal) break
        afterOrdinal = page.nextAfterOrdinal
      }
    }
  }

  private hydrateIndexedRuntimeLogRunSteps(replay: RuntimeLogReplayState): void {
    for (const run of this.listRuns()) {
      for (const step of this.runtimeLogStore.listRunSteps(run.id)) {
        this.applyRuntimeLogEntity({ type: 'step', value: step }, replay)
      }
    }
  }

  private hydrateIndexedRuntimeLogRunTraces(replay: RuntimeLogReplayState): void {
    for (const run of this.listRuns()) {
      for (const trace of this.runtimeLogStore.listRunTraceEvents(run.id)) {
        this.applyRuntimeLogEntity({ type: 'trace', value: trace }, replay)
      }
    }
  }

  private applyRuntimeLogWakeEvents(events: RuntimeWakeEvent[]): void {
    const projectedWakeEvents = compactPersistedRuntimeWakeEvents(events)
    for (const event of projectedWakeEvents.events) {
      super.updateRuntimeWakeEvent(event)
    }
  }

  private appendRuntimeLogThreadMessages(thread: AgentThread, previousThread?: AgentThread): void {
    const previousMessages = new Map((Array.isArray(previousThread?.messages) ? previousThread.messages : []).map((message) => [message.id, message]))
    for (const message of Array.isArray(thread.messages) ? thread.messages : []) {
      const previousMessage = previousMessages.get(message.id)
      if (previousMessage && JSON.stringify(previousMessage) === JSON.stringify(message)) continue
      this.appendRuntimeLogEvent({
        kind: 'message.upserted',
        emittedAt: message.createdAt,
        causality: messageLogCausality(message, thread),
        entity: { type: 'message', value: message },
      })
    }
  }

  private compactRuntimeLogRun(run: AgentRun): AgentRun {
    const next = compactPersistedRunForRuntimeLog(run)
    const inputMaxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_RUN_INPUT_BYTES', DEFAULT_RUNTIME_LOG_INLINE_RUN_INPUT_BYTES)
    const pendingActionMaxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_RUN_PENDING_ACTIONS_BYTES', DEFAULT_RUNTIME_LOG_INLINE_RUN_PENDING_ACTIONS_BYTES)
    if (run.input !== undefined && shouldWriteRuntimeLogBlob(run.input, 'persistedRunInputBlobRef', inputMaxBytes)) {
      const summary = runtimeLogBlobSummary({
        value: run.input,
        ref: this.runtimeLogStore.writeJSONBlob(run.input, { scope: ['runs', run.id], name: 'input' }),
        marker: 'persistedRunInputBlobRef',
        originalBytesKey: 'originalInputBytes',
        previewLabel: 'inputPreview',
      })
      if (isRecord(summary) && isRecord(run.input)) {
        if (typeof run.input.schema === 'string') summary.schema = run.input.schema
        if (typeof run.input.sourceMessageId === 'string') summary.sourceMessageId = run.input.sourceMessageId
        if (typeof run.input.executionMode === 'string') summary.executionMode = run.input.executionMode
        if (typeof run.input.userMessage === 'string') summary.userMessage = compactStringField(run.input.userMessage)
      }
      next.input = summary as unknown as AgentRun['input']
    }
    if (Array.isArray(run.pendingApprovals) && shouldWriteRuntimeLogBlob(run.pendingApprovals, 'persistedRunPendingApprovalsBlobRef', pendingActionMaxBytes)) {
      next.pendingApprovals = [runtimeLogArrayBlobSummary({
        value: run.pendingApprovals,
        ref: this.runtimeLogStore.writeJSONBlob(run.pendingApprovals, { scope: ['runs', run.id], name: 'pendingApprovals' }),
        marker: 'persistedRunPendingApprovalsBlobRef',
        originalBytesKey: 'originalPendingApprovalsBytes',
        previewLabel: 'pendingApprovalsPreview',
        items: run.pendingApprovals.map(compactRunPendingApprovalSummary),
      })] as unknown as AgentRun['pendingApprovals']
    }
    if (Array.isArray(run.pendingInputRequests) && shouldWriteRuntimeLogBlob(run.pendingInputRequests, 'persistedRunPendingInputRequestsBlobRef', pendingActionMaxBytes)) {
      next.pendingInputRequests = [runtimeLogArrayBlobSummary({
        value: run.pendingInputRequests,
        ref: this.runtimeLogStore.writeJSONBlob(run.pendingInputRequests, { scope: ['runs', run.id], name: 'pendingInputRequests' }),
        marker: 'persistedRunPendingInputRequestsBlobRef',
        originalBytesKey: 'originalPendingInputRequestsBytes',
        previewLabel: 'pendingInputRequestsPreview',
        items: run.pendingInputRequests.map(compactRunPendingInputRequestSummary),
      })] as unknown as AgentRun['pendingInputRequests']
    }
    return next
  }

  private hydrateRuntimeLogRun(run: AgentRun): AgentRun {
    let next = run
    if (isRecord(run.input) && run.input.persistedRunInputBlobRef === true) {
      const hydratedInput = this.readRuntimeLogBlobSummary(run.input, 'originalInputBytes')
      if (hydratedInput && isRecord(hydratedInput)) next = { ...next, input: hydratedInput as unknown as AgentRun['input'] }
    }
    const pendingApprovals = this.readRuntimeLogBlobArray<AgentApprovalRequest>(run.pendingApprovals, 'persistedRunPendingApprovalsBlobRef', 'originalPendingApprovalsBytes')
    if (pendingApprovals) next = { ...next, pendingApprovals }
    const pendingInputRequests = this.readRuntimeLogBlobArray<AgentInputRequest>(run.pendingInputRequests, 'persistedRunPendingInputRequestsBlobRef', 'originalPendingInputRequestsBytes')
    if (pendingInputRequests) next = { ...next, pendingInputRequests }
    return next
  }

  private readRuntimeLogBlobArray<T>(value: unknown, marker: string, originalBytesKey: string): T[] | undefined {
    const summary = Array.isArray(value) && isRecord(value[0]) && value[0][marker] === true
      ? value[0]
      : undefined
    if (!summary) return undefined
    const hydrated = this.readRuntimeLogBlobSummary(summary, originalBytesKey)
    return Array.isArray(hydrated) ? hydrated as T[] : undefined
  }

  private readRuntimeLogBlobSummary(summary: Record<string, unknown>, originalBytesKey: string): unknown | undefined {
    if (typeof summary.runtimeLogBlobRef !== 'string'
      || typeof summary.runtimeLogBlobHash !== 'string'
      || typeof summary.runtimeLogBlobBytes !== 'number'
      || typeof summary[originalBytesKey] !== 'number') {
      return undefined
    }
    return this.runtimeLogStore.readJSONBlob({
      runtimeLogBlobRef: true,
      path: summary.runtimeLogBlobRef,
      encoding: summary.runtimeLogBlobEncoding === 'gzip' ? 'gzip' : 'gzip',
      bytes: summary.runtimeLogBlobBytes,
      originalBytes: summary[originalBytesKey],
      hash: summary.runtimeLogBlobHash,
    })
  }

  private compactRuntimeLogTraceEvent(event: AgentTraceEvent): AgentTraceEvent {
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_TRACE_DATA_BYTES', DEFAULT_RUNTIME_LOG_INLINE_TRACE_DATA_BYTES)
    if (event.data === undefined || !shouldWriteRuntimeLogBlob(event.data, 'persistedTraceDataBlobRef', maxBytes)) {
      return event
    }
    return {
      ...event,
      data: runtimeLogBlobSummary({
        value: event.data,
        ref: this.runtimeLogStore.writeJSONBlob(event.data, { scope: ['runs', event.runId, 'traces', event.id], name: 'data' }),
        marker: 'persistedTraceDataBlobRef',
        originalBytesKey: 'originalTraceDataBytes',
        previewLabel: 'traceDataPreview',
      }),
    }
  }

  private hydrateRuntimeLogTraceEvent(event: AgentTraceEvent): AgentTraceEvent {
    if (!isRecord(event.data) || event.data.persistedTraceDataBlobRef !== true) return event
    const hydratedData = this.readRuntimeLogBlobSummary(event.data, 'originalTraceDataBytes')
    return hydratedData !== undefined ? { ...event, data: hydratedData as JSONValue } : event
  }

  private appendRuntimeLogRunSteps(run: AgentRun, previousRun?: AgentRun): void {
    const previousSteps = new Map((Array.isArray(previousRun?.steps) ? previousRun.steps : []).map((step) => [step.id, this.compactRuntimeLogStep(step, run)]))
    for (const step of Array.isArray(run.steps) ? run.steps : []) {
      const compactedStep = this.compactRuntimeLogStep(step, run)
      const previousStep = previousSteps.get(step.id)
      if (previousStep && JSON.stringify(previousStep) === JSON.stringify(compactedStep)) continue
      this.appendRuntimeLogEvent({
        kind: 'step.upserted',
        emittedAt: runStepEventTime(step, run.updatedAt),
        causality: stepLogCausality(compactedStep, run),
        entity: { type: 'step', value: compactedStep },
      })
    }
  }

  private compactRuntimeLogWork(work: RuntimeWork): RuntimeWork {
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_WORK_VALUE_BYTES', DEFAULT_RUNTIME_LOG_INLINE_WORK_VALUE_BYTES)
    const next: RuntimeWork = { ...work }
    if (work.request !== undefined && shouldWriteRuntimeLogBlob(work.request, 'persistedWorkRequestBlobRef', maxBytes)) {
      next.request = runtimeLogBlobSummary({
        value: work.request,
        ref: this.runtimeLogStore.writeJSONBlob(work.request, { scope: ['works', work.id], name: 'request' }),
        marker: 'persistedWorkRequestBlobRef',
        originalBytesKey: 'originalRequestBytes',
        previewLabel: 'requestPreview',
      })
    }
    if (work.result !== undefined && shouldWriteRuntimeLogBlob(work.result, 'persistedWorkResultBlobRef', maxBytes)) {
      next.result = runtimeLogBlobSummary({
        value: work.result,
        ref: this.runtimeLogStore.writeJSONBlob(work.result, { scope: ['works', work.id], name: 'result' }),
        marker: 'persistedWorkResultBlobRef',
        originalBytesKey: 'originalResultBytes',
        previewLabel: 'resultPreview',
      })
    }
    return next
  }

  private compactRuntimeLogInteraction(interaction: RuntimeInteraction): RuntimeInteraction {
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_INTERACTION_VALUE_BYTES', DEFAULT_RUNTIME_LOG_INLINE_INTERACTION_VALUE_BYTES)
    const next: RuntimeInteraction = { ...interaction }
    if (interaction.payload !== undefined && shouldWriteRuntimeLogBlob(interaction.payload, 'persistedInteractionPayloadBlobRef', maxBytes)) {
      next.payload = runtimeLogBlobSummary({
        value: interaction.payload,
        ref: this.runtimeLogStore.writeJSONBlob(interaction.payload, { scope: ['interactions', interaction.id], name: 'payload' }),
        marker: 'persistedInteractionPayloadBlobRef',
        originalBytesKey: 'originalPayloadBytes',
        previewLabel: 'payloadPreview',
      })
    }
    if (interaction.result !== undefined && shouldWriteRuntimeLogBlob(interaction.result, 'persistedInteractionResultBlobRef', maxBytes)) {
      next.result = runtimeLogBlobSummary({
        value: interaction.result,
        ref: this.runtimeLogStore.writeJSONBlob(interaction.result, { scope: ['interactions', interaction.id], name: 'result' }),
        marker: 'persistedInteractionResultBlobRef',
        originalBytesKey: 'originalResultBytes',
        previewLabel: 'resultPreview',
      })
    }
    return next
  }

  private compactRuntimeLogContinuation(continuation: RuntimeContinuation): RuntimeContinuation {
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_CONTINUATION_VALUE_BYTES', DEFAULT_RUNTIME_LOG_INLINE_CONTINUATION_VALUE_BYTES)
    const nextInput = continuation.nextInput
    if (nextInput === undefined || !shouldWriteRuntimeLogBlob(nextInput, 'persistedContinuationNextInputBlobRef', maxBytes)) {
      return continuation
    }
    const summary = runtimeLogBlobSummary({
      value: nextInput,
      ref: this.runtimeLogStore.writeJSONBlob(nextInput, { scope: ['continuations', continuation.id], name: 'nextInput' }),
      marker: 'persistedContinuationNextInputBlobRef',
      originalBytesKey: 'originalNextInputBytes',
      previewLabel: 'nextInputPreview',
    })
    if (isRecord(summary) && isRecord(nextInput) && isStringArray(nextInput.workResults)) {
      summary.workResults = nextInput.workResults
    }
    return {
      ...continuation,
      nextInput: summary as RuntimeContinuation['nextInput'],
    }
  }

  private compactRuntimeLogWakeEvent(event: RuntimeWakeEvent): RuntimeWakeEvent {
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_WAKE_PAYLOAD_BYTES', DEFAULT_RUNTIME_LOG_INLINE_WAKE_PAYLOAD_BYTES)
    if (event.payload === undefined || !shouldWriteRuntimeLogBlob(event.payload, 'persistedWakePayloadBlobRef', maxBytes)) {
      return event
    }
    const summary = runtimeLogBlobSummary({
      value: event.payload,
      ref: this.runtimeLogStore.writeJSONBlob(event.payload, { scope: ['wake-events', event.id], name: 'payload' }),
      marker: 'persistedWakePayloadBlobRef',
      originalBytesKey: 'originalPayloadBytes',
      previewLabel: 'payloadPreview',
    })
    if (isRecord(summary)) {
      summary.threadId = event.threadId
      summary.kind = event.kind
      summary.status = event.status
      if (event.runId) summary.runId = event.runId
      if (event.workId) summary.workId = event.workId
      const payloadWork = isRecord(event.payload) && isRecord(event.payload.work) ? event.payload.work : undefined
      if (payloadWork) {
        const workSummary: Record<string, JSONValue> = {}
        if (typeof payloadWork.id === 'string') workSummary.id = payloadWork.id
        if (typeof payloadWork.threadId === 'string') workSummary.threadId = payloadWork.threadId
        if (typeof payloadWork.runId === 'string') workSummary.runId = payloadWork.runId
        if (typeof payloadWork.kind === 'string') workSummary.kind = payloadWork.kind
        if (typeof payloadWork.status === 'string') workSummary.status = payloadWork.status
        if (typeof payloadWork.updatedAt === 'string') workSummary.updatedAt = payloadWork.updatedAt
        if (Object.keys(workSummary).length > 0) summary.work = workSummary
      }
    }
    return {
      ...event,
      payload: summary,
    }
  }

  private compactRuntimeLogTaskGraph(taskGraph: AgentTaskGraph): AgentTaskGraph {
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_TASK_VALUE_BYTES', DEFAULT_RUNTIME_LOG_INLINE_TASK_VALUE_BYTES)
    const next: AgentTaskGraph = { ...taskGraph }
    if (taskGraph.metadata !== undefined && shouldWriteRuntimeLogBlob(taskGraph.metadata, 'persistedTaskGraphMetadataBlobRef', maxBytes)) {
      next.metadata = runtimeLogBlobSummary({
        value: taskGraph.metadata,
        ref: this.runtimeLogStore.writeJSONBlob(taskGraph.metadata, { scope: ['task-graphs', taskGraph.id], name: 'metadata' }),
        marker: 'persistedTaskGraphMetadataBlobRef',
        originalBytesKey: 'originalMetadataBytes',
        previewLabel: 'metadataPreview',
      }) as AgentTaskGraph['metadata']
    }
    if (taskGraph.blockedReason !== undefined && shouldWriteRuntimeLogBlob(taskGraph.blockedReason, 'persistedTaskGraphBlockedReasonBlobRef', maxBytes)) {
      next.blockedReason = runtimeLogBlobSummary({
        value: taskGraph.blockedReason,
        ref: this.runtimeLogStore.writeJSONBlob(taskGraph.blockedReason, { scope: ['task-graphs', taskGraph.id], name: 'blockedReason' }),
        marker: 'persistedTaskGraphBlockedReasonBlobRef',
        originalBytesKey: 'originalBlockedReasonBytes',
        previewLabel: 'blockedReasonPreview',
      }) as unknown as AgentTaskGraph['blockedReason']
    }
    return next
  }

  private hydrateRuntimeLogTaskGraph(taskGraph: AgentTaskGraph): AgentTaskGraph {
    let next = taskGraph
    if (isRecord(taskGraph.metadata) && taskGraph.metadata.persistedTaskGraphMetadataBlobRef === true) {
      const hydratedMetadata = this.readRuntimeLogBlobSummary(taskGraph.metadata, 'originalMetadataBytes')
      if (isRecord(hydratedMetadata)) next = { ...next, metadata: hydratedMetadata as AgentTaskGraph['metadata'] }
    }
    const blockedReason = taskGraph.blockedReason as unknown
    if (isRecord(blockedReason) && blockedReason.persistedTaskGraphBlockedReasonBlobRef === true) {
      const hydratedBlockedReason = this.readRuntimeLogBlobSummary(blockedReason, 'originalBlockedReasonBytes')
      if (typeof hydratedBlockedReason === 'string') next = { ...next, blockedReason: hydratedBlockedReason }
    }
    return next
  }

  private compactRuntimeLogTask(task: AgentTask): AgentTask {
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_TASK_VALUE_BYTES', DEFAULT_RUNTIME_LOG_INLINE_TASK_VALUE_BYTES)
    const next: AgentTask = { ...task }
    if (task.description !== undefined && shouldWriteRuntimeLogBlob(task.description, 'persistedTaskDescriptionBlobRef', maxBytes)) {
      next.description = runtimeLogBlobSummary({
        value: task.description,
        ref: this.runtimeLogStore.writeJSONBlob(task.description, { scope: ['tasks', task.id], name: 'description' }),
        marker: 'persistedTaskDescriptionBlobRef',
        originalBytesKey: 'originalDescriptionBytes',
        previewLabel: 'descriptionPreview',
      }) as unknown as AgentTask['description']
    }
    if (task.blockedReason !== undefined && shouldWriteRuntimeLogBlob(task.blockedReason, 'persistedTaskBlockedReasonBlobRef', maxBytes)) {
      next.blockedReason = runtimeLogBlobSummary({
        value: task.blockedReason,
        ref: this.runtimeLogStore.writeJSONBlob(task.blockedReason, { scope: ['tasks', task.id], name: 'blockedReason' }),
        marker: 'persistedTaskBlockedReasonBlobRef',
        originalBytesKey: 'originalBlockedReasonBytes',
        previewLabel: 'blockedReasonPreview',
      }) as unknown as AgentTask['blockedReason']
    }
    if (task.metadata !== undefined && shouldWriteRuntimeLogBlob(task.metadata, 'persistedTaskMetadataBlobRef', maxBytes)) {
      next.metadata = runtimeLogBlobSummary({
        value: task.metadata,
        ref: this.runtimeLogStore.writeJSONBlob(task.metadata, { scope: ['tasks', task.id], name: 'metadata' }),
        marker: 'persistedTaskMetadataBlobRef',
        originalBytesKey: 'originalMetadataBytes',
        previewLabel: 'metadataPreview',
      }) as AgentTask['metadata']
    }
    if (Array.isArray(task.artifacts) && shouldWriteRuntimeLogBlob(task.artifacts, 'persistedTaskArtifactsBlobRef', maxBytes)) {
      next.artifacts = [runtimeLogArrayBlobSummary({
        value: task.artifacts,
        ref: this.runtimeLogStore.writeJSONBlob(task.artifacts, { scope: ['tasks', task.id], name: 'artifacts' }),
        marker: 'persistedTaskArtifactsBlobRef',
        originalBytesKey: 'originalArtifactsBytes',
        previewLabel: 'artifactsPreview',
        items: task.artifacts.map(compactTaskArtifactSummary),
      })] as unknown as AgentTask['artifacts']
    }
    return next
  }

  private hydrateRuntimeLogTask(task: AgentTask): AgentTask {
    let next = task
    const description = task.description as unknown
    if (isRecord(description) && description.persistedTaskDescriptionBlobRef === true) {
      const hydratedDescription = this.readRuntimeLogBlobSummary(description, 'originalDescriptionBytes')
      if (typeof hydratedDescription === 'string') next = { ...next, description: hydratedDescription }
    }
    const blockedReason = task.blockedReason as unknown
    if (isRecord(blockedReason) && blockedReason.persistedTaskBlockedReasonBlobRef === true) {
      const hydratedBlockedReason = this.readRuntimeLogBlobSummary(blockedReason, 'originalBlockedReasonBytes')
      if (typeof hydratedBlockedReason === 'string') next = { ...next, blockedReason: hydratedBlockedReason }
    }
    if (isRecord(task.metadata) && task.metadata.persistedTaskMetadataBlobRef === true) {
      const hydratedMetadata = this.readRuntimeLogBlobSummary(task.metadata, 'originalMetadataBytes')
      if (isRecord(hydratedMetadata)) next = { ...next, metadata: hydratedMetadata as AgentTask['metadata'] }
    }
    const artifacts = this.readRuntimeLogBlobArray<AgentTask['artifacts'][number]>(task.artifacts, 'persistedTaskArtifactsBlobRef', 'originalArtifactsBytes')
    if (artifacts) next = { ...next, artifacts }
    return next
  }

  private compactRuntimeLogStep(step: AgentRunStep, run: AgentRun): AgentRunStep {
    const maxBytes = readPositiveIntegerEnv('MOVSCRIPT_AGENT_RUNTIME_LOG_INLINE_STEP_VALUE_BYTES', DEFAULT_RUNTIME_LOG_INLINE_STEP_VALUE_BYTES)
    const compacted = compactPersistedRunStep(step).step
    const next: AgentRunStep = { ...compacted }
    if (step.result !== undefined && shouldWriteRuntimeLogBlob(step.result, 'persistedStepResultBlobRef', maxBytes)) {
      next.result = runtimeLogBlobSummary({
        value: step.result,
        ref: this.runtimeLogStore.writeJSONBlob(step.result, { scope: ['runs', run.id, 'steps', step.id], name: 'result' }),
        marker: 'persistedStepResultBlobRef',
        originalBytesKey: 'originalResultBytes',
        previewLabel: 'resultPreview',
      })
    }
    if (step.errorData !== undefined && shouldWriteRuntimeLogBlob(step.errorData, 'persistedStepErrorDataBlobRef', maxBytes)) {
      next.errorData = runtimeLogBlobSummary({
        value: step.errorData,
        ref: this.runtimeLogStore.writeJSONBlob(step.errorData, { scope: ['runs', run.id, 'steps', step.id], name: 'errorData' }),
        marker: 'persistedStepErrorDataBlobRef',
        originalBytesKey: 'originalErrorDataBytes',
        previewLabel: 'errorDataPreview',
      })
    }
    return next
  }

  private appendRuntimeLogEvent(event: AppendRuntimeLogEventInput): void {
    this.runtimeLogStore.append(event)
  }

}

export function resolveAgentRuntimeDataDir(): string {
  if (process.env.MOVSCRIPT_AGENT_RUNTIME_DATA_DIR) return process.env.MOVSCRIPT_AGENT_RUNTIME_DATA_DIR
  if (process.env.MOVSCRIPT_AGENT_USER_DATA_DIR) {
    return process.env.MOVSCRIPT_AGENT_USER_DATA_DIR
  }
  return join(process.cwd(), '.movscript-agent')
}

export function resolveAgentMemoryPath(runtimeDataDir = resolveAgentRuntimeDataDir()): string {
  if (process.env.MOVSCRIPT_AGENT_MEMORY_PATH) return process.env.MOVSCRIPT_AGENT_MEMORY_PATH
  return join(runtimeDataDir, 'memories.json')
}

export function resolveAgentRuntimeLogPath(runtimeDataDir = resolveAgentRuntimeDataDir()): string {
  if (process.env.MOVSCRIPT_AGENT_RUNTIME_LOG_PATH) return process.env.MOVSCRIPT_AGENT_RUNTIME_LOG_PATH
  if (process.env.MOVSCRIPT_AGENT_USER_DATA_DIR) {
    return join(process.env.MOVSCRIPT_AGENT_USER_DATA_DIR, 'runtime-log')
  }
  return join(runtimeDataDir, 'runtime-log')
}

export function resolveAgentTracePath(runtimeDataDir = resolveAgentRuntimeDataDir()): string {
  if (process.env.MOVSCRIPT_AGENT_TRACE_PATH) return process.env.MOVSCRIPT_AGENT_TRACE_PATH
  if (process.env.MOVSCRIPT_AGENT_USER_DATA_DIR) {
    return join(process.env.MOVSCRIPT_AGENT_USER_DATA_DIR, 'traces')
  }
  return join(runtimeDataDir, 'traces')
}

export function atomicWriteJSON(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function sessionLogCausality(session: AgentSession): { sessionId: string } {
  return { sessionId: session.id }
}

function threadLogCausality(thread: AgentThread): { sessionId?: string; threadId: string } {
  return {
    ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
    threadId: thread.id,
  }
}

function messageLogCausality(message: AgentMessage, thread?: AgentThread): { sessionId?: string; threadId: string; runId?: string; messageId: string } {
  return {
    ...(thread?.sessionId ? { sessionId: thread.sessionId } : {}),
    threadId: message.threadId,
    ...(message.runId ? { runId: message.runId } : {}),
    messageId: message.id,
  }
}

function runLogCausality(run: AgentRun): { sessionId?: string; threadId: string; runId: string; messageId?: string; taskGraphId?: string; taskId?: string } {
  return {
    ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    threadId: run.threadId,
    runId: run.id,
    ...(run.input?.sourceMessageId ? { messageId: run.input.sourceMessageId } : {}),
    ...(run.taskGraphId ? { taskGraphId: run.taskGraphId } : {}),
    ...(run.taskId ? { taskId: run.taskId } : {}),
  }
}

function stepLogCausality(step: AgentRunStep, run?: AgentRun): { sessionId?: string; threadId?: string; runId: string; stepId: string; taskGraphId?: string; taskId?: string } {
  return {
    ...(run?.sessionId ? { sessionId: run.sessionId } : {}),
    ...(run?.threadId ? { threadId: run.threadId } : {}),
    runId: step.runId,
    stepId: step.id,
    ...(run?.taskGraphId ? { taskGraphId: run.taskGraphId } : {}),
    ...(run?.taskId ? { taskId: run.taskId } : {}),
  }
}

function traceLogCausality(trace: AgentTraceEvent, run?: AgentRun): { sessionId?: string; threadId?: string; runId: string; traceId: string; stepId?: string; taskGraphId?: string; taskId?: string } {
  return {
    ...(run?.sessionId ? { sessionId: run.sessionId } : {}),
    ...(run?.threadId ? { threadId: run.threadId } : {}),
    runId: trace.runId,
    traceId: trace.id,
    ...(trace.stepId ? { stepId: trace.stepId } : {}),
    ...(run?.taskGraphId ? { taskGraphId: run.taskGraphId } : {}),
    ...(run?.taskId ? { taskId: run.taskId } : {}),
  }
}

function taskGraphLogCausality(taskGraph: AgentTaskGraph): { sessionId?: string; threadId: string; taskGraphId: string } {
  return {
    ...(taskGraph.sessionId ? { sessionId: taskGraph.sessionId } : {}),
    threadId: taskGraph.threadId,
    taskGraphId: taskGraph.id,
  }
}

function taskLogCausality(task: AgentTask): { taskGraphId: string; taskId: string } {
  return {
    taskGraphId: task.taskGraphId,
    taskId: task.id,
  }
}

function workLogCausality(work: RuntimeWork): { sessionId?: string; threadId: string; runId?: string; workId: string } {
  return {
    ...(work.sessionId ? { sessionId: work.sessionId } : {}),
    threadId: work.threadId,
    ...(work.runId ? { runId: work.runId } : {}),
    workId: work.id,
  }
}

function interactionLogCausality(interaction: RuntimeInteraction): { sessionId?: string; threadId: string; runId: string; interactionId: string; workId?: string } {
  return {
    ...(interaction.sessionId ? { sessionId: interaction.sessionId } : {}),
    threadId: interaction.threadId,
    runId: interaction.runId,
    interactionId: interaction.id,
    ...(interaction.workId ? { workId: interaction.workId } : {}),
  }
}

function continuationLogCausality(continuation: RuntimeContinuation): { threadId: string; runId: string; continuationId: string } {
  return {
    threadId: continuation.threadId,
    runId: continuation.runId,
    continuationId: continuation.id,
  }
}

function wakeEventLogCausality(event: RuntimeWakeEvent): { threadId: string; runId?: string; wakeEventId: string; workId?: string } {
  return {
    threadId: event.threadId,
    ...(event.runId ? { runId: event.runId } : {}),
    wakeEventId: event.id,
    ...(event.workId ? { workId: event.workId } : {}),
  }
}

function compactRuntimeLogThread(thread: AgentThread): AgentThread {
  return {
    ...thread,
    messages: [],
  }
}

function preserveRuntimeLogThreadMessages(previousThread: AgentThread | undefined, logThread: AgentThread): AgentThread {
  if (Array.isArray(logThread.messages) && logThread.messages.length > 0) return logThread
  return {
    ...logThread,
    messages: previousThread?.messages ?? [],
  }
}

function mergeRuntimeLogMessage(thread: AgentThread | undefined, message: AgentMessage): AgentThread | undefined {
  if (!thread) return undefined
  const messages = Array.isArray(thread.messages) ? [...thread.messages] : []
  const existingIndex = messages.findIndex((item) => item.id === message.id)
  if (existingIndex >= 0) messages[existingIndex] = message
  else messages.push(message)
  messages.sort(compareAgentMessages)
  return {
    ...thread,
    messages,
  }
}

function compareAgentMessages(a: AgentMessage, b: AgentMessage): number {
  const byCreatedAt = a.createdAt.localeCompare(b.createdAt)
  if (byCreatedAt !== 0) return byCreatedAt
  return a.id.localeCompare(b.id)
}

function createRuntimeLogReplayState(): RuntimeLogReplayState {
  return {
    wakeEvents: [],
    stepsByRun: new Map(),
    messagesByThread: new Map(),
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function preserveRuntimeLogRunSteps(current: AgentRun | undefined, next: AgentRun): AgentRun {
  const currentSteps = Array.isArray(current?.steps) ? current.steps : []
  const nextSteps = Array.isArray(next.steps) ? next.steps : []
  if (currentSteps.length === 0 || nextSteps.length > 0) return next
  return { ...next, steps: currentSteps }
}

function mergeRuntimeLogStep(run: AgentRun | undefined, step: AgentRunStep): AgentRun | undefined {
  if (!run) return undefined
  const steps = Array.isArray(run.steps) ? [...run.steps] : []
  const index = steps.findIndex((candidate) => candidate.id === step.id)
  if (index >= 0) steps[index] = step
  else steps.push(step)
  steps.sort((a, b) => {
    const aTime = runStepEventTime(a, '')
    const bTime = runStepEventTime(b, '')
    return aTime.localeCompare(bTime)
  })
  return { ...run, steps }
}
function compactPersistedRunForRuntimeLog(run: AgentRun): AgentRun {
  const metadata = compactPersistedRunMetadata(run.metadata)
  return {
    ...run,
    steps: [],
    traceEvents: [],
    ...(metadata.metadata ? { metadata: metadata.metadata } : { metadata: undefined }),
  }
}

function runStepEventTime(step: AgentRunStep, fallback: string): string {
  const legacyStep = step as AgentRunStep & { startedAt?: unknown }
  const startedAt = typeof legacyStep.startedAt === 'string' ? legacyStep.startedAt : undefined
  return step.completedAt ?? startedAt ?? step.createdAt ?? fallback
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

function compactPersistedRuntimeWakeEvents(events: unknown[]): { events: RuntimeWakeEvent[]; compacted: boolean; compactedCount: number; droppedCount: number } {
  const maxEvents = readPositiveIntegerEnv('MOVSCRIPT_AGENT_MAX_PERSISTED_RUNTIME_WAKE_EVENTS', DEFAULT_MAX_PERSISTED_RUNTIME_WAKE_EVENTS)
  const normalized = events
    .filter(isRecord)
    .map((event) => compactPersistedRuntimeWakeEvent(event as unknown as RuntimeWakeEvent))
  const active = normalized.filter((entry) => entry.event.status === 'queued' || entry.event.status === 'processing')
  const inactive = normalized
    .filter((entry) => entry.event.status !== 'queued' && entry.event.status !== 'processing')
    .sort((a, b) => a.event.updatedAt.localeCompare(b.event.updatedAt))
  const inactiveKeepCount = Math.max(0, maxEvents - active.length)
  const keptInactive = inactiveKeepCount > 0 ? inactive.slice(-inactiveKeepCount) : []
  const keptIds = new Set([...active, ...keptInactive].map((entry) => entry.event.id))
  const kept = normalized
    .filter((entry) => keptIds.has(entry.event.id))
    .map((entry) => entry.event)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const compactedCount = normalized.filter((entry) => entry.compacted).length
  const droppedCount = normalized.length - kept.length
  return {
    events: kept,
    compacted: compactedCount > 0 || droppedCount > 0,
    compactedCount,
    droppedCount,
  }
}

function compactPersistedRuntimeWakeEvent(event: RuntimeWakeEvent): { event: RuntimeWakeEvent; compacted: boolean } {
  if (event.status === 'queued' || event.status === 'processing') return { event, compacted: false }
  const payload = compactConsumedRuntimeWakePayload(event)
  return {
    event: {
      ...event,
      payload,
    },
    compacted: payload !== event.payload,
  }
}

function compactConsumedRuntimeWakePayload(event: RuntimeWakeEvent): unknown {
  const current = event.payload
  if (isRecord(current) && current.consumed === true) return current
  const summary: Record<string, JSONValue> = {
    consumed: true,
    kind: event.kind,
  }
  if (event.runId) summary.runId = event.runId
  if (event.workId) summary.workId = event.workId
  return summary
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

function shouldWriteRuntimeLogBlob(value: unknown, marker: string, maxBytes: number): boolean {
  if (jsonByteLength(value) <= maxBytes) return false
  return !isRecord(value) || value[marker] !== true
}

function runtimeLogArrayBlobSummary(input: { value: unknown; ref: RuntimeLogJSONBlobRef; marker: string; originalBytesKey: string; previewLabel: string; items: JSONValue[] }): JSONValue {
  return {
    [input.marker]: true,
    [input.originalBytesKey]: input.ref.originalBytes,
    runtimeLogBlobRef: input.ref.path,
    runtimeLogBlobHash: input.ref.hash,
    runtimeLogBlobBytes: input.ref.bytes,
    runtimeLogBlobEncoding: input.ref.encoding,
    itemCount: Array.isArray(input.value) ? input.value.length : 0,
    items: input.items,
    [input.previewLabel]: previewJSON(input.value, 2_000),
  }
}

function compactRunPendingApprovalSummary(approval: AgentApprovalRequest): JSONValue {
  const summary: Record<string, JSONValue> = {
    id: approval.id,
    runId: approval.runId,
    toolName: approval.toolName,
    status: approval.status,
    createdAt: approval.createdAt,
    updatedAt: approval.updatedAt,
  }
  if (approval.reason) summary.reason = compactStringField(approval.reason)
  if (approval.risk) summary.risk = approval.risk
  if (approval.permission) summary.permission = approval.permission
  if (approval.interactionId) summary.interactionId = approval.interactionId
  if (approval.approvedAt) summary.approvedAt = approval.approvedAt
  if (approval.rejectedAt) summary.rejectedAt = approval.rejectedAt
  if (approval.displayThreadId) summary.displayThreadId = approval.displayThreadId
  return summary
}

function compactRunPendingInputRequestSummary(request: AgentInputRequest): JSONValue {
  const summary: Record<string, JSONValue> = {
    id: request.id,
    runId: request.runId,
    title: compactStringField(request.title),
    question: compactStringField(request.question),
    inputType: request.inputType,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  }
  if (request.summary) summary.summary = compactStringField(request.summary)
  if (request.allowCustomAnswer !== undefined) summary.allowCustomAnswer = request.allowCustomAnswer
  if (request.answeredAt) summary.answeredAt = request.answeredAt
  if (request.displayThreadId) summary.displayThreadId = request.displayThreadId
  if (Array.isArray(request.choices)) {
    summary.choices = request.choices.map((choice) => ({
      id: choice.id,
      label: compactStringField(choice.label),
      ...(choice.description ? { description: compactStringField(choice.description) } : {}),
    }))
  }
  return summary
}

function compactTaskArtifactSummary(artifact: AgentTask['artifacts'][number]): JSONValue {
  const summary: Record<string, JSONValue> = {
    id: artifact.id,
    type: artifact.type,
    createdAt: artifact.createdAt,
  }
  if (artifact.title) summary.title = compactStringField(artifact.title)
  if (artifact.uri) summary.uri = compactStringField(artifact.uri)
  if (artifact.metadata && isRecord(artifact.metadata)) {
    const metadataSummary: Record<string, JSONValue> = {}
    for (const [key, value] of Object.entries(artifact.metadata)) {
      if (value === null || typeof value === 'boolean') metadataSummary[key] = value
      if (typeof value === 'number' && Number.isFinite(value)) metadataSummary[key] = value
      if (typeof value === 'string') metadataSummary[key] = compactStringField(value)
    }
    if (Object.keys(metadataSummary).length > 0) summary.metadata = metadataSummary
  }
  return summary
}

function runtimeLogBlobSummary(input: { value: unknown; ref: RuntimeLogJSONBlobRef; marker: string; originalBytesKey: string; previewLabel: string }): JSONValue {
  const record = isRecord(input.value) ? input.value : undefined
  const summary: Record<string, JSONValue> = {
    [input.marker]: true,
    [input.originalBytesKey]: input.ref.originalBytes,
    runtimeLogBlobRef: input.ref.path,
    runtimeLogBlobHash: input.ref.hash,
    runtimeLogBlobBytes: input.ref.bytes,
    runtimeLogBlobEncoding: input.ref.encoding,
  }
  if (record) {
    for (const [key, item] of Object.entries(record)) {
      if (key === 'result' || key === 'content' || key === 'bodyText' || key === 'snapshot' || key === 'workspace') continue
      if (item === null || typeof item === 'boolean') summary[key] = item
      if (typeof item === 'number' && Number.isFinite(item)) summary[key] = item
      if (typeof item === 'string') summary[key] = compactStringField(item)
    }
  }
  summary[input.previewLabel] = previewJSON(input.value, 2_000)
  return summary
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
      if (key === 'result' || key === 'content' || key === 'bodyText' || key === 'snapshot' || key === 'workspace') continue
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

import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentTraceEvent,
  AgentTraceEventKind,
  ToolCallOutcome,
} from '../state/types.js'
import { buildToolRollbackRecords } from '../tools/toolRollbackRecords.js'
import type { RuntimeDeferredTaskRegistry } from './runtimeDeferredTasks.js'

export interface RuntimePostRunRecordsTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export interface RuntimePostRunRecordsInput {
  round: AgentRunRoundInfo
  userMessage: AgentMessage
  projectId?: number
  toolOutcomes: ToolCallOutcome[]
  warnings: string[]
}

export function deferRuntimePostRunRecords(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun'>
  memoryManager: Pick<MemoryManager, 'extractAndWriteMemories'>
  tasks: Pick<RuntimeDeferredTaskRegistry, 'track'>
  runId: string
  records: RuntimePostRunRecordsInput
  defer?: (callback: () => void) => void
  recordTrace: (run: AgentRun, trace: RuntimePostRunRecordsTraceInput) => void
}): void {
  const runSnapshot = input.store.getRun(input.runId)
  if (!runSnapshot) return
  input.tasks.track(new Promise<void>((resolveTask) => {
    ;(input.defer ?? defaultDefer)(() => {
      try {
        applyRuntimePostRunRecords({
          store: input.store,
          memoryManager: input.memoryManager,
          runId: input.runId,
          records: input.records,
          recordTrace: input.recordTrace,
        })
      } catch (error) {
        const run = input.store.getRun(input.runId)
        if (run) {
          input.recordTrace(run, {
            kind: 'memory',
            title: 'Deferred post-run records failed',
            summary: error instanceof Error ? error.message : String(error),
            status: 'failed',
            round: input.records.round,
            data: { async: true },
          })
          input.store.updateRun(run)
        }
      } finally {
        resolveTask()
      }
    })
  }))
}

export function applyRuntimePostRunRecords(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun'>
  memoryManager: Pick<MemoryManager, 'extractAndWriteMemories'>
  runId: string
  records: RuntimePostRunRecordsInput
  recordTrace: (run: AgentRun, trace: RuntimePostRunRecordsTraceInput) => void
}): { run?: AgentRun; writtenMemories: AgentMemory[]; rollbackRecordCount: number } {
  const run = input.store.getRun(input.runId)
  if (!run || (run.status !== 'completed' && run.status !== 'completed_with_warnings')) {
    return { writtenMemories: [], rollbackRecordCount: 0 }
  }

  const writtenMemories = input.memoryManager.extractAndWriteMemories({
    run,
    userMessage: input.records.userMessage,
    projectId: input.records.projectId,
    toolResults: input.records.toolOutcomes,
    warnings: input.records.warnings,
  })
  run.metadata = {
    ...(run.metadata ?? {}),
    writtenMemoryIds: writtenMemories.map((memory) => memory.id),
  }
  input.recordTrace(run, {
    kind: 'memory',
    title: 'Memories written',
    summary: `${writtenMemories.length} memory item(s) written after the run.`,
    status: 'completed',
    round: input.records.round,
    data: {
      async: true,
      writtenMemoryIds: writtenMemories.map((memory) => memory.id),
      kinds: Array.from(new Set(writtenMemories.map((memory) => memory.kind))),
    },
  })
  const rollbackRecordCount = recordRuntimeRollbackTrace({
    run,
    toolOutcomes: input.records.toolOutcomes,
    round: input.records.round,
    recordTrace: input.recordTrace,
  })
  input.store.updateRun(run)
  return { run, writtenMemories, rollbackRecordCount }
}

export function recordRuntimeRollbackTrace(input: {
  run: AgentRun
  toolOutcomes: ToolCallOutcome[]
  round: AgentRunRoundInfo
  recordTrace: (run: AgentRun, trace: RuntimePostRunRecordsTraceInput) => void
}): number {
  const records = buildToolRollbackRecords(input.toolOutcomes)
  if (records.length === 0) return 0
  input.recordTrace(input.run, {
    kind: 'task',
    title: 'Rollback policy recorded',
    summary: `${records.length} side effect rollback record(s).`,
    status: records.some((record) => record.rollback.policy === 'manual_compensation') ? 'blocked' : 'info',
    round: input.round,
    data: {
      eventType: 'rollback_policy',
      rollbackRecords: records,
    },
  })
  return records.length
}

function defaultDefer(callback: () => void): void {
  setTimeout(callback, 0)
}

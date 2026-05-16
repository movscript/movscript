import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import type { RuntimeDeferredTaskRegistry } from './runtimeDeferredTasks.js'
import {
  deferRuntimePostRunRecords,
  type RuntimePostRunRecordsInput,
  type RuntimePostRunRecordsTraceInput,
} from './runtimePostRunRecords.js'

export interface RuntimePostRunRecordsBridge {
  deferPostRunRecords: (runId: string, records: RuntimePostRunRecordsInput) => void
  flush: () => Promise<void>
}

export function createRuntimePostRunRecordsBridge(input: {
  store: Pick<AgentStore, 'getRun' | 'updateRun'>
  memoryManager: Pick<MemoryManager, 'extractAndWriteMemories'>
  tasks: Pick<RuntimeDeferredTaskRegistry, 'track' | 'flush'>
  recordTrace: (run: AgentRun, trace: RuntimePostRunRecordsTraceInput) => void
}): RuntimePostRunRecordsBridge {
  return {
    deferPostRunRecords: (runId, records) => deferRuntimePostRunRecords({
      store: input.store,
      memoryManager: input.memoryManager,
      tasks: input.tasks,
      runId,
      records,
      recordTrace: input.recordTrace,
    }),
    flush: () => input.tasks.flush(),
  }
}

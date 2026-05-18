import { buildPromptMemoryIndex } from '../context/promptHygiene.js'
import { isValidAgentProjectId } from '../context/runtimeContext.js'
import type { AgentMemory } from '../memory/types.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentRun, AgentTraceEvent, AgentTraceEventKind } from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'

export interface RuntimeMemoryContextTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export interface RuntimeMemoryContextResult {
  memories: AgentMemory[]
  memoryStartedAt: number
  memoryLoadedAt: number
  memoryDurationMs: number
  skipped?: boolean
}

export function resolveRuntimeMemoryContext(input: {
  run: AgentRun
  memoryManager: Pick<MemoryManager, 'loadRelevantMemories'>
  projectId?: number
  query: string
  setupRound: AgentRunRoundInfo
  timestampMs: () => number
  recordTrace: (run: AgentRun, trace: RuntimeMemoryContextTraceInput) => void
  enabled?: boolean
}): RuntimeMemoryContextResult {
  const memoryStartedAt = input.timestampMs()
  if (input.enabled === false) {
    return {
      memories: [],
      memoryStartedAt,
      memoryLoadedAt: memoryStartedAt,
      memoryDurationMs: 0,
      skipped: true,
    }
  }
  const relevantMemories = input.memoryManager.loadRelevantMemories({
    ...(isValidAgentProjectId(input.projectId) ? { projectId: input.projectId } : {}),
    query: input.query,
  })
  const memories = buildPromptMemoryIndex(relevantMemories)
  const memoryLoadedAt = input.timestampMs()
  const memoryDurationMs = memoryLoadedAt - memoryStartedAt
  if (memories.length > 0) {
    input.recordTrace(input.run, {
      kind: 'memory',
      title: 'Relevant memories loaded',
      summary: `${memories.length} memory item(s) matched this run. (${memoryDurationMs}ms)`,
      status: 'completed',
      round: input.setupRound,
      data: {
        memoryIds: memories.map((memory) => memory.id),
        kinds: Array.from(new Set(memories.map((memory) => memory.kind))),
        durationMs: memoryDurationMs,
        startedAt: new Date(memoryStartedAt).toISOString(),
        completedAt: new Date(memoryLoadedAt).toISOString(),
      },
    })
  }
  return {
    memories,
    memoryStartedAt,
    memoryLoadedAt,
    memoryDurationMs,
  }
}

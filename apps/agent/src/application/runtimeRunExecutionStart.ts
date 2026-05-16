import { applyRunExecutionStart } from '../state/runStatus.js'
import { buildRunRound, type AgentRunRoundInfo } from '../state/runRound.js'
import type {
  AgentRun,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { AgentStore } from '../state/store.js'
import { updateRuntimeThreadRunStatus } from './runtimeThreadProjection.js'

export interface RuntimeRunExecutionStartTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export function applyRuntimeRunExecutionStart(input: {
  store: Pick<AgentStore, 'getThread' | 'updateRun' | 'updateThread'>
  run: AgentRun
  startedAt: string
  projectionNow?: string
  recordTrace: (run: AgentRun, trace: RuntimeRunExecutionStartTraceInput) => void
  emitRunSnapshot: (run: AgentRun) => void
}): AgentRunRoundInfo {
  applyRunExecutionStart(input.run, input.startedAt)
  const setupRound = buildRunRound(0, 'Setup', 'setup')
  input.recordTrace(input.run, {
    kind: 'run',
    title: 'Run started',
    summary: `Thread ${input.run.threadId} entered the agentic loop.`,
    status: 'started',
    round: setupRound,
    data: {
      policy: input.run.policy,
      manifestId: input.run.agentManifest?.id,
      sandboxMode: input.run.policy.sandboxMode === true,
    },
  })
  if (input.run.planId && input.run.taskId) {
    input.recordTrace(input.run, {
      kind: 'task',
      title: 'Task heartbeat',
      summary: 'Worker task execution heartbeat.',
      status: 'info',
      round: setupRound,
      data: {
        eventType: 'heartbeat',
        planId: input.run.planId,
        taskId: input.run.taskId,
        runId: input.run.id,
        runStatus: input.run.status,
      },
    })
  }
  input.store.updateRun(input.run)
  updateRuntimeThreadRunStatus({
    store: input.store,
    threadId: input.run.threadId,
    status: input.run.status,
    runId: input.run.id,
    now: input.projectionNow ?? input.startedAt,
  })
  input.emitRunSnapshot(input.run)
  return setupRound
}

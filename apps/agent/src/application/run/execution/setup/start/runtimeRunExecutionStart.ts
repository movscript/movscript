import { applyRunExecutionStart } from '../../../../../state/run/status/lifecycle/runStatus.js'
import { buildRunRound, type AgentRunRoundInfo } from '../../../../../state/run/core/round/runRound.js'
import type {
  AgentRun,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../../../../../state/shared/types.js'
import type { AgentStore } from '../../../../../state/store/core/store.js'
import { updateRuntimeThreadRunStatus } from '../../../../thread/projection/runtimeThreadProjection.js'

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
      runtimeLimits: input.run.runtimeLimits,
      manifestId: input.run.agentManifest?.id,
      sandboxMode: input.run.runtimeLimits.sandboxMode === true,
    },
  })
  if (input.run.taskGraphId && input.run.taskId) {
    input.recordTrace(input.run, {
      kind: 'task',
      title: 'Task heartbeat',
      summary: 'Worker task execution heartbeat.',
      status: 'info',
      round: setupRound,
      data: {
        eventType: 'heartbeat',
        taskGraphId: input.run.taskGraphId,
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

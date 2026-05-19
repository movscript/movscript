import type { AgentStore } from '../state/store.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type {
  AgentMessage,
  AgentPlanSnapshot,
  AgentPlanStreamEvent,
  AgentRun,
  AgentRunStreamEvent,
  AgentThreadStreamEvent,
  AgentTask,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { RuntimeEventSubscriberRegistry } from './runtimeEventSubscribers.js'
import {
  emitRuntimePlanRunStreamEvent,
  emitRuntimePlanStreamEvent,
  emitRuntimePlanTaskStreamEvent,
  replayRuntimePlanStream,
} from './runtimePlanStreamEvents.js'
import {
  emitRuntimeAssistantMessage,
  emitRuntimeRunSnapshot,
  emitRuntimeVolatileTraceEvent,
  recordRuntimeRunTraceEvent,
  replayRuntimeRunStream,
} from './runtimeRunStreamEvents.js'

export interface RuntimeStreamBridge {
  subscribeRunStream: (run: AgentRun, listener: (event: AgentRunStreamEvent) => void) => () => void
  subscribeThreadStream: (threadId: string, listener: (event: AgentThreadStreamEvent) => void) => () => void
  subscribePlanStream: (planId: string, listener: (event: AgentPlanStreamEvent) => void) => () => void
  recordTraceEvent: (run: AgentRun, trace: RuntimeTraceInput) => AgentTraceEvent
  emitVolatileTraceEvent: (run: AgentRun, trace: RuntimeVolatileTraceInput) => void
  emitRunStreamEvent: (runId: string, event: AgentRunStreamEvent) => void
  emitRunSnapshot: (run: AgentRun, options?: { done?: boolean }) => void
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitPlanTaskEvent: (planId: string, task: AgentTask) => void
  emitPlanStreamEvent: (planId: string, event: AgentPlanStreamEvent) => void
}

export interface RuntimeTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  agentId?: string
  parentAgentId?: string
  stepId?: string
  toolName?: string
  data?: unknown
  durationMs?: number
  completedAt?: string
}

export interface RuntimeVolatileTraceInput {
  kind: AgentTraceEventKind
  title: string
  status: AgentTraceEvent['status']
  roundIndex: number
  roundLabel: string
  roundSource: AgentTraceEvent['roundSource']
  summary?: string
  data?: unknown
  volatileKey?: string
}

export function createRuntimeStreamBridge(input: {
  store: Pick<AgentStore, 'appendTraceEvent' | 'getRun' | 'getThread' | 'listRuns' | 'listRunTraceEvents'>
  runSubscribers: RuntimeEventSubscriberRegistry<AgentRunStreamEvent>
  threadSubscribers: RuntimeEventSubscriberRegistry<AgentThreadStreamEvent>
  planSubscribers: RuntimeEventSubscriberRegistry<AgentPlanStreamEvent>
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  createTraceId: () => string
  now: () => string
}): RuntimeStreamBridge {
  const bridge: RuntimeStreamBridge = {
    subscribeRunStream: (run, listener) => input.runSubscribers.subscribe(run.id, listener, (target) => {
      replayRuntimeRunStream({ run, store: input.store, listener: target })
    }),
    subscribeThreadStream: (threadId, listener) => input.threadSubscribers.subscribe(threadId, listener, (target) => {
      const runs = input.store.listRuns({ threadId }).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      for (const run of runs) {
        replayRuntimeRunStream({
          run,
          store: input.store,
          listener: (event) => target({ ...event, threadId }),
        })
      }
    }),
    subscribePlanStream: (planId, listener) => input.planSubscribers.subscribe(planId, listener, (target) => {
      replayRuntimePlanStream({ planId, getPlanSnapshot: input.getPlanSnapshot, listener: target })
    }),
    recordTraceEvent: (run, trace) => recordRuntimeRunTraceEvent({
      store: input.store,
      run,
      traceId: input.createTraceId(),
      now: input.now(),
      trace,
      emitRunStreamEvent: bridge.emitRunStreamEvent,
    }),
    emitVolatileTraceEvent: (run, trace) => emitRuntimeVolatileTraceEvent({
      run,
      traceId: input.createTraceId(),
      now: input.now(),
      trace,
      emitRunStreamEvent: bridge.emitRunStreamEvent,
    }),
    emitRunStreamEvent: (runId, event) => {
      input.runSubscribers.emit(runId, event)
      const threadId = threadIdForRunStreamEvent(event, (targetRunId) => input.store.getRun(targetRunId))
      if (threadId) input.threadSubscribers.emit(threadId, { ...event, threadId })
      if (event.type === 'done') input.runSubscribers.close(runId)
      emitRuntimePlanRunStreamEvent({
        event,
        getRun: (targetRunId) => input.store.getRun(targetRunId),
        hasPlanSubscribers: (planId) => input.planSubscribers.has(planId),
        getPlanSnapshot: input.getPlanSnapshot,
        emitPlanStreamEvent: bridge.emitPlanStreamEvent,
      })
    },
    emitRunSnapshot: (run, options = {}) => {
      emitRuntimeRunSnapshot({
        run,
        done: options.done,
        emitRunStreamEvent: bridge.emitRunStreamEvent,
      })
    },
    emitAssistantMessage: (run, message) => {
      emitRuntimeAssistantMessage({
        run,
        message,
        emitRunStreamEvent: bridge.emitRunStreamEvent,
      })
    },
    emitPlanTaskEvent: (planId, task) => {
      emitRuntimePlanTaskStreamEvent({
        planId,
        task,
        hasPlanSubscribers: (targetPlanId) => input.planSubscribers.has(targetPlanId),
        getPlanSnapshot: input.getPlanSnapshot,
        emitPlanStreamEvent: bridge.emitPlanStreamEvent,
      })
    },
    emitPlanStreamEvent: (planId, event) => {
      emitRuntimePlanStreamEvent({
        planId,
        event,
        emit: (targetPlanId, targetEvent) => input.planSubscribers.emit(targetPlanId, targetEvent),
        close: (targetPlanId) => input.planSubscribers.close(targetPlanId),
      })
    },
  }
  return bridge
}

function threadIdForRunStreamEvent(event: AgentRunStreamEvent, getRun: (runId: string) => AgentRun | undefined): string | undefined {
  if (event.type === 'thread_title') return event.threadId
  if ('run' in event && event.run) return event.run.threadId
  if ('runId' in event) return getRun(event.runId)?.threadId
  return undefined
}

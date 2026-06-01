import type { AgentStore } from '../state/store.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type {
  AgentMessage,
  AgentTaskGraphSnapshot,
  AgentTaskGraphStreamEvent,
  AgentRun,
  AgentInternalRunSignal,
  AgentInternalThreadSignal,
  AgentTask,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { RuntimeTelemetryRegistry } from '../telemetry/runtimeTelemetry.js'
import type { RuntimeEventSubscriberRegistry } from './runtimeEventSubscribers.js'
import {
  emitRuntimePlanRunStreamEvent,
  emitRuntimePlanStreamEvent,
  emitRuntimeTaskGraphTaskStreamEvent,
  replayRuntimePlanStream,
} from './runtimePlanStreamEvents.js'
import {
  emitRuntimeAssistantMessage,
  emitRuntimeRunSnapshot,
  emitRuntimeVolatileTraceEvent,
  recordRuntimeRunTraceEvent,
  replayRuntimeRunStream,
} from './runtimeRunStreamEvents.js'
import { runtimeRunDisplayThreadIds, runtimeRunDisplaysOnThread } from './runtimeRunVisibility.js'

export interface RuntimeStreamBridge {
  subscribeRunStream: (run: AgentRun, listener: (event: AgentInternalRunSignal) => void) => () => void
  subscribeSessionStream: (sessionId: string, listener: (event: AgentInternalThreadSignal) => void) => () => void
  subscribeThreadStream: (threadId: string, listener: (event: AgentInternalThreadSignal) => void) => () => void
  subscribePlanStream: (taskGraphId: string, listener: (event: AgentTaskGraphStreamEvent) => void) => () => void
  recordTraceEvent: (run: AgentRun, trace: RuntimeTraceInput) => AgentTraceEvent
  emitVolatileTraceEvent: (run: AgentRun, trace: RuntimeVolatileTraceInput) => void
  emitRunStreamEvent: (runId: string, event: AgentInternalRunSignal) => void
  emitRunSnapshot: (run: AgentRun, options?: { done?: boolean }) => void
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitPlanTaskEvent: (taskGraphId: string, task: AgentTask) => void
  emitPlanStreamEvent: (taskGraphId: string, event: AgentTaskGraphStreamEvent) => void
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
  runSubscribers: RuntimeEventSubscriberRegistry<AgentInternalRunSignal>
  sessionSubscribers: RuntimeEventSubscriberRegistry<AgentInternalThreadSignal>
  threadSubscribers: RuntimeEventSubscriberRegistry<AgentInternalThreadSignal>
  planSubscribers: RuntimeEventSubscriberRegistry<AgentTaskGraphStreamEvent>
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
  createTraceId: () => string
  now: () => string
  telemetry?: RuntimeTelemetryRegistry
}): RuntimeStreamBridge {
  const bridge: RuntimeStreamBridge = {
    subscribeRunStream: (run, listener) => input.runSubscribers.subscribe(run.id, listener, (target) => {
      replayRuntimeRunStream({ run, store: input.store, listener: target })
    }),
    subscribeSessionStream: (sessionId, listener) => input.sessionSubscribers.subscribe(sessionId, listener, (target) => {
      const runs = input.store.listRuns({ sessionId })
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      for (const run of runs) {
        replayRuntimeRunStream({
          run,
          store: input.store,
          listener: (event) => target({ ...event, threadId: run.threadId }),
        })
      }
    }),
    subscribeThreadStream: (threadId, listener) => input.threadSubscribers.subscribe(threadId, listener, (target) => {
      const runs = input.store.listRuns()
        .filter((run) => run.threadId === threadId || runtimeRunDisplaysOnThread(run, threadId))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      for (const run of runs) {
        replayRuntimeRunStream({
          run,
          store: input.store,
          listener: (event) => target({ ...event, threadId }),
        })
      }
    }),
    subscribePlanStream: (taskGraphId, listener) => input.planSubscribers.subscribe(taskGraphId, listener, (target) => {
      replayRuntimePlanStream({ taskGraphId, getTaskGraphSnapshot: input.getTaskGraphSnapshot, listener: target })
    }),
    recordTraceEvent: (run, trace) => {
      const event = recordRuntimeRunTraceEvent({
        store: input.store,
        run,
        traceId: input.createTraceId(),
        now: input.now(),
        trace,
        emitRunStreamEvent: bridge.emitRunStreamEvent,
      })
      input.telemetry?.recordSpan({
        traceEventId: event.id,
        runId: run.id,
        threadId: run.threadId,
        kind: event.kind,
        name: event.title,
        status: event.status,
        startedAt: event.createdAt,
        ...(event.completedAt ? { endedAt: event.completedAt } : {}),
        ...(typeof event.durationMs === 'number' ? { durationMs: event.durationMs } : {}),
        ...(event.toolName ? { toolName: event.toolName } : {}),
        labels: {
          ...(run.role ? { run_role: run.role } : {}),
          ...(event.roundSource ? { round_source: event.roundSource } : {}),
        },
      })
      return event
    },
    emitVolatileTraceEvent: (run, trace) => emitRuntimeVolatileTraceEvent({
      run,
      traceId: input.createTraceId(),
      now: input.now(),
      trace,
      emitRunStreamEvent: bridge.emitRunStreamEvent,
    }),
    emitRunStreamEvent: (runId, event) => {
      input.runSubscribers.emit(runId, event)
      for (const threadId of threadIdsForRunStreamEvent(event, (targetRunId) => input.store.getRun(targetRunId))) {
        input.threadSubscribers.emit(threadId, { ...event, threadId })
      }
      for (const sessionEvent of sessionEventsForRunStreamEvent(event, (targetRunId) => input.store.getRun(targetRunId))) {
        input.sessionSubscribers.emit(sessionEvent.sessionId, { ...event, threadId: sessionEvent.threadId })
      }
      if (event.type === 'done') input.runSubscribers.close(runId)
      emitRuntimePlanRunStreamEvent({
        event,
        getRun: (targetRunId) => input.store.getRun(targetRunId),
        hasPlanSubscribers: (taskGraphId) => input.planSubscribers.has(taskGraphId),
        getTaskGraphSnapshot: input.getTaskGraphSnapshot,
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
    emitPlanTaskEvent: (taskGraphId, task) => {
      emitRuntimeTaskGraphTaskStreamEvent({
        taskGraphId,
        task,
        hasPlanSubscribers: (targetPlanId) => input.planSubscribers.has(targetPlanId),
        getTaskGraphSnapshot: input.getTaskGraphSnapshot,
        emitPlanStreamEvent: bridge.emitPlanStreamEvent,
      })
    },
    emitPlanStreamEvent: (taskGraphId, event) => {
      emitRuntimePlanStreamEvent({
        taskGraphId,
        event,
        emit: (targetPlanId, targetEvent) => input.planSubscribers.emit(targetPlanId, targetEvent),
        close: (targetPlanId) => input.planSubscribers.close(targetPlanId),
      })
    },
  }
  return bridge
}

function sessionEventsForRunStreamEvent(
  event: AgentInternalRunSignal,
  getRun: (runId: string) => AgentRun | undefined,
): Array<{ sessionId: string; threadId: string }> {
  const run = 'run' in event && event.run
    ? event.run
    : 'runId' in event
      ? getRun(event.runId)
      : undefined
  return run?.sessionId ? [{ sessionId: run.sessionId, threadId: run.threadId }] : []
}

function threadIdsForRunStreamEvent(event: AgentInternalRunSignal, getRun: (runId: string) => AgentRun | undefined): string[] {
  if (event.type === 'thread_title') return [event.threadId]
  const run = 'run' in event && event.run
    ? event.run
    : 'runId' in event
      ? getRun(event.runId)
      : undefined
  if (!run) return []
  return [...new Set([run.threadId, ...runtimeRunDisplayThreadIds(run)])]
}

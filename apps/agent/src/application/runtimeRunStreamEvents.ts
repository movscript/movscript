import type { JSONValue } from '../types.js'
import { appendTraceEvent } from '../state/runTrace.js'
import {
  assistantDeltaFromTraceEvent,
  assistantMessageForRun,
  assistantMessageFromTraceEvent,
  toStreamRun,
} from '../state/runStreamView.js'
import {
  isTerminalRunStatus,
} from '../state/subagentRunView.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStreamEvent,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'

export function recordRuntimeRunTraceEvent(input: {
  store: Pick<AgentStore, 'appendTraceEvent' | 'getThread'>
  run: AgentRun
  traceId: string
  now: string
  trace: {
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
  emitRunStreamEvent: (runId: string, event: AgentRunStreamEvent) => void
}): AgentTraceEvent {
  const event = appendTraceEvent({
    id: input.traceId,
    run: input.run,
    now: input.now,
    kind: input.trace.kind,
    title: input.trace.title,
    status: input.trace.status,
    ...(input.trace.round ? { round: input.trace.round } : {}),
    ...(input.trace.summary ? { summary: input.trace.summary } : {}),
    ...(input.trace.agentId ? { agentId: input.trace.agentId } : {}),
    ...(input.trace.parentAgentId ? { parentAgentId: input.trace.parentAgentId } : {}),
    ...(input.trace.stepId ? { stepId: input.trace.stepId } : {}),
    ...(input.trace.toolName ? { toolName: input.trace.toolName } : {}),
    ...(input.trace.data !== undefined ? { data: input.trace.data } : {}),
    ...(typeof input.trace.durationMs === 'number' && Number.isFinite(input.trace.durationMs)
      ? { durationMs: input.trace.durationMs }
      : {}),
    ...(input.trace.completedAt ? { completedAt: input.trace.completedAt } : {}),
  })
  input.store.appendTraceEvent(event)
  input.emitRunStreamEvent(input.run.id, { type: 'trace', runId: input.run.id, event })
  emitTraceDerivedRunStreamEvents({
    event,
    run: input.run,
    getThread: (threadId) => input.store.getThread(threadId),
    emitRunStreamEvent: input.emitRunStreamEvent,
  })
  return event
}

export function emitRuntimeVolatileTraceEvent(input: {
  run: AgentRun
  traceId: string
  now: string
  trace: {
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
  emitRunStreamEvent: (runId: string, event: AgentRunStreamEvent) => void
}): void {
  const event: AgentTraceEvent = {
    id: input.trace.volatileKey ? `trace_live_${input.trace.volatileKey}` : input.traceId,
    runId: input.run.id,
    kind: input.trace.kind,
    title: input.trace.title,
    status: input.trace.status,
    roundId: `round_${input.trace.roundIndex}`,
    roundIndex: input.trace.roundIndex,
    roundLabel: input.trace.roundLabel,
    roundSource: input.trace.roundSource,
    createdAt: input.now,
    ...(input.trace.summary ? { summary: input.trace.summary } : {}),
    ...(input.trace.data !== undefined ? { data: input.trace.data as JSONValue } : {}),
  }
  if (input.trace.kind === 'tool_call') {
    input.emitRunStreamEvent(input.run.id, { type: 'trace', runId: input.run.id, event })
  }
  emitTraceDeltaEvent({
    event,
    runId: input.run.id,
    emitRunStreamEvent: input.emitRunStreamEvent,
  })
}

export function replayRuntimeRunStream(input: {
  run: AgentRun
  store: Pick<AgentStore, 'getThread' | 'listRunTraceEvents'>
  listener: (event: AgentRunStreamEvent) => void
}): void {
  const streamRun = toStreamRun(input.run)
  input.listener({ type: 'run', run: streamRun })
  const thread = input.store.getThread(input.run.threadId)
  if (thread?.title?.trim()) {
    input.listener({
      type: 'thread_title',
      runId: input.run.id,
      threadId: thread.id,
      title: thread.title.trim(),
      updatedAt: thread.updatedAt,
    })
  }
  const traceEvents = input.store.listRunTraceEvents(input.run.id, { limit: Number.MAX_SAFE_INTEGER })
  for (const event of traceEvents) {
    input.listener({ type: 'trace', runId: input.run.id, event })
    const assistantDelta = assistantDeltaFromTraceEvent(event)
    if (assistantDelta) {
      input.listener({ ...assistantDelta, runId: input.run.id, traceEventId: event.id, createdAt: event.createdAt })
    }
  }
  const assistantMessage = assistantMessageForRun(thread, input.run)
  if (assistantMessage) input.listener({ type: 'assistant_message', runId: input.run.id, message: assistantMessage, run: streamRun })
  if (isTerminalRunStatus(input.run.status)) input.listener({ type: 'done', run: streamRun })
}

export function emitRuntimeRunSnapshot(input: {
  run: AgentRun
  done?: boolean
  emitRunStreamEvent: (runId: string, event: AgentRunStreamEvent) => void
}): void {
  const streamRun = toStreamRun(input.run)
  input.emitRunStreamEvent(input.run.id, { type: 'run', run: streamRun })
  if (input.done) {
    input.emitRunStreamEvent(input.run.id, { type: 'done', run: streamRun })
  }
}

export function emitRuntimeAssistantMessage(input: {
  run: AgentRun
  message: AgentMessage
  emitRunStreamEvent: (runId: string, event: AgentRunStreamEvent) => void
}): void {
  input.emitRunStreamEvent(input.run.id, {
    type: 'assistant_message',
    runId: input.run.id,
    message: input.message,
    run: toStreamRun(input.run),
  })
}

function emitTraceDerivedRunStreamEvents(input: {
  event: AgentTraceEvent
  run: AgentRun
  getThread: (threadId: string) => ReturnType<AgentStore['getThread']>
  emitRunStreamEvent: (runId: string, event: AgentRunStreamEvent) => void
}): void {
  emitTraceDeltaEvent({
    event: input.event,
    runId: input.run.id,
    emitRunStreamEvent: input.emitRunStreamEvent,
  })
  const assistantMessage = assistantMessageFromTraceEvent(input.getThread(input.run.threadId) ?? undefined, input.event)
  if (assistantMessage) {
    input.emitRunStreamEvent(input.run.id, {
      type: 'assistant_message',
      runId: input.run.id,
      message: assistantMessage,
      run: toStreamRun(input.run),
    })
  }
}

function emitTraceDeltaEvent(input: {
  event: AgentTraceEvent
  runId: string
  emitRunStreamEvent: (runId: string, event: AgentRunStreamEvent) => void
}): void {
  const assistantDelta = assistantDeltaFromTraceEvent(input.event)
  if (assistantDelta) {
    input.emitRunStreamEvent(input.runId, {
      ...assistantDelta,
      runId: input.runId,
      traceEventId: input.event.id,
      createdAt: input.event.createdAt,
    })
  }
}

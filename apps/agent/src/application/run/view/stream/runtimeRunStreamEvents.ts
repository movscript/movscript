import { isAgentRunTerminalStatus } from '@movscript/protocol'
import { appendTraceEvent, buildVolatileTraceEvent } from '../../../../trace/run/runTrace.js'
import { summarizeModelStreamTraceData } from '../../../../trace/summaries/model/stream/streamTrace.js'
import {
  assistantProgressFromTraceEvent,
  assistantMessageForRun,
  assistantMessageFromTraceEvent,
  toStreamRun,
} from '../../../../state/run/projection/stream/runStreamView.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentRunRoundInfo } from '../../../../state/run/core/round/runRound.js'
import type {
  AgentMessage,
  AgentRuntimeStatusRecord,
  AgentRun,
  AgentInternalRunSignal,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../../../../state/shared/types.js'

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
  emitRunStreamEvent: (runId: string, event: AgentInternalRunSignal) => void
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
  emitRunStreamEvent: (runId: string, event: AgentInternalRunSignal) => void
}): void {
  const traceData = (input.trace.kind === 'tool_call' || input.trace.kind === 'reasoning') && !isContentStreamTraceData(input.trace.data)
    ? summarizeModelStreamTraceData(input.trace.data)
    : input.trace.data
  const event = buildVolatileTraceEvent({
    id: input.traceId,
    run: input.run,
    now: input.now,
    kind: input.trace.kind,
    title: input.trace.title,
    status: input.trace.status,
    roundIndex: input.trace.roundIndex,
    roundLabel: input.trace.roundLabel,
    roundSource: input.trace.roundSource,
    ...(input.trace.summary ? { summary: input.trace.summary } : {}),
    ...(traceData !== undefined ? { data: traceData } : {}),
    ...(input.trace.volatileKey ? { volatileKey: input.trace.volatileKey } : {}),
  })
  if (input.trace.kind === 'tool_call' || input.trace.kind === 'reasoning') {
    input.emitRunStreamEvent(input.run.id, { type: 'trace', runId: input.run.id, event })
  }
  emitTraceProgressEvent({
    event,
    runId: input.run.id,
    emitRunStreamEvent: input.emitRunStreamEvent,
  })
}

function isContentStreamTraceData(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const stream = (data as { stream?: unknown }).stream
  return Boolean(stream && typeof stream === 'object' && !Array.isArray(stream) && (stream as { kind?: unknown }).kind === 'content')
}

export function replayRuntimeRunStream(input: {
  run: AgentRun
  store: Pick<AgentStore, 'getThread' | 'listRunTraceEvents'>
  listener: (event: AgentInternalRunSignal) => void
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
  emitRuntimeStatusLightEvent({
    run: streamRun,
    thread,
    listener: input.listener,
  })
  const traceEvents = input.store.listRunTraceEvents(input.run.id, { limit: Number.MAX_SAFE_INTEGER })
  for (const event of traceEvents) {
    input.listener({ type: 'trace', runId: input.run.id, event })
    const assistantProgress = assistantProgressFromTraceEvent(event)
    if (assistantProgress) {
      input.listener({ ...assistantProgress, runId: input.run.id, traceEventId: event.id, createdAt: event.createdAt })
    }
  }
  const assistantMessage = assistantMessageForRun(thread, input.run)
  if (assistantMessage) input.listener({ type: 'assistant_message', runId: input.run.id, message: assistantMessage, run: streamRun })
  if (isAgentRunTerminalStatus(input.run.status)) input.listener({ type: 'done', run: streamRun })
}

export function emitRuntimeRunSnapshot(input: {
  run: AgentRun
  done?: boolean
  emitRunStreamEvent: (runId: string, event: AgentInternalRunSignal) => void
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
  emitRunStreamEvent: (runId: string, event: AgentInternalRunSignal) => void
}): void {
  input.emitRunStreamEvent(input.run.id, {
    type: 'assistant_message',
    runId: input.run.id,
    message: input.message,
    run: toStreamRun(input.run),
  })
}

export function runtimeStatusLightRecordForRun(run: AgentRun, thread?: Pick<AgentThread, 'runtimeStatuses'>): AgentRuntimeStatusRecord {
  const asyncHandoff = [...(thread?.runtimeStatuses ?? [])]
    .reverse()
    .find((status) => status.runId === run.id && status.status.kind === 'async_work_handoff')
  const asyncHandoffStatus = asyncHandoff?.status
  const status = asyncHandoffStatus?.kind === 'async_work_handoff' && asyncHandoffStatus.workStatus !== 'completed' && asyncHandoffStatus.workStatus !== 'failed'
    ? {
        state: 'waiting' as const,
        label: '等待',
        detail: asyncHandoffStatus.detail,
      }
    : runtimeStatusLightFromRunStatus(run.status)
  const createdAt = run.updatedAt ?? run.completedAt ?? run.failedAt ?? run.createdAt
  return {
    id: `runtime-status-light:${run.threadId}`,
    threadId: run.threadId,
    runId: run.id,
    content: status.detail,
    status: {
      kind: 'status_light',
      ...status,
    },
    createdAt,
  }
}

function emitRuntimeStatusLightEvent(input: {
  run: AgentRun
  thread?: Pick<AgentThread, 'runtimeStatuses'>
  listener: (event: AgentInternalRunSignal) => void
}): void {
  input.listener({
    type: 'runtime_status',
    runId: input.run.id,
    run: input.run,
    status: runtimeStatusLightRecordForRun(input.run, input.thread),
  })
}

function runtimeStatusLightFromRunStatus(status: AgentRun['status']): { state: 'stopped' | 'waiting' | 'active'; label: string; detail: string } {
  if (status === 'queued' || status === 'in_progress') {
    return {
      state: 'active',
      label: '运行',
      detail: 'Runtime 正在触发 run 循环。',
    }
  }
  if (status === 'requires_action') {
    return {
      state: 'waiting',
      label: '等待',
      detail: 'Runtime 正在等待外部信息或用户确认。',
    }
  }
  return {
    state: 'stopped',
    label: '停止',
    detail: 'Runtime 当前不会自行触发新的 run，需要新的用户输入。',
  }
}

function emitTraceDerivedRunStreamEvents(input: {
  event: AgentTraceEvent
  run: AgentRun
  getThread: (threadId: string) => ReturnType<AgentStore['getThread']>
  emitRunStreamEvent: (runId: string, event: AgentInternalRunSignal) => void
}): void {
  emitTraceProgressEvent({
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

function emitTraceProgressEvent(input: {
  event: AgentTraceEvent
  runId: string
  emitRunStreamEvent: (runId: string, event: AgentInternalRunSignal) => void
}): void {
  const assistantProgress = assistantProgressFromTraceEvent(input.event)
  if (assistantProgress) {
    input.emitRunStreamEvent(input.runId, {
      ...assistantProgress,
      runId: input.runId,
      traceEventId: input.event.id,
      createdAt: input.event.createdAt,
    })
  }
}

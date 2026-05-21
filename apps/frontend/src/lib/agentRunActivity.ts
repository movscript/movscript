import type { AgentRun, AgentRunStreamEvent, AgentTraceEvent } from '@/lib/localAgentClient'
import { isRecord } from '@/lib/jsonValue'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/store/agentStore'

export interface LiveRunPendingAssistantState {
  status: 'preparing_tool_call' | 'calling_tool'
  toolName?: string
}

export interface LiveRunTraceProjection {
  activityEvent: ChatRunActivityEvent
  pendingAssistantState?: LiveRunPendingAssistantState | null
}

export function compactRunActivity(run: AgentRun): ChatRunActivity {
  return {
    runId: run.id,
    threadId: run.threadId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.failedAt ? { failedAt: run.failedAt } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.warnings?.length ? { warnings: run.warnings } : {}),
    ...(run.pendingApprovals?.length
      ? {
          approvals: run.pendingApprovals.map((approval) => ({
            id: approval.id,
            runId: approval.runId,
            ...(approval.interactionId ? { interactionId: approval.interactionId } : {}),
            toolName: approval.toolName,
            ...(approval.args ? { args: approval.args } : {}),
            ...(approval.preview !== undefined ? { preview: approval.preview } : {}),
            reason: approval.reason,
            ...(approval.risk ? { risk: approval.risk } : {}),
            ...(approval.permission ? { permission: approval.permission } : {}),
            status: approval.status,
            createdAt: approval.createdAt,
            updatedAt: approval.updatedAt,
            ...(approval.approvedAt ? { approvedAt: approval.approvedAt } : {}),
            ...(approval.rejectedAt ? { rejectedAt: approval.rejectedAt } : {}),
          })),
        }
      : {}),
    ...(run.pendingInputRequests?.length
      ? {
          inputs: run.pendingInputRequests.map((request) => ({
            id: request.id,
            runId: request.runId,
            title: request.title,
            ...(request.summary ? { summary: request.summary } : {}),
            question: request.question,
            inputType: request.inputType,
            choices: request.choices,
            allowCustomAnswer: request.allowCustomAnswer,
            status: request.status,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            ...(request.answeredAt ? { answeredAt: request.answeredAt } : {}),
            ...(request.answer ? { answer: request.answer } : {}),
          })),
        }
      : {}),
    steps: run.steps
      .filter((step) => step.type === 'tool_call' || step.type === 'message')
      .map((step) => ({
        id: step.id,
        type: step.type,
        status: step.status,
        ...(step.title ? { title: step.title } : {}),
        ...(step.toolName ? { toolName: step.toolName } : {}),
        ...(step.args ? { args: step.args } : {}),
        ...(step.result !== undefined ? { result: step.result } : {}),
        ...(step.error ? { error: step.error } : {}),
        ...(step.sandboxed ? { sandboxed: step.sandboxed } : {}),
        ...(typeof step.durationMs === 'number' ? { durationMs: step.durationMs } : {}),
        createdAt: step.createdAt,
        ...(step.completedAt ? { completedAt: step.completedAt } : {}),
      })),
    events: compactRunTraceEvents(run.traceEvents ?? []),
  }
}

export function compactRunTraceEvents(events: AgentTraceEvent[] = []): ChatRunActivityEvent[] {
  return events
    .filter((trace) => trace.kind === 'tool_call'
      || trace.kind === 'model_call'
      || trace.kind === 'context'
      || trace.kind === 'memory'
      || trace.kind === 'policy'
      || trace.kind === 'tool_catalog'
      || trace.kind === 'message'
      || trace.kind === 'assistant'
      || trace.kind === 'run'
      || trace.kind === 'approval'
      || trace.kind === 'input')
    .map((trace) => ({
      id: trace.id,
      kind: trace.kind,
      title: trace.title,
      status: trace.status,
      ...(trace.summary ? { summary: trace.summary } : {}),
      ...(trace.toolName ? { toolName: trace.toolName } : {}),
      ...(trace.stepId ? { stepId: trace.stepId } : {}),
      ...(trace.data !== undefined ? { data: trace.data } : {}),
      ...(typeof trace.durationMs === 'number' ? { durationMs: trace.durationMs } : {}),
      createdAt: trace.createdAt,
      ...(trace.completedAt ? { completedAt: trace.completedAt } : {}),
    }))
}

export function liveTraceEventKey(event: ChatRunActivityEvent): string {
  if (event.kind !== 'tool_call' || event.title !== 'Model tool call delta') return event.id
  if (event.id.startsWith('trace_live_')) return event.id
  const data = isRecord(event.data) ? event.data : undefined
  const stream = isRecord(data?.stream) ? data.stream : undefined
  const toolCall = isRecord(stream?.toolCall) ? stream.toolCall : undefined
  const index = typeof toolCall?.index === 'number' ? toolCall.index : 0
  return `model-tool-call-stream:${index}`
}

export function mergeLiveRunActivityEvent(current: ChatRunActivityEvent[], item: ChatRunActivityEvent, input: { runtimeLimit?: number } = {}): ChatRunActivityEvent[] {
  const itemKey = liveTraceEventKey(item)
  const existingIndex = current.findIndex((candidate) => liveTraceEventKey(candidate) === itemKey)
  const next = existingIndex >= 0
    ? current.map((candidate, index) => index === existingIndex ? item : candidate)
    : [...current, item]
  const httpItems = next.filter((candidate) => candidate.id.startsWith('http-request-'))
  const runtimeItems = next.filter((candidate) => !candidate.id.startsWith('http-request-'))
  return [...httpItems, ...runtimeItems.slice(-(input.runtimeLimit ?? 16))]
}

export function projectLiveRunStreamTraceEvent(event: AgentRunStreamEvent): LiveRunTraceProjection | null {
  if (event.type !== 'trace') return null
  const trace = event.event
  if (!isLiveRunActivityTraceKind(trace.kind)) return null
  const activityEvent = chatRunActivityEventFromTrace(trace)
  const pendingAssistantState = pendingAssistantStateFromTrace(activityEvent)
  return {
    activityEvent,
    ...(pendingAssistantState !== undefined ? { pendingAssistantState } : {}),
  }
}

export function mergeRunActivityEvents(activity: ChatRunActivity, events: ChatRunActivityEvent[]): ChatRunActivity {
  if (events.length === 0) return activity
  const existingKeys = new Set(activity.events.map(liveTraceEventKey))
  const mergedEvents = [
    ...activity.events,
    ...events.filter((event) => !existingKeys.has(liveTraceEventKey(event))),
  ]
  return { ...activity, events: mergedEvents.slice(-48) }
}

function chatRunActivityEventFromTrace(trace: AgentTraceEvent): ChatRunActivityEvent {
  return {
    id: trace.id,
    kind: trace.kind,
    title: trace.title,
    status: trace.status,
    ...(trace.summary ? { summary: trace.summary } : {}),
    ...(trace.toolName ? { toolName: trace.toolName } : {}),
    ...(trace.stepId ? { stepId: trace.stepId } : {}),
    ...(trace.data !== undefined ? { data: trace.data } : {}),
    ...(typeof trace.durationMs === 'number' ? { durationMs: trace.durationMs } : {}),
    createdAt: trace.createdAt,
    ...(trace.completedAt ? { completedAt: trace.completedAt } : {}),
  }
}

function pendingAssistantStateFromTrace(event: ChatRunActivityEvent): LiveRunPendingAssistantState | null | undefined {
  if (event.kind === 'tool_call') {
    if (event.status === 'started') {
      return {
        status: 'calling_tool',
        ...(event.toolName ? { toolName: event.toolName } : {}),
      }
    }
    if (event.status === 'info') {
      return {
        status: 'preparing_tool_call',
        ...(event.toolName ? { toolName: event.toolName } : {}),
      }
    }
    if (event.status === 'completed' || event.status === 'failed' || event.status === 'blocked') return null
  }
  if (event.kind === 'model_call' && modelCallStreamKind(event) === 'tool_call' && (event.status === 'started' || event.status === 'info')) {
    const toolName = toolNameFromToolCallStreamEvent(event)
    return {
      status: 'preparing_tool_call',
      ...(toolName ? { toolName } : {}),
    }
  }
  return undefined
}

function isLiveRunActivityTraceKind(kind: AgentTraceEvent['kind']): boolean {
  return kind === 'tool_call'
    || kind === 'model_call'
    || kind === 'context'
    || kind === 'memory'
    || kind === 'policy'
    || kind === 'tool_catalog'
    || kind === 'approval'
    || kind === 'input'
}

function modelCallStreamKind(event: ChatRunActivityEvent): string | undefined {
  const data = isRecord(event.data) ? event.data : undefined
  const stream = isRecord(data?.stream) ? data.stream : undefined
  return typeof stream?.kind === 'string' ? stream.kind : undefined
}

export function toolNameFromToolCallStreamEvent(event: ChatRunActivityEvent): string | undefined {
  const data = isRecord(event.data) ? event.data : undefined
  const stream = isRecord(data?.stream) ? data.stream : undefined
  const toolCall = isRecord(stream?.toolCall) ? stream.toolCall : undefined
  return typeof toolCall?.name === 'string' && toolCall.name.trim() ? toolCall.name.trim() : undefined
}

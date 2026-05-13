import type { AgentRun, AgentTraceEvent } from '@/lib/localAgentClient'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/store/agentStore'

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
      || trace.kind === 'run')
    .map((trace) => ({
      id: trace.id,
      kind: trace.kind,
      title: trace.title,
      status: trace.status,
      ...(trace.summary ? { summary: trace.summary } : {}),
      ...(trace.toolName ? { toolName: trace.toolName } : {}),
      ...(trace.stepId ? { stepId: trace.stepId } : {}),
      ...(trace.data !== undefined ? { data: trace.data } : {}),
      createdAt: trace.createdAt,
      ...(trace.completedAt ? { completedAt: trace.completedAt } : {}),
    }))
}

export function liveTraceEventKey(event: ChatRunActivityEvent): string {
  if (event.kind !== 'tool_call' || event.title !== 'Model tool call delta') return event.id
  if (event.id.startsWith('trace_live_')) return event.id
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
  const stream = data?.stream && typeof data.stream === 'object' ? data.stream as Record<string, unknown> : undefined
  const toolCall = stream?.toolCall && typeof stream.toolCall === 'object' ? stream.toolCall as Record<string, unknown> : undefined
  const index = typeof toolCall?.index === 'number' ? toolCall.index : 0
  return `model-tool-call-stream:${index}`
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

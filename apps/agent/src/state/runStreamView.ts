import { isRecord } from '../jsonValue.js'
import type { AgentMessage, AgentRun, AgentRunStreamEvent, AgentRunStreamRun, AgentThread, AgentTraceEvent } from './types.js'

export type AgentAssistantDeltaStreamEvent = Omit<Extract<AgentRunStreamEvent, { type: 'assistant_delta' }>, 'runId' | 'traceEventId' | 'createdAt' | 'run'>

export function assistantDeltaFromTraceEvent(event: AgentTraceEvent): AgentAssistantDeltaStreamEvent | undefined {
  const data = isRecord(event.data) ? event.data : undefined
  const stream = isRecord(data?.stream) ? data.stream : undefined
  if (stream?.kind !== 'content') return undefined
  const delta = typeof stream.delta === 'string' ? stream.delta : ''
  if (!delta) return undefined
  const accumulated = typeof stream.accumulated === 'string' ? stream.accumulated : delta
  return {
    type: 'assistant_delta',
    delta,
    accumulated,
    ...(typeof event.roundIndex === 'number' ? { roundIndex: event.roundIndex } : {}),
    ...(typeof event.roundLabel === 'string' ? { roundLabel: event.roundLabel } : {}),
  }
}

export function assistantMessageFromTraceEvent(thread: AgentThread | undefined, event: AgentTraceEvent): AgentMessage | undefined {
  if (!thread || event.kind !== 'assistant') return undefined
  const data = isRecord(event.data) ? event.data : undefined
  const messageId = typeof data?.messageId === 'string' ? data.messageId : undefined
  if (!messageId) return undefined
  return thread.messages.find((message) => message.id === messageId && message.role === 'assistant')
}

export function assistantMessageForRun(thread: AgentThread | undefined, run: AgentRun): AgentMessage | undefined {
  if (!thread) return undefined
  if (run.assistantMessageId) {
    const message = thread.messages.find((item) => item.id === run.assistantMessageId && item.role === 'assistant')
    if (message) return message
  }
  return [...thread.messages].reverse().find((message) => message.role === 'assistant' && message.runId === run.id)
}

export function toStreamRun(run: AgentRun): AgentRunStreamRun {
  return {
    id: run.id,
    threadId: run.threadId,
    status: run.status,
    ...(run.role ? { role: run.role } : {}),
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    ...(run.planId ? { planId: run.planId } : {}),
    ...(run.taskId ? { taskId: run.taskId } : {}),
    ...(typeof run.progress === 'number' ? { progress: run.progress } : {}),
    ...(run.blockedReason ? { blockedReason: run.blockedReason } : {}),
    agentManifest: run.agentManifest,
    policy: run.policy,
    ...(run.pendingApprovals ? { pendingApprovals: run.pendingApprovals } : {}),
    ...(run.pendingInputRequests ? { pendingInputRequests: run.pendingInputRequests } : {}),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.failedAt ? { failedAt: run.failedAt } : {}),
    ...(run.cancelledAt ? { cancelledAt: run.cancelledAt } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.warnings ? { warnings: run.warnings } : {}),
    ...(run.assistantMessageId ? { assistantMessageId: run.assistantMessageId } : {}),
    steps: run.steps.map((step) => ({
      id: step.id,
      runId: step.runId,
      type: step.type,
      status: step.status,
      ...(step.roundId ? { roundId: step.roundId } : {}),
      ...(step.roundIndex !== undefined ? { roundIndex: step.roundIndex } : {}),
      ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
      ...(step.roundSource ? { roundSource: step.roundSource } : {}),
      ...(step.title ? { title: step.title } : {}),
      ...(step.toolName ? { toolName: step.toolName } : {}),
      ...(step.error ? { error: step.error } : {}),
      ...(step.errorData !== undefined ? { errorData: step.errorData } : {}),
      ...(step.sandboxed ? { sandboxed: step.sandboxed } : {}),
      ...(typeof step.durationMs === 'number' ? { durationMs: step.durationMs } : {}),
      createdAt: step.createdAt,
      ...(step.completedAt ? { completedAt: step.completedAt } : {}),
    })),
    traceEvents: [],
    streamPartial: true,
  }
}

export function toProductRun(run: AgentRun): AgentRun {
  return {
    ...run,
    traceEvents: [],
  }
}

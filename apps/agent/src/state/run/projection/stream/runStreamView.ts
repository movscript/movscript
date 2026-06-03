import { isAgentTranscriptAssistantMessage } from '@movscript/protocol'
import { isRecord } from '../../../../shared/json/jsonValue.js'
import type { AgentMessage, AgentRun, AgentInternalRunSignal, AgentInternalRunSignalRun, AgentThread, AgentTraceEvent } from '../../../shared/types.js'

export type AgentAssistantProgressInternalSignal = Omit<Extract<AgentInternalRunSignal, { type: 'assistant_progress' }>, 'runId' | 'traceEventId' | 'createdAt' | 'run'>

export function assistantProgressFromTraceEvent(event: AgentTraceEvent): AgentAssistantProgressInternalSignal | undefined {
  const data = isRecord(event.data) ? event.data : undefined
  const stream = isRecord(data?.stream) ? data.stream : undefined
  if (stream?.kind !== 'content') return undefined
  const delta = typeof stream.delta === 'string' ? stream.delta : ''
  if (!delta) return undefined
  const accumulated = typeof stream.accumulated === 'string' ? stream.accumulated : delta
  return {
    type: 'assistant_progress',
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
  return thread.messages.find(isTranscriptAssistantMessageForId(messageId))
}

export function assistantMessageForRun(thread: AgentThread | undefined, run: AgentRun): AgentMessage | undefined {
  if (!thread) return undefined
  if (run.assistantMessageId) {
    const message = thread.messages.find(isTranscriptAssistantMessageForId(run.assistantMessageId))
    if (message) return message
  }
  return [...thread.messages].reverse().find((message) => isTranscriptAssistantMessage(message) && message.runId === run.id)
}

function isTranscriptAssistantMessageForId(messageId: string): (message: AgentMessage) => boolean {
  return (message) => message.id === messageId && isTranscriptAssistantMessage(message)
}

function isTranscriptAssistantMessage(message: AgentMessage): boolean {
  return isAgentTranscriptAssistantMessage(message)
}

export function toStreamRun(run: AgentRun): AgentInternalRunSignalRun {
  return {
    id: run.id,
    sessionId: run.sessionId,
    threadId: run.threadId,
    status: run.status,
    ...(run.role ? { role: run.role } : {}),
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    ...(run.taskGraphId ? { taskGraphId: run.taskGraphId } : {}),
    ...(run.taskId ? { taskId: run.taskId } : {}),
    ...(typeof run.progress === 'number' ? { progress: run.progress } : {}),
    ...(run.blockedReason ? { blockedReason: run.blockedReason } : {}),
    agentManifest: run.agentManifest,
    runtimeLimits: run.runtimeLimits,
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

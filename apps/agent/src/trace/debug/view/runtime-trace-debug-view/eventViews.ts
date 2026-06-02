import type { AgentRun, AgentTraceEvent } from '../../../../state/shared/types.js'
import {
  localizedTraceTitle,
  previewJSON,
  previewText,
  traceBehavior,
  traceEventStatusLabel,
  traceImpact,
  traceKindLabel,
} from './labels.js'
import { contextRefsFromData } from './refs.js'
import type {
  AgentDebugAttentionEvent,
  AgentMessageWriteView,
  AgentPendingActionView,
  AgentToolCallView,
} from './types.js'
import { numberValue, recordValue, stringValue } from './values.js'

export function buildMessageWrites(events: AgentTraceEvent[]): AgentMessageWriteView[] {
  return events.map((event) => messageWriteFromEvent(event)).filter((item): item is AgentMessageWriteView => !!item)
}

export function messageWriteFromEvent(event: AgentTraceEvent): AgentMessageWriteView | undefined {
  if (event.kind !== 'assistant' && event.kind !== 'message') return undefined
  const data = recordValue(event.data)
  const messageId = stringValue(data?.messageId)
  const source = stringValue(data?.source) ?? (event.kind === 'assistant' ? 'assistant' : undefined)
  const content = stringValue(data?.content) ?? stringValue(data?.message) ?? stringValue(data?.assistantMessage)
  const contentChars = numberValue(data?.contentChars) ?? content?.length ?? 0
  const contentHash = stringValue(data?.contentHash)
  if (!messageId && !content && event.title !== 'Assistant message created') return undefined
  return {
    eventId: event.id,
    ...(messageId ? { messageId } : {}),
    ...(source ? { source, sourceLabel: source } : {}),
    contentChars,
    ...(content ? { contentPreview: previewText(content) } : event.summary ? { contentPreview: previewText(event.summary) } : {}),
    ...(contentHash ? { contentHash } : {}),
    refs: [
      ...(contentHash ? [{ kind: 'content_hash' as const, label: 'assistant content hash', hash: contentHash }] : []),
    ],
  }
}

export function buildToolCalls(events: AgentTraceEvent[]): AgentToolCallView[] {
  return events.flatMap((event): AgentToolCallView[] => {
    if (event.kind !== 'tool_call') return []
    const data = recordValue(event.data)
    const resultHash = stringValue(data?.resultHash)
    const resultChars = numberValue(data?.resultChars)
    return [{
      eventId: event.id,
      ...(event.toolName ? { toolName: event.toolName } : {}),
      title: event.title,
      status: event.status,
      statusLabel: traceEventStatusLabel(event.status),
      ...(stringValue(data?.source) ? { source: stringValue(data?.source) } : {}),
      ...(typeof data?.sandboxed === 'boolean' ? { sandboxed: data.sandboxed } : {}),
      ...(numberValue(data?.durationMs) !== undefined ? { durationMs: numberValue(data?.durationMs) } : event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      ...(event.summary ? { summary: event.summary } : {}),
      ...(data && Object.prototype.hasOwnProperty.call(data, 'args') ? { argsPreview: previewJSON(data.args) } : {}),
      ...(data?.result !== undefined ? { dataPreview: previewJSON(data.result) } : {}),
      ...(resultHash ? { resultHash } : {}),
      ...(resultChars !== undefined ? { resultChars } : {}),
      refs: [
        ...contextRefsFromData(data),
        ...(resultHash ? [{ kind: 'result_hash' as const, label: 'tool result hash', hash: resultHash }] : []),
      ],
    }]
  })
}

export function buildAttentionEvents(events: AgentTraceEvent[]): AgentDebugAttentionEvent[] {
  return events
    .filter((event) => event.status === 'failed' || event.status === 'blocked' || event.kind === 'error' || event.kind === 'approval' || event.kind === 'input')
    .map((event) => {
      const data = recordValue(event.data)
      return {
        eventId: event.id,
        createdAt: event.createdAt,
        kind: event.kind,
        kindLabel: traceKindLabel(event.kind),
        status: event.status,
        statusLabel: traceEventStatusLabel(event.status),
        title: localizedTraceTitle(event),
        ...(event.summary ? { summary: event.summary } : {}),
        ...(traceBehavior(event) ? { behavior: traceBehavior(event) } : {}),
        ...(traceImpact(event) ? { impact: traceImpact(event) } : {}),
        ...(stringValue(data?.error) ? { error: stringValue(data?.error) } : {}),
      }
    })
}

export function buildPendingActions(run: AgentRun): AgentPendingActionView[] {
  if (run.status !== 'requires_action') return []
  const approvals: AgentPendingActionView[] = (run.pendingApprovals ?? [])
    .filter((approval) => approval.status === 'pending')
    .map((approval) => ({
      type: 'approval' as const,
      id: approval.id,
      createdAt: approval.createdAt,
      toolName: approval.toolName,
      status: approval.status,
      ...(approval.reason ? { reason: approval.reason } : {}),
      ...(approval.risk ? { risk: approval.risk } : {}),
      ...(approval.permission ? { permission: approval.permission } : {}),
    }))
  const inputs: AgentPendingActionView[] = (run.pendingInputRequests ?? [])
    .filter((request) => request.status === 'pending')
    .map((request) => ({
      type: 'input' as const,
      id: request.id,
      createdAt: request.createdAt,
      title: request.title,
      question: request.question,
      inputType: request.inputType,
      choices: request.choices,
      allowCustomAnswer: request.allowCustomAnswer,
      status: request.status,
    }))
  return [...approvals, ...inputs]
}

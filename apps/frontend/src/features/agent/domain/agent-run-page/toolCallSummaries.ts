import { agentTraceView, traceEventDurationMs, traceEventStatusLabel } from '@/features/agent/domain/agentRunUi'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { isRecord } from '@/shared/domain/jsonValue'
import type { AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'

export interface AgentToolCallSummary {
  eventId: string
  toolName?: string
  title: string
  status: AgentTraceEvent['status']
  statusLabel: string
  source?: string
  sandboxed?: boolean
  durationMs?: number
  summary?: string
  argsPreview?: string
  dataPreview?: string
}

export function fallbackToolCallSummaries(events: AgentTraceEvent[]): AgentToolCallSummary[] {
  return events.flatMap((event): AgentToolCallSummary[] => {
    if (event.kind !== 'tool_call') return []
    const view = agentTraceView(event)
    const detail = view.toolDetail
    const data = isRecord(event.data) ? event.data : undefined
    const durationMs = traceEventDurationMs(event, data)
    return [{
      eventId: event.id,
      ...(event.toolName ? { toolName: event.toolName } : {}),
      title: view.title,
      status: event.status,
      statusLabel: traceEventStatusLabel(event.status),
      ...(detail?.source ? { source: detail.source } : typeof data?.source === 'string' ? { source: data.source } : {}),
      ...(detail?.sandboxed ? { sandboxed: detail.sandboxed === '是' } : typeof data?.sandboxed === 'boolean' ? { sandboxed: data.sandboxed } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(view.summary ? { summary: view.summary } : {}),
      ...(detail?.args !== undefined ? { argsPreview: formatAgentTraceRawJSON(detail.args) } : {}),
      ...(data?.result !== undefined ? { dataPreview: formatAgentTraceRawJSON(data.result) } : {}),
    }]
  })
}

export function toolCallSummariesFromUnknown(value: unknown): AgentToolCallSummary[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item): AgentToolCallSummary[] => {
    if (!isRecord(item)) return []
    const eventId = typeof item.eventId === 'string' ? item.eventId : ''
    const title = typeof item.title === 'string' ? item.title : ''
    const status = isTraceEventStatus(item.status) ? item.status : undefined
    const statusLabel = typeof item.statusLabel === 'string' ? item.statusLabel : undefined
    if (!eventId || !title || !status || !statusLabel) return []
    return [{
      eventId,
      ...(typeof item.toolName === 'string' ? { toolName: item.toolName } : {}),
      title,
      status,
      statusLabel,
      ...(typeof item.source === 'string' ? { source: item.source } : {}),
      ...(typeof item.sandboxed === 'boolean' ? { sandboxed: item.sandboxed } : {}),
      ...(typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) ? { durationMs: item.durationMs } : {}),
      ...(typeof item.summary === 'string' ? { summary: item.summary } : {}),
      ...(typeof item.argsPreview === 'string' ? { argsPreview: item.argsPreview } : {}),
      ...(typeof item.dataPreview === 'string' ? { dataPreview: item.dataPreview } : {}),
    }]
  })
}

function isTraceEventStatus(value: unknown): value is AgentTraceEvent['status'] {
  return value === 'started' || value === 'completed' || value === 'blocked' || value === 'failed' || value === 'info'
}

export function toolCallSearchText(toolCall: AgentToolCallSummary): string {
  return [
    toolCall.eventId,
    toolCall.toolName,
    toolCall.title,
    toolCall.status,
    toolCall.statusLabel,
    toolCall.source,
    toolCall.sandboxed === undefined ? undefined : toolCall.sandboxed ? '沙箱 sandboxed yes true' : '非沙箱 sandboxed no false',
    toolCall.durationMs === undefined ? undefined : `${toolCall.durationMs}ms`,
    toolCall.summary,
    toolCall.argsPreview,
    toolCall.dataPreview,
    toolCall.toolName ? agentToolNameLabel(toolCall.toolName) : undefined,
  ].map(searchTextToken).filter((value): value is string => !!value).join(' ').toLowerCase()
}

export function searchTextToken(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value).trim()
  if (!text) return undefined
  return text.length > 2000 ? text.slice(0, 2000) : text
}

export function formatAgentTraceRawJSON(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

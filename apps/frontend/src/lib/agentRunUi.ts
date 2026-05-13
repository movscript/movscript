import type { AgentRun, AgentTraceEvent } from './localAgentClient'

export function traceEventIdFromHash(hash: string | undefined): string | undefined {
  if (!hash?.startsWith('#event-')) return undefined
  const eventId = decodeURIComponent(hash.replace(/^#event-/, ''))
  return eventId || undefined
}

export function traceDeepLinkMissing(input: {
  eventId?: string
  events: AgentTraceEvent[]
  hasMore: boolean
}): boolean {
  return !!input.eventId
    && input.events.length > 0
    && !input.hasMore
    && !input.events.some((event) => event.id === input.eventId)
}

export function buildTraceEventLink(input: {
  origin: string
  pathname: string
  search?: string
  eventId: string
}): string {
  return `${input.origin}${input.pathname}${input.search ?? ''}#event-${encodeURIComponent(input.eventId)}`
}

export function canCancelWorkerRun(run: Pick<AgentRun, 'role' | 'status'> | undefined): boolean {
  return run?.role === 'worker' && !isTerminalRunStatus(run.status)
}

function isTerminalRunStatus(status: AgentRun['status']): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled'
}

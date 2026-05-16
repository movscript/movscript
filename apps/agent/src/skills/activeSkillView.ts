import { isRecord } from '../jsonValue.js'
import type { AgentTraceEvent } from '../state/types.js'

export function activeSkillIdsFromRun(input: { traceEvents?: AgentTraceEvent[] }): string[] {
  const event = [...(input.traceEvents ?? [])].reverse().find(isRuntimeContextEvent)
  const data = isRecord(event?.data) ? event.data : undefined
  const raw = Array.isArray(data?.skills) ? data.skills : []
  return raw.flatMap((item) => isRecord(item) && typeof item.id === 'string' ? [item.id] : [])
}

function isRuntimeContextEvent(event: AgentTraceEvent | undefined): boolean {
  return event?.title === 'Runtime context resolved'
    || event?.title === 'Runtime context resolved from fallback'
}

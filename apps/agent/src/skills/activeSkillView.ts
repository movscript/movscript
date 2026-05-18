import { isRecord } from '../jsonValue.js'
import type { AgentTraceEvent } from '../state/types.js'

export function activeSkillIdsFromRun(input: { traceEvents?: AgentTraceEvent[]; metadata?: Record<string, unknown> }): string[] {
  const event = [...(input.traceEvents ?? [])].reverse().find(isRuntimeContextEvent)
  const data = isRecord(event?.data) ? event.data : undefined
  const raw = Array.isArray(data?.skills) ? data.skills : []
  const fromTrace = raw.flatMap((item) => isRecord(item) && typeof item.id === 'string' ? [item.id] : [])
  if (fromTrace.length > 0) return fromTrace
  const metadataIds = Array.isArray(input.metadata?.activeSkillIds)
    ? input.metadata.activeSkillIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const skillState = isRecord(input.metadata?.skillState) ? input.metadata.skillState : undefined
  const loadedIds = Array.isArray(skillState?.loadedSkillIds)
    ? skillState.loadedSkillIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const unloadedIds = new Set(Array.isArray(skillState?.unloadedSkillIds)
    ? skillState.unloadedSkillIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [])
  return Array.from(new Set([...metadataIds, ...loadedIds].filter((id) => !unloadedIds.has(id))))
}

function isRuntimeContextEvent(event: AgentTraceEvent | undefined): boolean {
  return event?.title === 'Runtime context resolved'
    || event?.title === 'Runtime context resolved from fallback'
}

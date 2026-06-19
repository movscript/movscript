import type { AgentTimelineItem } from '@movscript/core/agent/protocol'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export function timelineActivityByMessageId(timelineItems: AgentTimelineItem[]): Map<string, ChatRunActivity> {
  const byMessageId = new Map<string, ChatRunActivity>()
  for (const item of timelineItems) {
    if (item.activity) byMessageId.set(item.id, item.activity)
  }
  return byMessageId
}

export function timelineActivitiesFromItems(timelineItems: AgentTimelineItem[]): ChatRunActivity[] {
  return timelineItems.flatMap((item) => item.activity ? [item.activity] : [])
}

export function runIdsWithTimelineActivityItems(timelineItems: AgentTimelineItem[]): Set<string> {
  const runIds = new Set<string>()
  for (const item of timelineItems) {
    const runId = normalizeRunId(item.activity?.runId)
    if (runId) runIds.add(runId)
  }
  return runIds
}

export function timelineItemsContainRunActivity(timelineItems: AgentTimelineItem[], runId: string): boolean {
  const normalizedRunId = normalizeRunId(runId)
  if (!normalizedRunId) return false
  return timelineItems.some((item) => normalizeRunId(item.activity?.runId) === normalizedRunId)
}

export function filterActivityEventsForRun(events: ChatRunActivityEvent[], runId: string | undefined): ChatRunActivityEvent[] {
  const normalizedRunId = normalizeRunId(runId)
  if (!normalizedRunId) return events.filter((event) => !activityEventRunId(event))
  return events.filter((event) => {
    const eventRunId = activityEventRunId(event)
    return !eventRunId || eventRunId === normalizedRunId
  })
}

function activityEventRunId(event: ChatRunActivityEvent): string | undefined {
  return normalizeRunId(event.runId)
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

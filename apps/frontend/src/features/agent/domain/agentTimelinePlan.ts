import type { AgentPlan, AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'

export function latestPlanFromTimelineItems(items: AgentTimelineItem[]): AgentPlan | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!item || !isPlanStatusTimelineItem(item)) continue
    const plan = item.meta?.planRevision?.snapshot
    if (plan) return plan
  }
  return undefined
}

function isPlanStatusTimelineItem(item: AgentTimelineItem): boolean {
  return item.origin === 'system_runtime'
    && item.purpose === 'status'
    && item.surface === 'status_strip'
    && item.contentPromptEligibility === 'exclude'
    && !!item.meta?.planRevision
}

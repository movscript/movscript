import type {
  AgentActivityDecisionItem,
  AgentActivityItem,
  AgentActivityRound,
} from './types'
import type { AgentRunActivityRoundIndex as ConversationRunActivityRoundIndex, AgentRunActivityRound as ConversationRunActivityRound } from '@/features/agent/domain/agentConversation'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'
import type { RunActivityRoundSnapshot } from '@/features/agent/domain/agentRunActivitySnapshot'
import { timestamp } from './values'
import {
  activityRoundLabel,
  modelRoundContentPreview,
  visibleActivityRoundLabel,
} from './roundLabels'
import {
  coalesceConsecutiveActivityItems,
  compareActivityItems,
  type ActivityItemIndex,
} from './activityItemIndex'

export function filterHiddenActionItems(rounds: AgentActivityRound[], hiddenActionItemIds: Set<string> | undefined): AgentActivityRound[] {
  if (!hiddenActionItemIds || hiddenActionItemIds.size === 0) return rounds
  return rounds
    .map((round) => activityRoundAfterHiddenActionItems(round, hiddenActionItemIds))
    .filter(roundHasRenderableActivity)
}

function activityRoundAfterHiddenActionItems(round: AgentActivityRound, hiddenActionItemIds: Set<string>): AgentActivityRound {
  const items = round.items.filter((item) => !hiddenActionItemIds.has(item.id))
  if (items.length === round.items.length) return round
  const status = visibleActivityRoundStatus(round, items)
  return {
    ...round,
    status,
    label: status === round.status ? round.label : visibleActivityRoundLabel(round, status),
    items,
  }
}

function visibleActivityRoundStatus(round: AgentActivityRound, items: AgentActivityItem[]): AgentActivityRound['status'] {
  if (round.status === 'failed') return 'failed'
  if (items.some(isToolCallRoundActivityItem)) return 'tool_calls'
  if (items.some(isFailedProviderSessionLineItem)) return 'failed'
  if (items.some(isTerminalProviderSessionLineItem)) return 'final'
  if (round.status === 'final' || round.durationMs !== undefined || round.usage) return 'final'
  return 'thinking'
}

export function buildRoundIndexActivityRounds(
  activity: ChatRunActivity,
  runActivityRoundIndex: ConversationRunActivityRoundIndex,
  modelRounds: RunActivityRoundSnapshot[],
  index: ActivityItemIndex,
): AgentActivityRound[] {
  const telemetryByIndex = new Map(modelRounds.map((round) => [round.index, round]))
  return runActivityRoundIndex.rounds
    .map((round, position) => {
      const telemetry = round.index !== undefined ? telemetryByIndex.get(round.index) : undefined
      const consumedActionItemIds = new Set<string>()
      const toolExecutionItems = round.toolExecutions.flatMap((tool) => {
        const items: AgentActivityItem[] = []
        for (const approval of tool.approvals) {
          const actionItem = index.actionItemsById.get(`approval-${approval.id}`)
          if (!actionItem) continue
          consumedActionItemIds.add(actionItem.id)
          items.push(actionItem)
        }
        const toolItem = index.toolsById.get(tool.id)
        if (toolItem) items.push(toolItem)
        return items.sort(compareActivityItems)
      })
      const decisionItems = round.decisions
          .map((decision) => index.decisionsById.get(decision.id))
          .filter((item): item is AgentActivityDecisionItem => Boolean(item))
          .sort(compareActivityItems)
      const remainingItems = [
        ...index.actionItems
          .filter((item) => !consumedActionItemIds.has(item.id))
          .filter((item) => systemActivityRoundId(item, runActivityRoundIndex.rounds) === round.id),
      ].sort(compareActivityItems)
      const structuredItems = [...decisionItems, ...toolExecutionItems]
      const firstStructuredItemTime = Math.min(...structuredItems.map((item) => timestamp(item.createdAt)))
      const systemItems = index.systemItems
        .filter((item) => systemActivityRoundId(item, runActivityRoundIndex.rounds) === round.id)
        .sort(compareActivityItems)
      const leadingSystemItems = Number.isFinite(firstStructuredItemTime)
        ? systemItems.filter((item) => timestamp(item.createdAt) <= firstStructuredItemTime)
        : systemItems
      const trailingSystemItems = Number.isFinite(firstStructuredItemTime)
        ? systemItems.filter((item) => timestamp(item.createdAt) > firstStructuredItemTime)
        : []
      const items = coalesceConsecutiveActivityItems([
        ...leadingSystemItems,
        ...structuredItems,
        ...remainingItems,
        ...trailingSystemItems,
      ])
      const status = activityRoundStatus(round, items)
      return {
        id: round.id,
        ...(round.index !== undefined ? { index: round.index } : {}),
        ...(round.source ? { source: round.source } : {}),
        label: activityRoundLabel(round, position, status, telemetry, modelRoundContentPreview(activity, round.index)),
        status,
        items,
        ...(telemetry?.durationMs !== undefined ? { durationMs: telemetry.durationMs } : {}),
        ...(telemetry?.usage ? { usage: telemetry.usage } : {}),
      }
    })
    .filter(roundHasRenderableActivity)
}

function roundHasRenderableActivity(round: AgentActivityRound): boolean {
  return round.items.length > 0
    || round.status === 'failed'
    || round.durationMs !== undefined
    || !!round.usage
}

function systemActivityRoundId(
  item: { createdAt: string; roundIndex?: number },
  rounds: ConversationRunActivityRoundIndex['rounds'],
): string {
  const key = activityRoundKeyForItem(item, rounds)
  if (key !== 'round-unknown') return key
  return rounds[0]?.id ?? key
}

function activityRoundKeyForItem(
  item: { createdAt: string; roundIndex?: number },
  rounds: Array<Pick<AgentActivityRound, 'id' | 'index'> & { startedAt?: string }>,
): string {
  if (item.roundIndex !== undefined) return `round-${item.roundIndex}`
  const itemTime = timestamp(item.createdAt)
  const explicitRounds = rounds
    .filter((round) => round.index !== undefined)
    .sort(compareActivityRoundsByStart)
  const candidates = explicitRounds.length > 0 ? explicitRounds : [...rounds].sort(compareActivityRoundsByStart)
  const round = [...candidates].reverse().find((candidate) => timestamp(candidate.startedAt) <= itemTime)
  return round?.id ?? 'round-unknown'
}

function compareActivityRoundsByStart(
  left: Pick<AgentActivityRound, 'id' | 'index'> & { startedAt?: string },
  right: Pick<AgentActivityRound, 'id' | 'index'> & { startedAt?: string },
): number {
  if (left.index !== undefined && right.index !== undefined && left.index !== right.index) {
    return left.index - right.index
  }
  return timestamp(left.startedAt) - timestamp(right.startedAt)
    || left.id.localeCompare(right.id)
}

function activityRoundStatus(round: ConversationRunActivityRound, items: AgentActivityItem[]): AgentActivityRound['status'] {
  if (round.failed) return 'failed'
  if (items.some(isToolCallRoundActivityItem)) return 'tool_calls'
  if (items.some(isFailedProviderSessionLineItem)) return 'failed'
  if (items.some(isTerminalProviderSessionLineItem)) return 'final'
  return round.finished ? 'final' : 'thinking'
}

function isToolCallRoundActivityItem(item: AgentActivityItem): boolean {
  if (item.type === 'decision' || item.type === 'input_request' || item.type === 'approval_request') return true
  if (item.type === 'block') return true
  if (item.type === 'line') return item.kind !== 'system' && item.kind !== 'error'
  return false
}

function isTerminalProviderSessionLineItem(item: AgentActivityItem): boolean {
  return item.type === 'line'
    && item.kind === 'system'
    && (item.text.startsWith('运行完成') || item.text.startsWith('运行已取消') || item.text.startsWith('运行状态已记录'))
}

function isFailedProviderSessionLineItem(item: AgentActivityItem): boolean {
  return item.type === 'line'
    && item.kind === 'error'
    && item.text.startsWith('运行失败')
}

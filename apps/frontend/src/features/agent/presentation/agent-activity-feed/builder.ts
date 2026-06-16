import {
  buildRunActivitySnapshot,
  modelEventDurationMs,
  type RunActivityRoundSnapshot,
} from '@/features/agent/domain/agentRunActivitySnapshot'
import {
  buildAgentRunActivityRoundIndex as buildConversationRunActivityRoundIndex,
  type AgentRunActivityRoundIndex as ConversationRunActivityRoundIndex,
  type AgentRunActivityRound as ConversationRunActivityRound,
} from '@/features/agent/domain/agentConversation'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type {
  AgentActivityDecisionItem,
  AgentActivityFeed,
  AgentActivityInputRequestItem,
  AgentActivityApprovalRequestItem,
  AgentActivityItem,
  AgentActivityLineItem,
  AgentActivityRound,
} from './types'
import { sumNumbers } from './format'
import { modelDecisionItems } from './decisionItems'
import { toolActivityItem, toolActivityRecords } from './toolItems'
import { compactLines, recordValue, stringValue, timestamp } from './values'
import {
  activityRoundLabel,
  formatModelEventUsage,
  latestStatusText,
  modelRoundContentPreview,
  visibleActivityRoundLabel,
} from './roundLabels'

export function buildAgentActivityFeed(input: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  hiddenActionItemIds?: Set<string>
}): AgentActivityFeed | undefined {
  const snapshot = buildRunActivitySnapshot(input)
  if (!snapshot) return undefined
  const { activity } = snapshot
  const runActivityRoundIndex = buildConversationRunActivityRoundIndex(activity)

  const itemIndex = buildActivityItemIndex(activity)
  const rounds = filterHiddenActionItems(
    buildRoundIndexActivityRounds(activity, runActivityRoundIndex, snapshot.rounds, itemIndex),
    input.hiddenActionItemIds,
  )
  const items = rounds.flatMap((round) => round.items)

  return {
    runId: activity.runId,
    status: activity.status,
    ...(latestStatusText(activity) ? { statusText: latestStatusText(activity) } : {}),
    rounds,
    items,
    totals: snapshot.totals,
    activity,
  }
}

function filterHiddenActionItems(rounds: AgentActivityRound[], hiddenActionItemIds: Set<string> | undefined): AgentActivityRound[] {
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

interface ActivityItemIndex {
  actionItems: Array<AgentActivityInputRequestItem | AgentActivityApprovalRequestItem>
  actionItemsById: Map<string, AgentActivityInputRequestItem | AgentActivityApprovalRequestItem>
  decisionsById: Map<string, AgentActivityDecisionItem>
  systemItems: AgentActivityLineItem[]
  toolsById: Map<string, AgentActivityItem>
}

function buildActivityItemIndex(activity: ChatRunActivity): ActivityItemIndex {
  const actionItems = runInteractionActionItems(activity)
  return {
    actionItems,
    actionItemsById: new Map(actionItems.map((item) => [item.id, item])),
    decisionsById: new Map(modelDecisionItems(activity).map((item) => [item.id, item])),
    systemItems: [
      ...systemActivityItems(activity),
      ...modelHttpActivityItems(activity),
    ].sort(compareActivityItems),
    toolsById: new Map(toolActivityRecords(activity).map((record) => [record.id, toolActivityItem(record)])),
  }
}

function coalesceConsecutiveActivityItems(items: AgentActivityItem[]): AgentActivityItem[] {
  const result: AgentActivityItem[] = []
  for (const item of items) {
    const previous = result.at(-1)
    if (!previous || !canCoalesceActivityItems(previous, item)) {
      result.push(item)
      continue
    }
    result[result.length - 1] = mergeRepeatedActivityItems(previous, item)
  }
  return result
}

function canCoalesceActivityItems(left: AgentActivityItem, right: AgentActivityItem): boolean {
  const leftKey = repeatableActivityKey(left)
  if (!leftKey) return false
  return leftKey === repeatableActivityKey(right)
}

function repeatableActivityKey(item: AgentActivityItem): string | undefined {
  if (item.type !== 'block') return undefined
  if (item.toolName !== 'core_work_wait' && item.toolName !== 'core_work_get') return undefined
  const workLine = item.lines.find((line) => line.startsWith('任务：')) ?? ''
  return [
    item.type,
    item.toolName,
    item.kind,
    item.title.replace(/\s+×\d+$/, ''),
    item.roundIndex ?? '',
    workLine,
  ].join('\u0000')
}

function mergeRepeatedActivityItems(left: AgentActivityItem, right: AgentActivityItem): AgentActivityItem {
  if (left.type !== 'block' || right.type !== 'block') return left
  const repeatCount = activityRepeatCount(left) + activityRepeatCount(right)
  return {
    ...left,
    id: `${left.id}:repeat-${repeatCount}`,
    title: `${left.title.replace(/\s+×\d+$/, '')} ×${repeatCount}`,
    lines: right.lines,
    status: right.status,
    durationMs: sumNumbers(left.durationMs, right.durationMs),
    detail: right.detail ?? left.detail,
    code: right.code ?? left.code,
  }
}

function activityRepeatCount(item: AgentActivityItem): number {
  if (item.type !== 'block') return 1
  const match = item.title.match(/\s+×(\d+)$/)
  return match ? Number(match[1]) || 1 : 1
}

function buildRoundIndexActivityRounds(
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

function runInteractionActionItems(activity: ChatRunActivity): Array<AgentActivityInputRequestItem | AgentActivityApprovalRequestItem> {
  return [
    ...(activity.inputs ?? [])
      .filter((request) => request.status === 'pending' || request.status === 'answered' || request.status === 'cancelled')
      .map((request) => ({
        id: 'input-' + request.id,
        type: 'input_request' as const,
        kind: 'system' as const,
        request,
        status: request.status,
        createdAt: request.createdAt,
      })),
    ...(activity.approvals ?? [])
      .filter((approval) => approval.status === 'pending' || approval.status === 'approved' || approval.status === 'rejected')
      .map((approval) => ({
        id: 'approval-' + approval.id,
        type: 'approval_request' as const,
        kind: 'system' as const,
        approval,
        status: approval.status,
        createdAt: approval.createdAt,
      })),
  ].sort(compareActivityItems)
}

function systemActivityItems(activity: ChatRunActivity): AgentActivityLineItem[] {
  return activity.events.flatMap((event) => {
    if (event.kind !== 'run') return []
    const text = runLifecycleEventText(event)
    if (!text) return []
    const data = recordValue(event.data)
    return [{
      id: `event-${event.id}`,
      type: 'line',
      kind: event.status === 'failed' || text.startsWith('运行失败') ? 'error' : 'system',
      text,
      ...(data ? { detail: { result: data } } : {}),
      status: event.status,
      createdAt: event.createdAt,
      ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
      ...(event.roundLabel ? { roundLabel: event.roundLabel } : {}),
    }]
  })
}

function modelHttpActivityItems(activity: ChatRunActivity): AgentActivityLineItem[] {
  return activity.events.flatMap((event) => {
    if (event.kind !== 'model_call') return []
    const text = modelHttpActivityText(event)
    if (!text) return []
    return [{
      id: `model-http-${event.id}`,
      type: 'line',
      kind: event.status === 'failed' ? 'error' : 'system',
      text,
      status: event.status,
      createdAt: event.createdAt,
      ...(modelEventDurationMs(event) !== undefined ? { durationMs: modelEventDurationMs(event) } : {}),
      ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
      ...(event.roundLabel ? { roundLabel: event.roundLabel } : {}),
    }]
  })
}

function modelHttpActivityText(event: ChatRunActivityEvent): string | undefined {
  if (event.title === 'Model HTTP request sent') return '模型 HTTP 请求已发送'
  if (event.title === 'Model HTTP response received') {
    return compactLines([
      `模型 HTTP 响应：${event.summary ?? '已完成'}`,
      formatModelEventUsage(event),
    ]).join('；')
  }
  if (event.title === 'Model HTTP call failed') {
    return `模型 HTTP 失败${event.summary ? `：${event.summary}` : ''}`
  }
  if (event.title === 'Model retry scheduled' || event.title === 'Model HTTP retry scheduled') {
    return `模型 HTTP 重试${event.summary ? `：${event.summary}` : ''}`
  }
  return undefined
}

function runLifecycleEventText(event: ChatRunActivityEvent): string | undefined {
  const data = recordValue(event.data)
  const eventType = stringValue(data?.eventType)
  if (eventType === 'runtime.recovery.interrupted') {
    return '运行中断：runtime session 重启时这个 run 尚未结束，已暂停等待继续或取消。'
  }
  if (eventType === 'runtime.recovery.resumed') {
    return '恢复继续：沿用同一个 run 重新调度，之前已完成的步骤保留为历史。'
  }
  if (eventType === 'runtime.recovery.queued_rescheduled') {
    return '运行恢复：启动时发现已排队的 run，已重新调度。'
  }
  if (event.title === 'Run cancelled') {
    const reason = event.summary ?? stringValue(data?.reason)
    if (reason === ['Run', 'time recovery cancelled by user.'].join('')) {
      return '恢复已取消：保留中断前的执行记录，后续可以从新消息开始。'
    }
    return reason ? `运行已取消：${reason}` : '运行已取消。'
  }
  if (event.title === 'Run started') {
    return event.summary ? `运行开始：${event.summary}` : '运行开始：agent 进入执行循环。'
  }
  if (event.title === 'Run finished') {
    return event.summary ? `运行完成：${event.summary}` : '运行完成。'
  }
  if (event.title === 'Run failed') {
    return event.summary ? `运行失败：${event.summary}` : '运行失败。'
  }
  if (event.title === 'Timeline status recorded') {
    return event.summary ? `运行状态已记录：${event.summary}` : '运行状态已记录。'
  }
  if (event.title === 'Command handled locally') {
    return event.summary ? `本地命令已处理：${event.summary}` : '本地命令已处理。'
  }
  if (event.title === 'Run context built') {
    return event.summary ? `运行上下文已构建：${event.summary}` : '运行上下文已构建。'
  }
  return undefined
}

function compareActivityItems(left: AgentActivityItem, right: AgentActivityItem): number {
  return timestamp(left.createdAt) - timestamp(right.createdAt)
    || activityItemOrder(left) - activityItemOrder(right)
    || left.id.localeCompare(right.id)
}

function activityItemOrder(item: AgentActivityItem): number {
  if (item.type === 'decision') return 0
  if (item.type === 'input_request' || item.type === 'approval_request') return 1
  if (item.type === 'line' && item.kind === 'system') return 2
  return 3
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

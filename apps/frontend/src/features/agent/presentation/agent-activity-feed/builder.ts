import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import {
  buildRunActivitySnapshot,
  modelEventDurationMs,
  modelEventUsage,
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
import { formatDuration, formatTokenUsage, sumNumbers } from './format'
import { modelDecisionItems } from './decisionItems'
import { toolActivityItem, toolActivityRecords } from './toolItems'
import { compactLines, recordValue, stringValue, timestamp } from './values'

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

function visibleActivityRoundLabel(round: AgentActivityRound, status: AgentActivityRound['status']): string {
  const telemetry = {
    ...(round.durationMs !== undefined ? { durationMs: round.durationMs } : {}),
    ...(round.usage ? { usage: round.usage } : {}),
  }
  if (round.source === 'final' || round.index === 999) {
    const details = compactLines([
      round.durationMs !== undefined ? formatDuration(round.durationMs) : undefined,
      round.usage ? formatTokenUsage(round.usage) : undefined,
    ]).join(' · ')
    const suffix = details ? `（${details}）` : ''
    if (status === 'failed') return `最终回复：记录失败${suffix}`
    return `最终回复：形成回复${suffix}`
  }
  const providerSessionSource = providerSessionRoundSource(round)
  if (providerSessionSource) {
    return providerSessionRoundLabel(round.label, providerSessionSource, status, telemetry)
  }
  if (round.index !== undefined) return roundLabel(round.index, status, telemetry)
  if (status === 'tool_calls') return '运行片段：调用工具'
  if (status === 'final') return '运行片段：形成回复'
  if (status === 'failed') return '运行片段：请求失败'
  return '运行片段：运行中'
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

function formatModelEventUsage(event: ChatRunActivityEvent): string | undefined {
  const usage = modelEventUsage(event)
  return usage ? formatTokenUsage(usage) : undefined
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

function activityRoundLabel(
  round: ConversationRunActivityRound,
  position: number,
  status: AgentActivityRound['status'],
  telemetry?: RunActivityRoundSnapshot,
  contentPreview?: string,
): string {
  if (round.source === 'final' || round.label === 'Final response' || round.index === 999) {
    const details = compactLines([
      telemetry?.durationMs !== undefined ? formatDuration(telemetry.durationMs) : undefined,
      telemetry?.usage ? formatTokenUsage(telemetry.usage) : undefined,
    ]).join(' · ')
    const suffix = details ? `（${details}）` : ''
    if (status === 'failed') return `最终回复：记录失败${suffix}`
    return `最终回复：形成回复${suffix}`
  }
  const providerSessionSource = providerSessionRoundSource(round)
  if (providerSessionSource) {
    return providerSessionRoundLabel(round.label, providerSessionSource, status, telemetry)
  }
  if (round.index !== undefined) return roundLabel(round.index, status, telemetry, contentPreview)
  const prefix = `运行片段 ${position + 1}`
  if (status === 'tool_calls') return `${prefix}：调用工具`
  if (status === 'final') return `${prefix}：形成回复`
  if (status === 'failed') return `${prefix}：请求失败`
  return `${prefix}：运行中`
}

function roundLabel(index: number, status: AgentActivityRound['status'], telemetry?: Pick<RunActivityRoundSnapshot, 'durationMs' | 'usage'>, contentPreview?: string) {
  const prefix = `第 ${index} 轮思考`
  const details = compactLines([
    telemetry?.durationMs !== undefined ? formatDuration(telemetry.durationMs) : undefined,
    telemetry?.usage ? formatTokenUsage(telemetry.usage) : undefined,
  ]).join(' · ')
  const suffix = details ? `（${details}）` : ''
  if (contentPreview) return `${prefix}：${contentPreview}${suffix}`
  if (status === 'tool_calls') return `${prefix}：决定调用工具${suffix}`
  if (status === 'final') return `${prefix}：形成回复${suffix}`
  if (status === 'failed') return `${prefix}：请求失败${suffix}`
  return `${prefix}：请求模型中${suffix}`
}

type ProviderSessionActivityRoundSource = Extract<NonNullable<ConversationRunActivityRound['source']>, 'setup' | 'runtime_rule'>

function providerSessionRoundSource(round: { label?: string; source?: ConversationRunActivityRound['source'] }): ProviderSessionActivityRoundSource | undefined {
  if (round.source === 'setup') return 'setup'
  if (round.source !== 'runtime_rule') return undefined
  return round.label !== undefined && !/^Model turn\b/i.test(round.label) ? 'runtime_rule' : undefined
}

function providerSessionRoundLabel(
  label: string | undefined,
  source: ProviderSessionActivityRoundSource,
  status: AgentActivityRound['status'],
  telemetry?: Pick<RunActivityRoundSnapshot, 'durationMs' | 'usage'>,
): string {
  const base = label === 'Setup'
    ? '运行准备'
    : label === ['Run', 'time command'].join('')
      ? 'Runtime 会话命令'
      : label?.trim() || (source === 'setup' ? '运行准备' : 'runtime session 规则')
  const details = compactLines([
    telemetry?.durationMs !== undefined ? formatDuration(telemetry.durationMs) : undefined,
    telemetry?.usage ? formatTokenUsage(telemetry.usage) : undefined,
  ]).join(' · ')
  const suffix = details ? `（${details}）` : ''
  if (status === 'tool_calls') return `${base}：调用工具${suffix}`
  if (status === 'final') return `${base}：完成${suffix}`
  if (status === 'failed') return `${base}：失败${suffix}`
  return `${base}：运行中${suffix}`
}

function modelRoundContentPreview(activity: ChatRunActivity, roundIndex: number | undefined): string | undefined {
  if (roundIndex === undefined) return undefined
  const events = activity.events
    .filter((event) => event.kind === 'model_call' && event.roundIndex === roundIndex)
    .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt) || left.id.localeCompare(right.id))
  for (const event of [...events].reverse()) {
    const preview = stringValue(recordValue(event.data)?.contentPreview)?.trim()
    if (preview) return preview.length > 120 ? `${preview.slice(0, 120)}...` : preview
  }
  return undefined
}

function latestStatusText(activity: ChatRunActivity): string | undefined {
  if (!isActiveActivityStatus(activity.status)) return undefined
  const latest = [...activity.events].reverse().find((event) => event.status === 'started' || event.status === 'info')
  if (!latest) return undefined
  if (latest.kind === 'model_call') {
    if (latest.title === 'Model round started') return '正在请求模型'
    if (latest.title === 'Model HTTP request sent') return '正在请求模型'
    if (latest.title === 'Assistant progress update') return '正在接收模型回复'
    if (latest.title === 'Model tool call delta') return '正在准备工具调用'
    if (latest.title === 'Model retry scheduled' || latest.title === 'Model HTTP retry scheduled') return '模型请求重试中'
  }
  if (latest.title === 'Prompt composed') return '正在整理上下文'
  if (latest.kind === 'tool_call' && latest.toolName) return `正在${agentToolNameLabel(latest.toolName)}`
  if (activity.status === 'queued') return '等待 agent 开始'
  if (activity.status === 'in_progress') return 'agent 正在运行'
  return undefined
}

function isActiveActivityStatus(status: string): boolean {
  return status === 'queued' || status === 'in_progress' || status === 'requires_action'
}

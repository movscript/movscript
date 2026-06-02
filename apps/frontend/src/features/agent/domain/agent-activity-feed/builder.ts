import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { buildRunActivitySnapshot, type RunActivityRoundSnapshot } from '@/features/agent/domain/agentRunActivitySnapshot'
import { buildAgentRunTimeline, type AgentRunTimeline, type AgentRunTimelineRound } from '@movscript/conversation'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
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
import { toolActivityItem, toolActivityRecords } from './toolItems'
import { arrayValue, compactLines, idFromAliases, numberValue, planTasksSummary, recordValue, stringValue, timestamp } from './values'

export function buildAgentActivityFeed(input: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
}): AgentActivityFeed | undefined {
  const snapshot = buildRunActivitySnapshot(input)
  if (!snapshot) return undefined
  const { activity } = snapshot
  const timeline = buildAgentRunTimeline(activity)

  const itemIndex = buildActivityItemIndex(activity)
  const rounds = buildTimelineActivityRounds(timeline, snapshot.rounds, itemIndex)
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
    systemItems: systemActivityItems(activity),
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

function modelDecisionItems(activity: ChatRunActivity): AgentActivityDecisionItem[] {
  return activity.events.flatMap((event) => {
    if (event.kind !== 'model_call' || event.title !== 'Model tool calls requested') return []
    const data = recordValue(event.data)
    const calls = arrayValue(data?.tool_calls)
      ?.map((call) => modelDecisionToolCall(recordValue(call)))
      .filter((call) => call?.name !== 'core_user_input_request')
      .filter((call): call is ModelDecisionToolCall => !!call) ?? []
    if (calls.length === 0) return []
    const eventDurationMs = typeof event.durationMs === 'number'
      ? event.durationMs
      : typeof data?.durationMs === 'number' ? data.durationMs : undefined
    return [{
      id: `decision-${event.id}`,
      type: 'decision',
      kind: 'system',
      title: `模型决定调用 ${calls.length} 个工具`,
      lines: calls.map(decisionToolLine),
      status: event.status,
      createdAt: event.createdAt,
      ...(eventDurationMs !== undefined ? { durationMs: eventDurationMs } : {}),
      ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
      ...(event.roundLabel ? { roundLabel: event.roundLabel } : {}),
    }]
  })
}

interface ModelDecisionToolCall {
  name: string
  args?: Record<string, unknown>
}

function modelDecisionToolCall(record: Record<string, unknown> | undefined): ModelDecisionToolCall | undefined {
  const name = stringValue(record?.name)
  if (!name) return undefined
  const args = recordValue(record?.args)
  return {
    name,
    ...(args ? { args } : {}),
  }
}

function decisionToolLine(call: ModelDecisionToolCall): string {
  const args = call.args
  if (call.name === 'core_update_plan') {
    return compactLines([
      `${agentToolNameLabel(call.name)}${stringValue(args?.explanation) ? `：${stringValue(args?.explanation)}` : ''}`,
      planTasksSummary(args),
    ]).join('；')
  }
  const details = compactLines([
    stringValue(args?.query) ? `查询：${stringValue(args?.query)}` : undefined,
    numberValue(args?.projectId) !== undefined ? `项目：#${numberValue(args?.projectId)}` : undefined,
    numberValue(args?.contentLimit) !== undefined ? `内容上限：${numberValue(args?.contentLimit)}` : undefined,
    stringValue(args?.kind) ? `类型：${stringValue(args?.kind)}` : undefined,
    idFromAliases(args, ['workspaceId', 'workspace_id']) !== undefined ? `工作区：#${idFromAliases(args, ['workspaceId', 'workspace_id'])}` : undefined,
  ]).join('，')
  return `${agentToolNameLabel(call.name)}${details ? `：${details}` : ''}`
}

function buildTimelineActivityRounds(
  timeline: AgentRunTimeline,
  modelRounds: RunActivityRoundSnapshot[],
  index: ActivityItemIndex,
): AgentActivityRound[] {
  const telemetryByIndex = new Map(modelRounds.map((round) => [round.index, round]))
  return timeline.rounds
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
          .filter((item) => systemActivityRoundId(item, timeline.rounds) === round.id),
      ].sort(compareActivityItems)
      const structuredItems = [...decisionItems, ...toolExecutionItems]
      const firstStructuredItemTime = Math.min(...structuredItems.map((item) => timestamp(item.createdAt)))
      const systemItems = index.systemItems
        .filter((item) => systemActivityRoundId(item, timeline.rounds) === round.id)
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
        label: timelineRoundLabel(round, position, status, telemetry),
        status,
        items,
        ...(telemetry?.durationMs !== undefined ? { durationMs: telemetry.durationMs } : {}),
        ...(telemetry?.usage ? { usage: telemetry.usage } : {}),
      }
    })
    .filter((round) => round.items.length > 0 || round.status === 'failed')
}

function systemActivityRoundId(
  item: { createdAt: string; roundIndex?: number },
  rounds: AgentRunTimeline['rounds'],
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
      kind: 'system',
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

function runLifecycleEventText(event: ChatRunActivityEvent): string | undefined {
  const data = recordValue(event.data)
  const eventType = stringValue(data?.eventType)
  if (eventType === 'runtime.recovery.interrupted') {
    return '运行中断：runtime 重启时这个 run 尚未结束，已暂停等待继续或取消。'
  }
  if (eventType === 'runtime.recovery.resumed') {
    return '恢复继续：沿用同一个 run 重新调度，之前已完成的步骤保留为历史。'
  }
  if (eventType === 'runtime.recovery.queued_rescheduled') {
    return '运行恢复：启动时发现已排队的 run，已重新调度。'
  }
  if (event.title === 'Run cancelled') {
    const reason = event.summary ?? stringValue(data?.reason)
    if (reason === 'Runtime recovery cancelled by user.') {
      return '恢复已取消：保留中断前的执行记录，后续可以从新消息开始。'
    }
    return reason ? `运行已取消：${reason}` : '运行已取消。'
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

function activityRoundStatus(round: AgentRunTimelineRound, items: AgentActivityItem[]): AgentActivityRound['status'] {
  if (round.failed) return 'failed'
  if (items.length > 0) return 'tool_calls'
  return round.finished ? 'final' : 'thinking'
}

function timelineRoundLabel(
  round: AgentRunTimelineRound,
  position: number,
  status: AgentActivityRound['status'],
  telemetry?: RunActivityRoundSnapshot,
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
  if (round.index !== undefined) return roundLabel(round.index, status, telemetry)
  const prefix = `运行片段 ${position + 1}`
  if (status === 'tool_calls') return `${prefix}：调用工具`
  if (status === 'final') return `${prefix}：形成回复`
  if (status === 'failed') return `${prefix}：请求失败`
  return `${prefix}：运行中`
}

function roundLabel(index: number, status: AgentActivityRound['status'], telemetry?: Pick<RunActivityRoundSnapshot, 'durationMs' | 'usage'>) {
  const prefix = `第 ${index} 轮思考`
  const details = compactLines([
    telemetry?.durationMs !== undefined ? formatDuration(telemetry.durationMs) : undefined,
    telemetry?.usage ? formatTokenUsage(telemetry.usage) : undefined,
  ]).join(' · ')
  const suffix = details ? `（${details}）` : ''
  if (status === 'tool_calls') return `${prefix}：决定调用工具${suffix}`
  if (status === 'final') return `${prefix}：形成回复${suffix}`
  if (status === 'failed') return `${prefix}：请求失败${suffix}`
  return `${prefix}：请求模型中${suffix}`
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

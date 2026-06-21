import { modelEventDurationMs } from '@/features/agent/domain/agentRunActivitySnapshot'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type {
  AgentActivityApprovalRequestItem,
  AgentActivityDecisionItem,
  AgentActivityInputRequestItem,
  AgentActivityItem,
  AgentActivityLineItem,
} from './types'
import { modelDecisionItems } from './decisionItems'
import { sumNumbers } from './format'
import { toolActivityItem, toolActivityRecords } from './toolItems'
import { recordValue, stringValue, timestamp, compactLines } from './values'
import { formatModelEventUsage } from './roundLabels'

export interface ActivityItemIndex {
  actionItems: Array<AgentActivityInputRequestItem | AgentActivityApprovalRequestItem>
  actionItemsById: Map<string, AgentActivityInputRequestItem | AgentActivityApprovalRequestItem>
  decisionsById: Map<string, AgentActivityDecisionItem>
  systemItems: AgentActivityLineItem[]
  toolsById: Map<string, AgentActivityItem>
}

export function buildActivityItemIndex(activity: ChatRunActivity): ActivityItemIndex {
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

export function coalesceConsecutiveActivityItems(items: AgentActivityItem[]): AgentActivityItem[] {
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

export function compareActivityItems(left: AgentActivityItem, right: AgentActivityItem): number {
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

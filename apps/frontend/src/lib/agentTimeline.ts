import { generationStatusText } from '@/lib/agentGenerationDisplay'
import { compactRunActivity, mergeRunActivityEvents } from '@/lib/agentRunActivity'
import { agentTraceView, approvalStatusLabel, traceEventStatusLabel, traceKindLabel } from '@/lib/agentRunUi'
import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import type { AgentRun, AgentTraceEvent } from '@/lib/localAgentClient'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/store/agentStore'

export type AgentTimelineItemType = 'approval' | 'input_request' | 'tool_call' | 'message' | 'generation_job' | 'http' | 'trace_event'

export interface AgentTimelineItem {
  id: string
  type: AgentTimelineItemType
  kind: string
  title: string
  status: string
  statusLabel?: string
  createdAt: string
  completedAt?: string
  summary?: string
  args?: unknown
  result?: unknown
  error?: string
}

export interface AgentRunTimeline {
  runId: string
  threadId: string
  status: string
  error?: string
  warnings?: string[]
  stepCount: number
  completedStepCount: number
  actionCount: number
  eventCount: number
  items: AgentTimelineItem[]
}

export function buildAgentRunTimeline(input: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
}): AgentRunTimeline | undefined {
  const activity = displayRunActivity(input)
  if (!activity) return undefined

  const approvalItems: AgentTimelineItem[] = (activity.approvals ?? []).map((approval) => ({
    id: `approval-${approval.id}`,
    type: 'approval',
    kind: '审批',
    title: agentToolNameLabel(approval.toolName),
    status: approval.status,
    statusLabel: approvalStatusLabel(approval.status),
    createdAt: approval.createdAt,
    completedAt: approval.approvedAt ?? approval.rejectedAt ?? approval.updatedAt,
    summary: approval.reason,
    args: approval.args,
    result: approval.preview,
    error: approval.status === 'rejected' ? approval.reason : undefined,
  }))

  const inputItems: AgentTimelineItem[] = (activity.inputs ?? []).map((request) => ({
    id: `input-${request.id}`,
    type: 'input_request',
    kind: '用户输入',
    title: request.title,
    status: request.status,
    statusLabel: inputRequestStatusLabel(request.status),
    createdAt: request.createdAt,
    completedAt: request.answeredAt ?? request.updatedAt,
    summary: request.status === 'answered'
      ? inputAnswerSummary(request) || request.question
      : request.question,
    result: request.choices.length > 0 ? request.choices : undefined,
    error: request.status === 'cancelled' ? request.summary ?? request.question : undefined,
  }))

  const stepItems: AgentTimelineItem[] = activity.steps.map((step) => ({
    id: `step-${step.id}`,
    type: step.type === 'tool_call' ? 'tool_call' : 'message',
    kind: step.type === 'tool_call' ? '工具调用' : '消息',
    title: step.toolName ? agentToolNameLabel(step.toolName) : step.title ?? (step.type === 'tool_call' ? '工具调用' : '历史消息'),
    status: step.status,
    createdAt: step.createdAt,
    completedAt: step.completedAt,
    summary: step.error || (step.sandboxed ? '沙盒执行' : undefined),
    args: step.args,
    result: step.result,
    error: step.error,
  }))

  const eventItems = activity.events.map((event) => eventTimelineItem(event, activity.runId))
  const items = [...approvalItems, ...inputItems, ...stepItems, ...eventItems]
    .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt))
  const actionCount = items.filter((item) => item.type === 'approval' || item.type === 'input_request').length

  return {
    runId: activity.runId,
    threadId: activity.threadId,
    status: activity.status,
    ...(activity.error ? { error: activity.error } : {}),
    ...(activity.warnings?.length ? { warnings: activity.warnings } : {}),
    stepCount: activity.steps.length,
    completedStepCount: activity.steps.filter((step) => step.status === 'completed').length,
    actionCount,
    eventCount: activity.events.length,
    items,
  }
}

export function agentTimelineSummary(timeline: AgentRunTimeline): string {
  const actionSummary = timeline.actionCount > 0 ? `${timeline.actionCount} 个交互` : ''
  if (timeline.stepCount > 0) return [`${timeline.completedStepCount}/${timeline.stepCount} 个步骤`, actionSummary].filter(Boolean).join(' · ')
  if (actionSummary) return actionSummary
  return timeline.eventCount > 0 ? `${timeline.eventCount} 个事件` : '暂无工具调用'
}

export function formatToolCallStreamDetail(event: ChatRunActivityEvent) {
  const data = recordValue(event.data)
  const stream = recordValue(data?.stream)
  const toolCall = recordValue(stream?.toolCall)
  if (!toolCall) return null
  const name = typeof toolCall.name === 'string' && toolCall.name.trim() ? toolCall.name : undefined
  const id = typeof toolCall.id === 'string' && toolCall.id.trim() ? toolCall.id : undefined
  const parseStatus = toolCallParseStatusLabel(typeof toolCall.parseStatus === 'string' ? toolCall.parseStatus : undefined)
  const args = typeof toolCall.argumentsBuffer === 'string' ? toolCall.argumentsBuffer : ''
  const parsedArgs = toolCall.argumentsJSON
  return {
    label: agentToolNameLabel(name ?? id ?? 'tool'),
    parseStatus,
    args,
    parsedArgs,
  }
}

function displayRunActivity(input: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
}): ChatRunActivity | undefined {
  const base = input.activity ?? (input.run ? compactRunActivity(input.run) : activityFromEvents(input.events ?? []))
  if (!base) return undefined
  const normalizedBase = {
    ...base,
    approvals: base.approvals ?? [],
    inputs: base.inputs ?? [],
  }
  if (!input.events?.length || base.events === input.events) return normalizedBase
  return mergeRunActivityEvents(normalizedBase, input.events)
}

function activityFromEvents(events: ChatRunActivityEvent[]): ChatRunActivity | undefined {
  if (events.length === 0) return undefined
  const firstEvent = events[0]
  const lastEvent = events[events.length - 1] ?? firstEvent
  const failed = events.some((event) => event.status === 'failed' || event.status === 'blocked')
  const running = events.some((event) => event.status === 'started' || event.status === 'in_progress')
  return {
    runId: 'pending',
    threadId: 'pending',
    status: failed ? 'failed' : running ? 'in_progress' : lastEvent.status,
    createdAt: firstEvent.createdAt,
    updatedAt: lastEvent.completedAt ?? lastEvent.createdAt,
    events,
    steps: [],
  }
}

function eventTimelineItem(event: ChatRunActivityEvent, runId: string): AgentTimelineItem {
  const streamToolCall = formatToolCallStreamDetail(event)
  const generationTrace = formatGenerationTraceDetail(event)
  const eventView = activityTraceView(event, runId)
  const data = recordValue(event.data)
  const httpRequest = data?.httpRequest
  const actionType = event.kind === 'approval'
    ? 'approval'
    : event.kind === 'input' ? 'input_request' : undefined
  const actionStatus = actionType ? traceActionStatus(data, event.status) : event.status
  return {
    id: `event-${event.id}`,
    type: generationTrace ? 'generation_job' : httpRequest ? 'http' : actionType ?? 'trace_event',
    kind: actionType === 'approval'
      ? '审批'
      : actionType === 'input_request'
        ? '用户输入'
        : httpRequest ? 'HTTP' : eventView?.categoryLabel ?? traceKindLabel(event.kind as AgentTraceEvent['kind']),
    title: generationTrace ? generationTrace.label : streamToolCall ? streamToolCall.label : event.toolName ? `${eventView?.title ?? event.title}: ${agentToolNameLabel(event.toolName)}` : eventView?.title ?? event.title,
    status: actionStatus,
    statusLabel: actionType === 'approval'
      ? approvalTimelineStatusLabel(actionStatus)
      : actionType === 'input_request'
        ? inputRequestTimelineStatusLabel(actionStatus)
        : traceEventStatusLabel(event.status as AgentTraceEvent['status']),
    createdAt: event.createdAt,
    completedAt: event.completedAt,
    summary: generationTrace
      ? generationTrace.message ?? generationTrace.summary
      : streamToolCall ? `准备参数：${streamToolCall.parseStatus}（${streamToolCall.args.length} 字符）` : eventView?.behavior ?? eventView?.summary ?? event.summary,
    result: generationTrace ? generationTrace.generation : streamToolCall ? (streamToolCall.parsedArgs ?? streamToolCall.args) : event.data,
    error: event.status === 'failed' || event.status === 'blocked' ? event.summary : undefined,
  }
}

function traceActionStatus(data: Record<string, unknown> | undefined, fallback: string): string {
  const approval = recordValue(data?.approval)
  const input = recordValue(data?.input ?? data?.inputRequest ?? data?.request)
  const status = approval?.status ?? input?.status
  return typeof status === 'string' && status.trim() ? status : fallback
}

function activityTraceView(event: ChatRunActivityEvent, runId: string) {
  return agentTraceView({
    id: event.id,
    runId,
    kind: event.kind as AgentTraceEvent['kind'],
    title: event.title,
    status: event.status as AgentTraceEvent['status'],
    ...(event.summary ? { summary: event.summary } : {}),
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.stepId ? { stepId: event.stepId } : {}),
    ...(event.data !== undefined ? { data: event.data } : {}),
    createdAt: event.createdAt,
    ...(event.completedAt ? { completedAt: event.completedAt } : {}),
  })
}

function formatGenerationTraceDetail(event: ChatRunActivityEvent) {
  const data = recordValue(event.data)
  const generation = recordValue(data?.generation)
  if (!generation) return null
  const jobId = typeof generation.jobId === 'number' ? generation.jobId : undefined
  const status = typeof generation.status === 'string' ? generation.status : 'unknown'
  const stage = typeof generation.stage === 'string' ? generation.stage : undefined
  const progress = typeof generation.progress === 'number' ? generation.progress : undefined
  const outputResourceId = typeof generation.outputResourceId === 'number' ? generation.outputResourceId : undefined
  const outputResourceIds = generationOutputResourceIds(generation)
  const message = typeof generation.message === 'string' ? generation.message : undefined
  return {
    label: jobId !== undefined ? `生成任务 #${jobId}` : '生成任务',
    summary: [
      generationStatusText(status, stage),
      progress !== undefined ? `${progress}%` : undefined,
      generationOutputResourceSummary(outputResourceIds.length > 0 ? outputResourceIds : outputResourceId !== undefined ? [outputResourceId] : []),
    ].filter(Boolean).join(' · '),
    message,
    generation,
  }
}

function generationOutputResourceIds(generation: Record<string, unknown>) {
  const values = [
    ...(Array.isArray(generation.outputResourceIds) ? generation.outputResourceIds : []),
    ...(Array.isArray(generation.output_resource_ids) ? generation.output_resource_ids : []),
    generation.outputResourceId,
    generation.output_resource_id,
  ]
  const seen = new Set<number>()
  const ids: number[] = []
  for (const value of values) {
    const id = Number(value)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function generationOutputResourceSummary(ids: number[]) {
  if (ids.length === 0) return undefined
  return ids.length === 1 ? `资源 #${ids[0]}` : `资源 ${ids.map((id) => `#${id}`).join('、')}`
}

function inputAnswerSummary(request: NonNullable<ChatRunActivity['inputs']>[number]) {
  return [
    request.answer?.choiceIds?.length ? `选择：${request.answer.choiceIds.join(', ')}` : undefined,
    request.answer?.text ? `补充：${request.answer.text}` : undefined,
  ].filter(Boolean).join('；')
}

function inputRequestStatusLabel(status: string): string {
  if (status === 'pending') return '待处理'
  if (status === 'answered') return '已回答'
  if (status === 'cancelled') return '已取消'
  return `未知输入状态 (${status})`
}

function approvalTimelineStatusLabel(status: string): string {
  if (status === 'pending' || status === 'approved' || status === 'rejected') return approvalStatusLabel(status)
  return traceEventStatusLabel(status as AgentTraceEvent['status'])
}

function inputRequestTimelineStatusLabel(status: string): string {
  if (status === 'pending' || status === 'answered' || status === 'cancelled') return inputRequestStatusLabel(status)
  return traceEventStatusLabel(status as AgentTraceEvent['status'])
}

function toolCallParseStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'valid_json': return '参数已解析'
    case 'partial':
    case undefined: return '参数接收中'
    default: return `未知解析状态 (${status})`
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function timestamp(value: string): number {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

import { agentToolNameLabel } from '@/lib/agentToolDisplay'
import { buildRunActivitySnapshot, type RunActivityRoundSnapshot, type RunActivityTokenUsage } from '@/lib/agentRunActivitySnapshot'
import { isRecord } from '@/lib/jsonValue'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatRunActivity, ChatRunActivityApproval, ChatRunActivityEvent, ChatRunActivityInputRequest } from '@/store/agentStore'

export type AgentActivityTone = 'read' | 'draft' | 'write' | 'task' | 'wait' | 'system' | 'error'

export type AgentActivityItem =
  | AgentActivityDecisionItem
  | AgentActivityLineItem
  | AgentActivityBlockItem
  | AgentActivityRequestItem

export interface AgentActivityDecisionItem {
  id: string
  type: 'decision'
  tone: 'system'
  title: string
  lines: string[]
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
}

export interface AgentActivityLineItem {
  id: string
  type: 'line'
  tone: AgentActivityTone
  text: string
  detail?: AgentActivityDebugDetail
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
  toolName?: string
}

export interface AgentActivityBlockItem {
  id: string
  type: 'block'
  tone: AgentActivityTone
  title: string
  lines: string[]
  detail?: AgentActivityDebugDetail
  code?: {
    label: string
    text: string
  }
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
  toolName?: string
}

export interface AgentActivityRequestItem {
  id: string
  type: 'request'
  tone: 'wait'
  requestKind: 'input' | 'approval'
  requestId: string
  title: string
  lines: string[]
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
}

export interface AgentActivityDebugDetail {
  args?: unknown
  result?: unknown
  error?: string
}

export interface AgentActivityFeed {
  runId?: string
  status: string
  statusText?: string
  rounds: AgentActivityRound[]
  items: AgentActivityItem[]
  totals: AgentActivityTotals
  activity?: ChatRunActivity
}

export interface AgentActivityTotals {
  modelCallCount: number
  toolCallCount: number
  durationMs?: number
  usage?: AgentActivityTokenUsage
}

export interface AgentActivityRound {
  id: string
  index?: number
  label: string
  status: 'thinking' | 'tool_calls' | 'final' | 'failed'
  items: AgentActivityItem[]
  durationMs?: number
  usage?: AgentActivityTokenUsage
}

export type AgentActivityTokenUsage = RunActivityTokenUsage

interface ToolActivityRecord {
  id: string
  toolName: string
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
  completedAt?: string
  args?: unknown
  result?: unknown
  error?: string
  summary?: string
}

const CORE_TOOL_NAMES = new Set([
  'draft_create',
  'draft_file_edit',
  'draft_file_validate',
  'draft_validate',
  'draft_apply_preview',
  'draft_apply',
  'core_operation_start',
  'core_operation_wait',
  'core_operation_get',
  'core_operation_cancel',
  'generation_job_create',
  'candidate_asset_slot_attach',
  'candidate_keyframe_attach',
])

const OPERATION_STATUS_TOOL_NAMES = new Set([
  'core_operation_start',
  'core_operation_wait',
  'core_operation_get',
  'core_operation_cancel',
])

export function buildAgentActivityFeed(input: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
}): AgentActivityFeed | undefined {
  const snapshot = buildRunActivitySnapshot(input)
  if (!snapshot) return undefined
  const { activity } = snapshot

  const toolItems = toolActivityRecords(activity).map(toolActivityItem)
  const inputItems = (activity.inputs ?? [])
    .filter((input) => input.status === 'pending' || input.status === 'answered' || input.status === 'cancelled')
    .map(inputRequestItem)
  const approvalItems = (activity.approvals ?? [])
    .filter((approval) => approval.status === 'pending' || approval.status === 'approved' || approval.status === 'rejected')
    .map(approvalRequestItem)
  const decisionItems = modelDecisionItems(activity)

  const items = [...decisionItems, ...toolItems, ...inputItems, ...approvalItems]
    .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt))
  const rounds = buildActivityRounds(snapshot.rounds, items)

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

export function agentActivityFeedMarkdown(feed: AgentActivityFeed): string {
  const lines: string[] = []
  const runLabel = feed.runId ? `Run ${feed.runId}` : 'Run'
  lines.push(`### ${runLabel}`)
  if (feed.statusText) lines.push(`- ${feed.statusText}`)
  const totalLine = feedTotalsLine(feed)
  if (totalLine) lines.push(`- ${totalLine}`)
  const rounds = feed.rounds.length ? feed.rounds : [{ id: 'all', label: '活动', status: 'tool_calls' as const, items: feed.items }]
  for (const round of rounds) {
    lines.push(`- ${round.label}`)
    if (round.items.length === 0) {
      lines.push(`  - ${round.status === 'final' ? '形成最终回复' : '思考中'}`)
      continue
    }
    for (const item of round.items) {
      if (item.type === 'line') {
        lines.push(`  - ${item.text}${item.durationMs !== undefined ? `（${formatDuration(item.durationMs)}）` : ''}`)
        continue
      }
      lines.push(`  - ${item.title}${item.durationMs !== undefined ? `（${formatDuration(item.durationMs)}）` : ''}`)
      for (const line of item.lines) lines.push(`    - ${line}`)
      if (item.type === 'block' && item.code) {
        lines.push(`    - ${item.code.label}:`)
        lines.push('```')
        lines.push(item.code.text)
        lines.push('```')
      }
    }
  }
  return lines.join('\n')
}

export function feedTotalsLine(feed: Pick<AgentActivityFeed, 'totals'>): string | undefined {
  const parts = compactLines([
    feed.totals.modelCallCount > 0 ? `模型 ${feed.totals.modelCallCount} 次` : undefined,
    feed.totals.toolCallCount > 0 ? `工具 ${feed.totals.toolCallCount} 次` : undefined,
    feed.totals.durationMs !== undefined ? formatDuration(feed.totals.durationMs) : undefined,
    feed.totals.usage ? formatTokenUsage(feed.totals.usage) : undefined,
  ])
  return parts.length ? `累计：${parts.join(' · ')}` : undefined
}

export function agentActivityTraceJSON(feed: AgentActivityFeed): string {
  return JSON.stringify({
    runId: feed.runId,
    status: feed.status,
    activity: feed.activity,
  }, null, 2)
}

function modelDecisionItems(activity: ChatRunActivity): AgentActivityDecisionItem[] {
  return activity.events.flatMap((event) => {
    if (event.kind !== 'model_call' || event.title !== 'Model tool calls requested') return []
    const data = recordValue(event.data)
    const calls = arrayValue(data?.tool_calls)
      ?.map((call) => modelDecisionToolCall(recordValue(call)))
      .filter((call): call is ModelDecisionToolCall => !!call) ?? []
    if (calls.length === 0) return []
    const eventDurationMs = typeof event.durationMs === 'number'
      ? event.durationMs
      : typeof data?.durationMs === 'number' ? data.durationMs : undefined
    return [{
      id: `decision-${event.id}`,
      type: 'decision',
      tone: 'system',
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
  const details = compactLines([
    stringValue(args?.query) ? `查询：${stringValue(args?.query)}` : undefined,
    numberValue(args?.projectId) !== undefined ? `项目：#${numberValue(args?.projectId)}` : undefined,
    numberValue(args?.contentLimit) !== undefined ? `内容上限：${numberValue(args?.contentLimit)}` : undefined,
    stringValue(args?.kind) ? `类型：${stringValue(args?.kind)}` : undefined,
    idFromAliases(args, ['draftId', 'draft_id']) !== undefined ? `草稿：#${idFromAliases(args, ['draftId', 'draft_id'])}` : undefined,
  ]).join('，')
  return `${agentToolNameLabel(call.name)}${details ? `：${details}` : ''}`
}

function toolActivityRecords(activity: ChatRunActivity): ToolActivityRecord[] {
  const eventsByStep = new Map<string, ChatRunActivityEvent[]>()
  for (const event of activity.events) {
    if (!event.stepId) continue
    const events = eventsByStep.get(event.stepId) ?? []
    events.push(event)
    eventsByStep.set(event.stepId, events)
  }

  const records: ToolActivityRecord[] = activity.steps
    .filter((step) => step.type === 'tool_call' && step.toolName)
    .map((step) => {
      const toolEvents = step.id ? eventsByStep.get(step.id) ?? [] : []
      const eventData = latestToolEventData(toolEvents)
      return {
        id: `step-${step.id}`,
        toolName: step.toolName!,
        status: step.status,
        createdAt: step.createdAt,
        ...(typeof step.durationMs === 'number' ? { durationMs: step.durationMs } : {}),
        ...(step.roundIndex !== undefined ? { roundIndex: step.roundIndex } : {}),
        ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
        ...(step.completedAt ? { completedAt: step.completedAt } : {}),
        args: step.args ?? eventData.args,
        result: step.result ?? eventData.result,
        ...(step.error ? { error: step.error } : {}),
        ...(toolEvents.find((event) => event.summary)?.summary ? { summary: toolEvents.find((event) => event.summary)?.summary } : {}),
      }
    })

  const coveredStepIds = new Set(activity.steps.map((step) => step.id))
  const eventRecords = activity.events
    .filter((event) => event.kind === 'tool_call' && event.toolName && !toolEventCoveredByStep(event, activity.steps, coveredStepIds))
    .filter((event) => event.title !== 'Model tool call delta')
    .map((event) => {
      const data = isRecord(event.data) ? event.data : undefined
      const eventDurationMs = typeof event.durationMs === 'number'
        ? event.durationMs
        : typeof data?.durationMs === 'number' ? data.durationMs : undefined
      return {
        id: `event-${event.id}`,
        toolName: event.toolName!,
        status: event.status,
        createdAt: event.createdAt,
        ...(eventDurationMs !== undefined ? { durationMs: eventDurationMs } : {}),
        ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
        ...(event.roundLabel ? { roundLabel: event.roundLabel } : {}),
        ...(event.completedAt ? { completedAt: event.completedAt } : {}),
        args: data?.args,
        result: data?.result,
        ...(event.summary ? { summary: event.summary } : {}),
      }
    })

  return [...records, ...eventRecords]
}

function toolEventCoveredByStep(
  event: ChatRunActivityEvent,
  steps: ChatRunActivity['steps'],
  coveredStepIds: Set<string>,
): boolean {
  if (event.stepId && coveredStepIds.has(event.stepId)) return true
  if (!event.toolName || !OPERATION_STATUS_TOOL_NAMES.has(event.toolName)) return false

  const data = recordValue(event.data)
  const hasExecutionPayload = data?.args !== undefined || data?.result !== undefined || data?.error !== undefined
  if (hasExecutionPayload) return false

  const isOperationStatusTrace = data?.runtimeOperation !== undefined || data?.generation !== undefined
  if (!isOperationStatusTrace) return false

  return steps.some((step) => {
    if (step.type !== 'tool_call' || step.toolName !== event.toolName) return false
    if (step.roundIndex !== undefined && event.roundIndex !== undefined) return step.roundIndex === event.roundIndex
    return true
  })
}

function latestToolEventData(events: ChatRunActivityEvent[]) {
  const event = [...events].reverse().find((candidate) => {
    const data = isRecord(candidate.data) ? candidate.data : undefined
    return data?.args !== undefined || data?.result !== undefined
  })
  const data = isRecord(event?.data) ? event?.data : undefined
  return {
    args: data?.args,
    result: data?.result,
  }
}

function toolActivityItem(record: ToolActivityRecord): AgentActivityItem {
  if (CORE_TOOL_NAMES.has(record.toolName)) return coreToolActivityBlock(record)
  return {
    id: record.id,
    type: 'line',
    tone: fallbackToolTone(record.toolName),
    text: fallbackToolText(record),
    ...(toolDebugDetail(record) ? { detail: toolDebugDetail(record) } : {}),
    status: record.status,
    createdAt: record.createdAt,
    ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}),
    ...(record.roundIndex !== undefined ? { roundIndex: record.roundIndex } : {}),
    ...(record.roundLabel ? { roundLabel: record.roundLabel } : {}),
    toolName: record.toolName,
  }
}

function coreToolActivityBlock(record: ToolActivityRecord): AgentActivityBlockItem {
  const args = recordValue(record.args)
  const result = recordValue(record.result)
  const failed = record.status === 'failed' || record.status === 'blocked' || !!record.error
  const statusLine = failed ? record.error ?? record.summary ?? '执行失败' : undefined

  if (record.toolName === 'draft_create') {
    return block(record, 'draft', '创建本地草稿', compactLines([
      draftIdLine(result),
      stringValue(args?.title) ? `标题：${stringValue(args?.title)}` : undefined,
      stringValue(args?.kind) ? `类型：${stringValue(args?.kind)}` : undefined,
      numberValue(args?.projectId) !== undefined ? `项目：#${numberValue(args?.projectId)}` : undefined,
      '项目数据尚未正式写入。',
      statusLine,
    ]))
  }

  if (record.toolName === 'draft_file_edit') {
    return block(record, 'draft', '修改草稿正文', compactLines([
      stringValue(args?.ref) ? `文件：${stringValue(args?.ref)}` : undefined,
      draftEditSummary(args, result),
      statusLine,
    ]), patchCodeView(args))
  }

  if (record.toolName === 'draft_validate' || record.toolName === 'draft_file_validate') {
    return block(record, 'draft', '校验草稿', compactLines([
      draftIdLine(args) ?? draftIdLine(result),
      validationSummary(result),
      statusLine,
    ]))
  }

  if (record.toolName === 'draft_apply_preview') {
    return block(record, 'write', '预览正式应用', compactLines([
      draftIdLine(args) ?? draftIdLine(result),
      stringValue(result?.message),
      '这里只是预览，还没有写入项目。',
      statusLine,
    ]))
  }

  if (record.toolName === 'draft_apply') {
    return block(record, 'write', '正式应用草稿', compactLines([
      draftIdLine(args) ?? draftIdLine(result),
      stringValue(result?.message),
      '项目数据已按草稿应用。',
      statusLine,
    ]))
  }

  if (record.toolName === 'core_operation_start') {
    const operationKind = stringValue(args?.kind)
    return block(record, 'task', '启动后台任务', compactLines([
      operationKind ? `类型：${operationKindLabel(operationKind)}` : undefined,
      operationIdLine(result),
      generationRequestSummary(record.args),
      '任务已提交，后续结果会从后台任务返回。',
      statusLine,
    ]))
  }

  if (record.toolName === 'core_operation_wait' || record.toolName === 'core_operation_get' || record.toolName === 'core_operation_cancel') {
    return block(record, 'task', operationToolTitle(record.toolName), compactLines([
      operationIdLine(args) ?? operationIdLine(result),
      operationStatusLine(result),
      statusLine,
    ]))
  }

  if (record.toolName === 'generation_job_create') {
    return block(record, 'task', '创建生成任务', compactLines([
      generationJobIdsLine(result),
      generationRequestSummary(record.args),
      outputResourceLine(result),
      stringValue(result?.message),
      statusLine,
    ]))
  }

  if (record.toolName === 'candidate_asset_slot_attach') {
    return block(record, 'write', '写入素材候选', compactLines([
      idFromAliases(args, ['asset_slot_id', 'assetSlotId']) !== undefined ? `素材槽：#${idFromAliases(args, ['asset_slot_id', 'assetSlotId'])}` : undefined,
      resourceIdsLine(args) ?? resourceIdsLine(result),
      stringValue(result?.message),
      statusLine,
    ]))
  }

  if (record.toolName === 'candidate_keyframe_attach') {
    return block(record, 'write', '写入关键帧候选', compactLines([
      idFromAliases(args, ['keyframe_id', 'keyframeId', 'target_keyframe_id', 'targetKeyframeId']) !== undefined ? `关键帧：#${idFromAliases(args, ['keyframe_id', 'keyframeId', 'target_keyframe_id', 'targetKeyframeId'])}` : undefined,
      resourceIdsLine(args) ?? resourceIdsLine(result),
      stringValue(result?.message),
      statusLine,
    ]))
  }

  return block(record, fallbackToolTone(record.toolName), agentToolNameLabel(record.toolName), compactLines([statusLine]))
}

function inputRequestItem(request: ChatRunActivityInputRequest): AgentActivityRequestItem {
  return {
    id: `input-${request.id}`,
    type: 'request',
    tone: 'wait',
    requestKind: 'input',
    requestId: request.id,
    title: request.status === 'pending' ? '等待你补充信息' : request.status === 'answered' ? '已收到你的补充' : '用户输入已取消',
    lines: compactLines([
      request.question,
      request.answer?.text ? `回复：${request.answer.text}` : undefined,
      request.answer?.choiceIds?.length ? `选择：${request.answer.choiceIds.join('、')}` : undefined,
    ]),
    status: request.status,
    createdAt: request.createdAt,
  }
}

function approvalRequestItem(approval: ChatRunActivityApproval): AgentActivityRequestItem {
  return {
    id: `approval-${approval.id}`,
    type: 'request',
    tone: 'wait',
    requestKind: 'approval',
    requestId: approval.id,
    title: approval.status === 'pending' ? '等待你确认工具执行' : approval.status === 'approved' ? '你已确认工具执行' : '你已拒绝工具执行',
    lines: compactLines([
      `工具：${agentToolNameLabel(approval.toolName)}`,
      approval.reason,
      approval.permission ? `权限：${approval.permission}` : undefined,
      approval.risk ? `风险：${approval.risk}` : undefined,
    ]),
    status: approval.status,
    createdAt: approval.createdAt,
  }
}

function buildActivityRounds(modelRounds: RunActivityRoundSnapshot[], items: AgentActivityItem[]): AgentActivityRound[] {
  const itemsByRound = new Map<number, AgentActivityItem[]>()
  const fallbackItems: AgentActivityItem[] = []
  for (const item of items) {
    if (item.roundIndex !== undefined) {
      const list = itemsByRound.get(item.roundIndex) ?? []
      list.push(item)
      itemsByRound.set(item.roundIndex, list)
    } else {
      fallbackItems.push(item)
    }
  }

  const rounds: AgentActivityRound[] = modelRounds.map((round) => {
    const roundItems = (itemsByRound.get(round.index) ?? []).sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt))
    const status = round.failed
      ? 'failed' as const
      : roundItems.length > 0
        ? 'tool_calls' as const
        : round.finished ? 'final' as const : 'thinking' as const
    return {
      id: `round-${round.index}`,
      index: round.index,
      label: roundLabel(round.index, status, round),
      status,
      items: roundItems,
      ...(round.durationMs !== undefined ? { durationMs: round.durationMs } : {}),
      ...(round.usage ? { usage: round.usage } : {}),
    }
  })

  const knownRoundIndexes = new Set(modelRounds.map((round) => round.index))
  for (const [roundIndex, roundItems] of itemsByRound) {
    if (knownRoundIndexes.has(roundIndex)) continue
    rounds.push({
      id: `round-${roundIndex}`,
      index: roundIndex,
      label: roundLabel(roundIndex, 'tool_calls'),
      status: 'tool_calls',
      items: roundItems.sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt)),
    })
  }

  if (fallbackItems.length > 0) {
    const inferred = assignFallbackItemsToRounds(fallbackItems, modelRounds)
    for (const [roundIndex, roundItems] of inferred) {
      if (roundIndex === 'unknown') continue
      const existing = rounds.find((round) => round.index === roundIndex)
      if (existing) {
        existing.items = [...existing.items, ...roundItems].sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt))
        existing.status = existing.items.length > 0 ? 'tool_calls' : existing.status
      } else {
        rounds.push({
          id: `round-${roundIndex}`,
          index: roundIndex,
          label: roundLabel(roundIndex, 'tool_calls'),
          status: 'tool_calls',
          items: roundItems.sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt)),
        })
      }
    }
    const unknownItems = inferred.get('unknown') ?? []
    if (unknownItems.length > 0) {
      rounds.push({
        id: 'round-unknown',
        label: '运行调用',
        status: 'tool_calls',
        items: unknownItems.sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt)),
      })
    }
  }

  return rounds
    .filter((round) => round.items.length > 0 || round.status === 'thinking' || round.status === 'final' || round.status === 'failed')
    .sort((left, right) => (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER))
}

function assignFallbackItemsToRounds(items: AgentActivityItem[], rounds: RunActivityRoundSnapshot[]): Map<number | 'unknown', AgentActivityItem[]> {
  const result = new Map<number | 'unknown', AgentActivityItem[]>()
  for (const item of items) {
    const itemTime = timestamp(item.createdAt)
    const round = [...rounds].reverse().find((candidate) => timestamp(candidate.startedAt) <= itemTime)
    const key = round?.index ?? 'unknown'
    const list = result.get(key) ?? []
    list.push(item)
    result.set(key, list)
  }
  return result
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

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '--'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function formatTokenUsage(usage: AgentActivityTokenUsage): string | undefined {
  const total = usage.totalTokens ?? sumNumbers(usage.inputTokens, usage.outputTokens)
  if (total === undefined) return undefined
  const parts = [`${formatInteger(total)} tokens`]
  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
    parts.push(`in ${formatInteger(usage.inputTokens ?? 0)} / out ${formatInteger(usage.outputTokens ?? 0)}`)
  }
  return parts.join('，')
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function sumNumbers(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) return undefined
  return (left ?? 0) + (right ?? 0)
}

function block(record: ToolActivityRecord, tone: AgentActivityTone, title: string, lines: string[], code?: AgentActivityBlockItem['code']): AgentActivityBlockItem {
  return {
    id: record.id,
    type: 'block',
    tone,
    title,
    lines,
    ...(toolDebugDetail(record) ? { detail: toolDebugDetail(record) } : {}),
    ...(code ? { code } : {}),
    status: record.status,
    createdAt: record.createdAt,
    ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}),
    ...(record.roundIndex !== undefined ? { roundIndex: record.roundIndex } : {}),
    ...(record.roundLabel ? { roundLabel: record.roundLabel } : {}),
    toolName: record.toolName,
  }
}

function toolDebugDetail(record: ToolActivityRecord): AgentActivityDebugDetail | undefined {
  if (record.args === undefined && record.result === undefined && !record.error) return undefined
  return {
    ...(record.args !== undefined ? { args: record.args } : {}),
    ...(record.result !== undefined ? { result: record.result } : {}),
    ...(record.error ? { error: record.error } : {}),
  }
}

function latestStatusText(activity: ChatRunActivity): string | undefined {
  const latest = [...activity.events].reverse().find((event) => event.status === 'started' || event.status === 'info')
  if (!latest) return undefined
  if (latest.kind === 'model_call') {
    if (latest.title === 'Model round started') return '正在请求模型'
    if (latest.title === 'Model HTTP request sent') return '正在请求模型'
    if (latest.title === 'Model stream delta') return '正在接收模型回复'
    if (latest.title === 'Model tool call delta') return '正在准备工具调用'
    if (latest.title === 'Model retry scheduled' || latest.title === 'Model HTTP retry scheduled') return '模型请求重试中'
  }
  if (latest.title === 'Prompt composed') return '正在整理上下文'
  if (latest.kind === 'tool_call' && latest.toolName) return `正在${agentToolNameLabel(latest.toolName)}`
  if (activity.status === 'queued') return '等待 agent 开始'
  if (activity.status === 'in_progress') return 'agent 正在运行'
  return undefined
}

function fallbackToolText(record: ToolActivityRecord): string {
  const label = agentToolNameLabel(record.toolName)
  const prefix = statusPrefix(record.status)
  if (record.error) return `${label}失败：${record.error}`
  if (isReadTool(record.toolName)) return `${prefix}读取数据：${label}`
  if (record.toolName.includes('search')) return `${prefix}搜索数据：${label}`
  if (record.toolName.includes('list')) return `${prefix}查看列表：${label}`
  if (record.toolName.includes('create') || record.toolName.includes('start') || record.toolName.includes('spawn')) return `${prefix}启动任务：${label}`
  if (record.toolName.includes('apply') || record.toolName.includes('attach') || record.toolName.includes('edit')) return `${prefix}写入数据：${label}`
  return `${prefix}${label}`
}

function fallbackToolTone(toolName: string): AgentActivityTone {
  if (toolName.startsWith('draft_')) return 'draft'
  if (toolName.includes('apply') || toolName.includes('attach') || toolName.includes('edit') || toolName.includes('delete')) return 'write'
  if (toolName.includes('generation') || toolName.includes('operation') || toolName.includes('subagent')) return 'task'
  if (isReadTool(toolName)) return 'read'
  return 'system'
}

function statusPrefix(status: string): string {
  if (status === 'in_progress' || status === 'started') return '正在'
  if (status === 'failed' || status === 'blocked') return ''
  return '已'
}

function isReadTool(toolName: string) {
  return toolName.includes('read')
    || toolName.includes('get')
    || toolName.includes('query')
    || toolName.includes('list')
    || toolName.includes('search')
    || toolName.includes('inspect')
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function compactLines(lines: Array<string | undefined>): string[] {
  return lines.filter((line): line is string => !!line?.trim())
}

function draftIdLine(value: Record<string, unknown> | undefined): string | undefined {
  const draftId = stringValue(value?.draftId) ?? stringValue(value?.draft_id) ?? stringValue(recordValue(value?.draft)?.id) ?? stringValue(recordValue(value?.draft)?.draftId)
  return draftId ? `草稿：${draftId}` : undefined
}

function draftEditSummary(args: Record<string, unknown> | undefined, result: Record<string, unknown> | undefined): string | undefined {
  const edits = Array.isArray(args?.edits) ? args.edits.length : undefined
  const patch = stringValue(args?.patch)
  const replacements = numberValue(result?.replacementCount) ?? numberValue(recordValue(result?.changeSet)?.replacementCount)
  if (replacements !== undefined) return `替换 ${replacements} 处文本。`
  if (edits !== undefined) return `提交 ${edits} 个编辑片段。`
  if (patch) return `提交 ${Math.max(1, patch.split('\n@@').length - 1)} 个 patch 片段。`
  return stringValue(result?.message)
}

function patchCodeView(args: Record<string, unknown> | undefined): AgentActivityBlockItem['code'] | undefined {
  const patch = stringValue(args?.patch)
  if (patch) {
    return {
      label: 'Patch',
      text: compactPatchText(patch),
    }
  }
  const edits = Array.isArray(args?.edits) ? args.edits : []
  const patchEdit = edits.find((edit) => isRecord(edit) && edit.type === 'apply_patch' && typeof edit.patch === 'string')
  if (isRecord(patchEdit)) {
    return {
      label: 'Patch',
      text: compactPatchText(String(patchEdit.patch)),
    }
  }
  const replaceEdits = edits
    .filter((edit) => isRecord(edit) && edit.type === 'replace_text')
    .map((edit, index) => {
      const record = edit as Record<string, unknown>
      const oldText = stringValue(record.oldText) ?? ''
      const newText = stringValue(record.newText) ?? ''
      return [
        `# replace_text ${index + 1}`,
        '- oldText',
        oldText,
        '+ newText',
        newText,
      ].join('\n')
    })
  if (replaceEdits.length > 0) {
    return {
      label: '文本替换',
      text: compactPatchText(replaceEdits.join('\n\n')),
    }
  }
  return undefined
}

function compactPatchText(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= 4000) return trimmed
  return `${trimmed.slice(0, 3900).trimEnd()}\n\n... 已截断 ${trimmed.length - 3900} 字符`
}

function validationSummary(result: Record<string, unknown> | undefined): string | undefined {
  const ok = typeof result?.ok === 'boolean' ? result.ok : undefined
  const valid = typeof result?.valid === 'boolean' ? result.valid : undefined
  const errors = Array.isArray(result?.errors) ? result.errors.length : undefined
  const warnings = Array.isArray(result?.warnings) ? result.warnings.length : undefined
  if (ok === true || valid === true) return warnings ? `校验通过，${warnings} 条提醒。` : '校验通过。'
  if (ok === false || valid === false) return `校验未通过${errors !== undefined ? `，${errors} 个问题` : ''}。`
  return stringValue(result?.message)
}

function operationKindLabel(kind: string): string {
  if (kind === 'generation_job') return '生成任务'
  return kind
}

function operationToolTitle(toolName: string): string {
  if (toolName === 'core_operation_wait') return '等待后台任务'
  if (toolName === 'core_operation_cancel') return '取消后台任务'
  return '查看后台任务'
}

function operationIdLine(value: Record<string, unknown> | undefined): string | undefined {
  const id = stringValue(value?.operationId) ?? stringValue(value?.operation_id) ?? stringValue(value?.id)
  return id ? `任务：${id}` : undefined
}

function operationStatusLine(result: Record<string, unknown> | undefined): string | undefined {
  const status = stringValue(result?.status) ?? stringValue(recordValue(result?.operation)?.status)
  const message = stringValue(result?.message)
  if (status && message) return `状态：${status}，${message}`
  if (status) return `状态：${status}`
  return message
}

function generationRequestSummary(args: unknown): string | undefined {
  const record = recordValue(args)
  const request = recordValue(record?.request) ?? record
  const outputType = stringValue(request?.output_type) ?? stringValue(request?.outputType) ?? stringValue(request?.job_type) ?? stringValue(request?.jobType)
  const model = stringValue(request?.model_id) ?? stringValue(request?.modelId)
  const count = numberValue(request?.output_count) ?? numberValue(request?.outputCount)
  const parts = [
    outputType ? `类型：${outputType}` : undefined,
    model ? `模型：${model}` : undefined,
    count !== undefined ? `数量：${count}` : undefined,
  ].filter(Boolean)
  return parts.length ? parts.join('，') : undefined
}

function generationJobIdsLine(result: Record<string, unknown> | undefined): string | undefined {
  const ids = numberArray(result?.jobIds ?? result?.job_ids)
  const single = numberValue(result?.jobId) ?? numberValue(result?.job_id)
  const values = ids.length ? ids : single !== undefined ? [single] : []
  return values.length ? `生成任务：${values.map((id) => `#${id}`).join('、')}` : undefined
}

function outputResourceLine(result: Record<string, unknown> | undefined): string | undefined {
  const ids = numberArray(result?.output_resource_ids ?? result?.outputResourceIds)
  const single = numberValue(result?.output_resource_id) ?? numberValue(result?.outputResourceId)
  const values = ids.length ? ids : single !== undefined ? [single] : []
  return values.length ? `输出资源：${values.map((id) => `#${id}`).join('、')}` : undefined
}

function resourceIdsLine(value: Record<string, unknown> | undefined): string | undefined {
  const ids = numberArray(value?.resource_ids ?? value?.resourceIds ?? value?.output_resource_ids ?? value?.outputResourceIds)
  const single = numberValue(value?.resource_id) ?? numberValue(value?.resourceId) ?? numberValue(value?.output_resource_id) ?? numberValue(value?.outputResourceId)
  const values = ids.length ? ids : single !== undefined ? [single] : []
  return values.length ? `资源：${values.map((id) => `#${id}`).join('、')}` : undefined
}

function idFromAliases(value: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  for (const key of keys) {
    const id = numberValue(value?.[key])
    if (id !== undefined) return id
  }
  return undefined
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : []
}

function timestamp(value: string | undefined) {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type { AgentActivityBlockItem, AgentActivityDebugDetail, AgentActivityItem, AgentActivityKind } from './types'
import {
  compactLines,
  recordValue,
} from './values'

interface ToolActivityRecord {
  id: string
  toolName: string
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
  completedAt?: string
  error?: string
  summary?: string
}

const CORE_TOOL_NAMES = new Set([
  'workspace_create',
  'core_file_edit',
  'workspace_fetch',
  'workspace_status',
  'workspace_review',
  'workspace_submit',
  'workspace_update',
  'workspace_apply_review',
  'workspace_apply',
  'core_update_plan',
  'core_work_start',
  'core_work_wait',
  'core_work_get',
  'core_work_cancel',
  'generation_image_generate',
  'generation_video_generate',
  'generation_job_create',
])

const WORK_STATUS_TOOL_NAMES = new Set([
  'core_work_start',
  'core_work_wait',
  'core_work_get',
  'core_work_cancel',
])
const PROVIDER_WORK_TRACE_COMPAT_KEY = ['run', 'time', 'Work'].join('')

export function toolActivityRecords(activity: ChatRunActivity): ToolActivityRecord[] {
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
      return {
        id: `step-${step.id}`,
        toolName: step.toolName!,
        status: step.status,
        createdAt: step.createdAt,
        ...(typeof step.durationMs === 'number' ? { durationMs: step.durationMs } : {}),
        ...(step.roundIndex !== undefined ? { roundIndex: step.roundIndex } : {}),
        ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
        ...(step.completedAt ? { completedAt: step.completedAt } : {}),
        ...(step.error ? { error: step.error } : {}),
        ...(toolEvents.find((event) => event.summary)?.summary ? { summary: toolEvents.find((event) => event.summary)?.summary } : {}),
      }
    })

  const coveredStepIds = new Set(activity.steps.map((step) => step.id))
  const eventRecords = activity.events
    .filter((event) => event.kind === 'tool_call' && event.toolName && !toolEventCoveredByStep(event, activity.steps, coveredStepIds))
    .filter((event) => event.title !== 'Model tool call delta')
    .map((event) => {
      const data = recordValue(event.data)
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
  if (!event.toolName || !WORK_STATUS_TOOL_NAMES.has(event.toolName)) return false

  const data = recordValue(event.data)
  const hasExecutionPayload = data?.error !== undefined
  if (hasExecutionPayload) return false

  const isWorkStatusTrace = data?.providerWork !== undefined
    || data?.[PROVIDER_WORK_TRACE_COMPAT_KEY] !== undefined
    || data?.generation !== undefined
  if (!isWorkStatusTrace) return false

  return steps.some((step) => {
    if (step.type !== 'tool_call' || step.toolName !== event.toolName) return false
    if (step.roundIndex !== undefined && event.roundIndex !== undefined) return step.roundIndex === event.roundIndex
    return true
  })
}

export function toolActivityItem(record: ToolActivityRecord): AgentActivityItem {
  if (CORE_TOOL_NAMES.has(record.toolName)) return coreToolActivityBlock(record)
  return {
    id: record.id,
    type: 'line',
    kind: fallbackToolKind(record.toolName),
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
  const failed = record.status === 'failed' || record.status === 'blocked' || !!record.error
  const statusLine = failed ? record.error ?? record.summary ?? '执行失败' : undefined

  if (record.toolName === 'workspace_create') {
    return block(record, 'workspace', '创建本地工作区', compactLines([
      '项目数据尚未正式写入。',
      statusLine,
    ]))
  }

  if (record.toolName === 'core_file_edit') {
    return block(record, 'workspace', '修改工作区正文', compactLines([
      record.summary,
      statusLine,
    ]))
  }

  if (record.toolName === 'workspace_fetch' || record.toolName === 'workspace_update') {
    return block(record, 'workspace', record.toolName === 'workspace_fetch' ? '拉取工作区' : '刷新工作区投影', compactLines([
      record.toolName === 'workspace_fetch' ? '本地工作区已从后端拉取。' : '本地投影已从后端刷新。',
      record.summary,
      statusLine,
    ]))
  }

  if (record.toolName === 'workspace_status') {
    return block(record, 'workspace', '检查工作区状态', compactLines([
      record.summary,
      statusLine,
    ]))
  }

  if (record.toolName === 'workspace_review' || record.toolName === 'workspace_apply_review') {
    return block(record, 'write', record.toolName === 'workspace_review' ? '审阅工作区' : '预览工作区提交', compactLines([
      '这里只是审阅，还没有写入数据库。',
      record.summary,
      statusLine,
    ]))
  }

  if (record.toolName === 'workspace_submit' || record.toolName === 'workspace_apply') {
    return block(record, 'write', record.toolName === 'workspace_submit' ? '提交工作区' : '提交工作区修改', compactLines([
      '工作区修改已提交到后端边界。',
      record.summary,
      statusLine,
    ]))
  }

  if (record.toolName === 'core_update_plan') {
    return block(record, 'system', '更新执行计划', compactLines([
      record.summary,
      statusLine,
    ]))
  }

  if (record.toolName === 'core_work_start') {
    return block(record, 'task', '提交异步任务', compactLines([
      '任务已提交，后续结果会从 provider work 返回。',
      record.summary,
      statusLine,
    ]))
  }

  if (record.toolName === 'core_work_wait' || record.toolName === 'core_work_get' || record.toolName === 'core_work_cancel') {
    return block(record, 'task', workToolTitle(record.toolName), compactLines([
      record.summary,
      statusLine,
    ]))
  }

  if (isGenerationSubmitTool(record.toolName)) {
    return block(record, 'task', '创建生成任务', compactLines([
      record.summary,
      statusLine,
    ]))
  }

  return block(record, fallbackToolKind(record.toolName), agentToolNameLabel(record.toolName), compactLines([statusLine]))
}

function isGenerationSubmitTool(toolName: string): boolean {
  return toolName === 'generation_image_generate'
    || toolName === 'generation_video_generate'
    || toolName === 'generation_job_create'
}

function block(record: ToolActivityRecord, kind: AgentActivityKind, title: string, lines: string[], code?: AgentActivityBlockItem['code']): AgentActivityBlockItem {
  return {
    id: record.id,
    type: 'block',
    kind,
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
  if (!record.error) return undefined
  return { error: record.error }
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

function fallbackToolKind(toolName: string): AgentActivityKind {
  if (toolName.startsWith('workspace_')) return 'workspace'
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

function workToolTitle(toolName: string): string {
  if (toolName === 'core_work_wait') return '观察异步任务'
  if (toolName === 'core_work_cancel') return '取消异步任务'
  return '查看异步任务'
}

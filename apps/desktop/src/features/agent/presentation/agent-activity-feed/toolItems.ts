import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import {
  artifactToolDescription,
  artifactToolKind,
  block,
  domainEditingHandoffDescription,
  editingToolDescription,
  editingToolFamily,
  editingToolKind,
  fallbackToolKind,
  fallbackToolText,
  isArtifactTool,
  isDomainEditingHandoffTool,
  isEditingTool,
  isGenerationSubmitTool,
  isResourceVideoCompatibilityTool,
  normalizeToolName,
  resourceVideoCompatibilityDescription,
  toolDebugDetail,
  workToolTitle,
  type ToolActivityRecord,
} from './toolItemModel'
import type { AgentActivityBlockItem, AgentActivityItem } from './types'
import {
  compactLines,
  recordValue,
} from './values'

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
  'generation_capability_list',
  'generation_prepare',
  'generation_submit',
  'generation_job_get',
  'generation_job_get_batch',
  'generation_result_register',
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
  if (isEditingTool(record.toolName)) return editingToolActivityBlock(record)
  if (isArtifactTool(record.toolName)) return artifactToolActivityBlock(record)
  if (isDomainEditingHandoffTool(record.toolName)) return domainEditingHandoffActivityBlock(record)
  if (isResourceVideoCompatibilityTool(record.toolName)) return resourceVideoCompatibilityActivityBlock(record)
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
    return block(record, 'task', '旧异步任务交接', compactLines([
      '历史兼容记录；新的生成和剪辑流程使用明确的 generation_* 或 editing_task_* 工具。',
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

function editingToolActivityBlock(record: ToolActivityRecord): AgentActivityBlockItem {
  const failed = record.status === 'failed' || record.status === 'blocked' || !!record.error
  const statusLine = failed ? record.error ?? record.summary ?? '执行失败' : record.summary
  const normalized = normalizeToolName(record.toolName)
  const family = editingToolFamily(normalized)
  const lines = compactLines([
    editingToolDescription(family),
    statusLine,
  ])
  return block(record, editingToolKind(family, normalized), agentToolNameLabel(record.toolName), lines)
}

function artifactToolActivityBlock(record: ToolActivityRecord): AgentActivityBlockItem {
  const failed = record.status === 'failed' || record.status === 'blocked' || !!record.error
  const statusLine = failed ? record.error ?? record.summary ?? '执行失败' : record.summary
  const normalized = normalizeToolName(record.toolName)
  const lines = compactLines([
    artifactToolDescription(normalized),
    statusLine,
  ])
  return block(record, artifactToolKind(normalized), agentToolNameLabel(record.toolName), lines)
}

function domainEditingHandoffActivityBlock(record: ToolActivityRecord): AgentActivityBlockItem {
  const failed = record.status === 'failed' || record.status === 'blocked' || !!record.error
  const statusLine = failed ? record.error ?? record.summary ?? '执行失败' : record.summary
  return block(record, 'read', agentToolNameLabel(record.toolName), compactLines([
    domainEditingHandoffDescription(),
    statusLine,
  ]))
}

function resourceVideoCompatibilityActivityBlock(record: ToolActivityRecord): AgentActivityBlockItem {
  const failed = record.status === 'failed' || record.status === 'blocked' || !!record.error
  const statusLine = failed ? record.error ?? record.summary ?? '执行失败' : record.summary
  const normalized = normalizeToolName(record.toolName)
  return block(record, 'write', agentToolNameLabel(record.toolName), compactLines([
    resourceVideoCompatibilityDescription(normalized),
    statusLine,
  ]))
}

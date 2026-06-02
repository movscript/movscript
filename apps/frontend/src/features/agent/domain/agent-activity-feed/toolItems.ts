import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type { AgentActivityBlockItem, AgentActivityDebugDetail, AgentActivityItem, AgentActivityKind } from './types'
import {
  compactLines,
  numberValue,
  planTasksSummary,
  recordValue,
  stringValue,
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
  args?: unknown
  result?: unknown
  error?: string
  summary?: string
}

const CORE_TOOL_NAMES = new Set([
  'workspace_create',
  'core_file_edit',
  'workspace_apply_preview',
  'workspace_apply',
  'core_update_plan',
  'core_work_start',
  'core_work_wait',
  'core_work_get',
  'core_work_cancel',
  'generation_job_create',
  'candidate_asset_slot_attach',
  'candidate_keyframe_attach',
])

const WORK_STATUS_TOOL_NAMES = new Set([
  'core_work_start',
  'core_work_wait',
  'core_work_get',
  'core_work_cancel',
])

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
  if (!event.toolName || !WORK_STATUS_TOOL_NAMES.has(event.toolName)) return false

  const data = recordValue(event.data)
  const hasExecutionPayload = data?.args !== undefined || data?.result !== undefined || data?.error !== undefined
  if (hasExecutionPayload) return false

  const isWorkStatusTrace = data?.runtimeWork !== undefined || data?.generation !== undefined
  if (!isWorkStatusTrace) return false

  return steps.some((step) => {
    if (step.type !== 'tool_call' || step.toolName !== event.toolName) return false
    if (step.roundIndex !== undefined && event.roundIndex !== undefined) return step.roundIndex === event.roundIndex
    return true
  })
}

function latestToolEventData(events: ChatRunActivityEvent[]) {
  const event = [...events].reverse().find((candidate) => {
    const data = recordValue(candidate.data)
    return data?.args !== undefined || data?.result !== undefined
  })
  const data = recordValue(event?.data)
  return {
    args: data?.args,
    result: data?.result,
  }
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
  const args = recordValue(record.args)
  const result = recordValue(record.result)
  const failed = record.status === 'failed' || record.status === 'blocked' || !!record.error
  const statusLine = failed ? record.error ?? record.summary ?? '执行失败' : undefined

  if (record.toolName === 'workspace_create') {
    return block(record, 'workspace', '创建本地工作区', compactLines([
      workspaceIdLine(result),
      stringValue(args?.title) ? `标题：${stringValue(args?.title)}` : undefined,
      stringValue(args?.kind) ? `类型：${stringValue(args?.kind)}` : undefined,
      numberValue(args?.projectId) !== undefined ? `项目：#${numberValue(args?.projectId)}` : undefined,
      '项目数据尚未正式写入。',
      statusLine,
    ]))
  }

  if (record.toolName === 'core_file_edit') {
    return block(record, 'workspace', '修改工作区正文', compactLines([
      stringValue(args?.ref) ? `文件：${stringValue(args?.ref)}` : undefined,
      workspaceEditSummary(args, result),
      statusLine,
    ]), patchCodeView(args))
  }

  if (record.toolName === 'workspace_apply_preview') {
    return block(record, 'write', '预览正式应用', compactLines([
      workspaceIdLine(args) ?? workspaceIdLine(result),
      stringValue(result?.message),
      '这里只是预览，还没有写入项目。',
      statusLine,
    ]))
  }

  if (record.toolName === 'workspace_apply') {
    return block(record, 'write', '正式应用工作区', compactLines([
      workspaceIdLine(args) ?? workspaceIdLine(result),
      stringValue(result?.message),
      '项目数据已按工作区应用。',
      statusLine,
    ]))
  }

  if (record.toolName === 'core_update_plan') {
    return block(record, 'system', '更新执行计划', compactLines([
      stringValue(args?.explanation) ? `说明：${stringValue(args?.explanation)}` : undefined,
      planTasksSummary(args),
      statusLine,
    ]))
  }

  if (record.toolName === 'core_work_start') {
    const workKind = stringValue(args?.kind)
    return block(record, 'task', '提交异步任务', compactLines([
      workKind ? `类型：${workKindLabel(workKind)}` : undefined,
      workIdLine(result),
      generationRequestSummary(record.args),
      '任务已提交，后续结果会从 runtime work 返回。',
      statusLine,
    ]))
  }

  if (record.toolName === 'core_work_wait' || record.toolName === 'core_work_get' || record.toolName === 'core_work_cancel') {
    return block(record, 'task', workToolTitle(record.toolName), compactLines([
      workIdLine(args) ?? workIdLine(result),
      workStatusLine(result),
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

  return block(record, fallbackToolKind(record.toolName), agentToolNameLabel(record.toolName), compactLines([statusLine]))
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
  if (record.args === undefined && record.result === undefined && !record.error) return undefined
  return {
    ...(record.args !== undefined ? { args: record.args } : {}),
    ...(record.result !== undefined ? { result: record.result } : {}),
    ...(record.error ? { error: record.error } : {}),
  }
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

function workspaceIdLine(value: Record<string, unknown> | undefined): string | undefined {
  const workspaceId = stringValue(value?.workspaceId) ?? stringValue(value?.workspace_id) ?? stringValue(recordValue(value?.workspace)?.id) ?? stringValue(recordValue(value?.workspace)?.workspaceId)
  return workspaceId ? `工作区：${workspaceId}` : undefined
}

function workspaceEditSummary(args: Record<string, unknown> | undefined, result: Record<string, unknown> | undefined): string | undefined {
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
  const patchEdit = edits.map(recordValue).find((edit) => edit?.type === 'apply_patch' && typeof edit.patch === 'string')
  if (patchEdit) {
    return {
      label: 'Patch',
      text: compactPatchText(String(patchEdit.patch)),
    }
  }
  const replaceEdits = edits
    .map(recordValue)
    .filter((edit): edit is Record<string, unknown> => edit?.type === 'replace_text')
    .map((edit, index) => {
      const oldText = stringValue(edit.oldText) ?? ''
      const newText = stringValue(edit.newText) ?? ''
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

function workKindLabel(kind: string): string {
  if (kind === 'generation_job') return '生成任务'
  if (kind === 'subagent_run') return '子 agent 运行'
  return kind
}

function workToolTitle(toolName: string): string {
  if (toolName === 'core_work_wait') return '观察异步任务'
  if (toolName === 'core_work_cancel') return '取消异步任务'
  return '查看异步任务'
}

function workIdLine(value: Record<string, unknown> | undefined): string | undefined {
  const id = stringValue(value?.workId) ?? stringValue(value?.work_id) ?? stringValue(value?.id) ?? stringValue(recordValue(value?.work)?.id)
  return id ? `任务：${id}` : undefined
}

function workStatusLine(result: Record<string, unknown> | undefined): string | undefined {
  const status = stringValue(result?.status) ?? stringValue(recordValue(result?.work)?.status)
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

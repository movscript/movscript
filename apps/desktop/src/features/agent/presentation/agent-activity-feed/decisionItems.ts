import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'
import type { AgentActivityDecisionItem } from './types'
import { arrayValue, compactLines, idFromAliases, numberValue, planTasksSummary, recordValue, stringValue } from './values'

interface ModelDecisionToolCall {
  name: string
  args?: Record<string, unknown>
}

export function modelDecisionItems(activity: ChatRunActivity): AgentActivityDecisionItem[] {
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

import type { AgentTraceEvent } from '@/shared/infrastructure/providerSessionClient'
import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type {
  AgentTraceCategory,
  AgentTraceContextGroup,
  AgentTraceMessageDetail,
  AgentTraceModelDetail,
  AgentTraceModelMessageDetail,
  AgentTraceModelMessageGroup,
  AgentTraceModelToolDetail,
  AgentTracePromptDetail,
  AgentTracePromptMetric,
  AgentTracePromptPart,
  AgentTracePromptPartGroup,
  AgentTraceToolDetail,
  AgentTraceView,
} from './types'
import { traceCategoryLabel } from './labels'
import {
  arrayValue,
  booleanLabel,
  localizedTraceSummary,
  localizedTraceTitle,
  numberValue,
  recordValue,
  stringValue,
} from './traceHelpers'
import { traceContextGroups } from './contextGroups'
import { hasModelHTTPResponse, traceMessageDetail, traceModelDetail, traceToolDetail } from './traceDetails'
export { formatTraceEventDuration, traceEventDurationMs } from './traceHelpers'

export function agentTraceView(event: AgentTraceEvent): AgentTraceView {
  const data = recordValue(event.data)
  const eventType = stringValue(data?.eventType) ?? stringValue(data?.contextEventType)
  const phase = stringValue(data?.phase)
  const category = traceCategory(event, eventType, phase)
  return {
    category,
    categoryLabel: traceCategoryLabel(category),
    title: traceTitle(event, eventType, phase),
    summary: traceSummary(event),
    behavior: traceBehavior(event, data, eventType, phase),
    impact: traceImpact(event, data, eventType),
    contextGroups: traceContextGroups(event, data, eventType, phase),
    promptDetail: tracePromptDetail(event, data),
    modelDetail: traceModelDetail(event, data),
    messageDetail: traceMessageDetail(event, data),
    toolDetail: traceToolDetail(event, data),
  }
}

export function hasUnloadedTraceEvents(input: { loaded: number; total?: number; hasMore: boolean }): boolean {
  return input.hasMore || (typeof input.total === 'number' && input.loaded < input.total)
}

function traceCategory(event: AgentTraceEvent, eventType?: string, phase?: string): AgentTraceCategory {
  if (event.status === 'failed' || event.status === 'blocked' || event.kind === 'approval' || event.kind === 'input') return 'attention'
  if (eventType === 'context.ledger_updated' || eventType === 'context.item_deduped' || event.title.includes('Context ledger') || event.title.includes('deduped')) return 'impact'
  if (event.kind === 'tool_call' && event.title.startsWith('Generation ')) return 'impact'
  if (event.kind === 'assistant' || event.kind === 'message') return 'impact'
  if (event.kind === 'model_call' && (phase === 'request' || phase === 'response' || phase === 'retry' || phase === 'error' || event.title.includes('HTTP'))) return 'http'
  if (event.kind === 'permission') return 'decision'
  if (event.kind === 'context' || event.kind === 'prompt' || event.kind === 'memory' || event.kind === 'tool_catalog' || event.kind === 'manifest' || event.kind === 'skill') return 'context'
  return 'action'
}

function tracePromptDetail(event: AgentTraceEvent, data: Record<string, unknown> | undefined): AgentTracePromptDetail | undefined {
  if (event.kind !== 'prompt' || !data) return undefined
  const promptStats = recordValue(data.promptStats)
  const parts = arrayValue(promptStats?.parts)?.slice(0, 24).map((part, index) => {
    const record = recordValue(part)
    return {
      id: stringValue(record?.id) ?? `part_${index + 1}`,
      layer: localizedPromptLayer(stringValue(record?.layer)),
      contextLayer: localizedPromptContextLayer(stringValue(record?.contextLayer)),
      chars: numberValue(record?.chars) !== undefined ? String(numberValue(record?.chars)) : undefined,
    }
  }) ?? []
  const byLayer = metricEntries(recordValue(promptStats?.byLayer), localizedPromptLayer)
  const byContextLayer = metricEntries(recordValue(promptStats?.byContextLayer), localizedPromptContextLayer)
  const skills = arrayValue(data.skillIds)?.flatMap((item) => stringValue(item) ? [stringValue(item)!] : []) ?? []
  const tools = arrayValue(data.availableToolNames)?.flatMap((item) => stringValue(item) ? [stringValue(item)!] : []) ?? []
  if (!promptStats && skills.length === 0 && tools.length === 0) return undefined
  return {
    title: '模型上下文详情',
    totalChars: numberValue(promptStats?.totalChars) !== undefined ? String(numberValue(promptStats?.totalChars)) : numberValue(data.charCount) !== undefined ? String(numberValue(data.charCount)) : undefined,
    messageCount: numberValue(data.messageCount) !== undefined ? String(numberValue(data.messageCount)) : undefined,
    systemMessageCount: numberValue(data.systemMessageCount) !== undefined ? String(numberValue(data.systemMessageCount)) : undefined,
    blockedToolCount: numberValue(data.blockedToolCount) !== undefined ? String(numberValue(data.blockedToolCount)) : undefined,
    skills,
    tools,
    layers: byLayer,
    contextLayers: byContextLayer,
    partGroups: promptPartGroups(parts),
    parts,
  }
}

function promptPartGroups(parts: AgentTracePromptPart[]): AgentTracePromptPartGroup[] {
  const groups = new Map<string, { contextLayer: string; count: number; chars: number; parts: AgentTracePromptPart[] }>()
  for (const part of parts) {
    const key = part.contextLayer ?? '未分类'
    const group = groups.get(key) ?? { contextLayer: key, count: 0, chars: 0, parts: [] }
    group.count += 1
    group.chars += Number(part.chars ?? 0) || 0
    group.parts.push(part)
    groups.set(key, group)
  }
  return Array.from(groups.values())
    .sort((left, right) => right.chars - left.chars || left.contextLayer.localeCompare(right.contextLayer))
    .map((group) => ({
      contextLayer: group.contextLayer,
      count: group.count,
      chars: String(group.chars),
      parts: group.parts,
    }))
}

function metricEntries(record: Record<string, unknown> | undefined, labeler: (value: string | undefined) => string | undefined): AgentTracePromptMetric[] {
  if (!record) return []
  return Object.entries(record)
    .flatMap(([key, value]) => {
      const number = numberValue(value)
      if (number === undefined) return []
      return [{ label: labeler(key) ?? key, value: String(number) }]
    })
    .sort((left, right) => Number(right.value) - Number(left.value))
}

function localizedPromptLayer(layer: string | undefined): string | undefined {
  switch (layer) {
    case 'level0_core': return '核心契约'
    case 'level1_context': return '上下文'
    case 'level2_behavior': return '行为约束'
    case 'runtime_warnings': return 'Provider 警告'
    default: return layer
  }
}

function localizedPromptContextLayer(layer: string | undefined): string | undefined {
  switch (layer) {
    case 'runtime_contract': return 'Provider 契约'
    case 'focus': return '页面焦点'
    case 'behavior': return '行为约束'
    case 'thread_continuity': return '线程连续性'
    case 'warning': return '警告'
    case 'tool_result': return '工具结果'
    case 'memory': return '记忆'
    case 'reference': return '参考'
    default: return layer
  }
}

function traceTitle(event: AgentTraceEvent, eventType?: string, phase?: string): string {
  if (event.kind === 'prompt') return '组装模型上下文'
  if (event.kind === 'context' && eventType === 'context.run_built') return '建立本轮运行上下文'
  if (event.kind === 'context' && eventType === 'context.ledger_updated') return '更新可引用上下文'
  if (event.kind === 'context' && eventType === 'context.item_deduped') return '合并重复上下文'
  if (event.kind === 'context' && eventType === 'context.item_dropped') return '压缩工具结果'
  if (event.title === 'Runtime context resolved') return '读取页面和项目焦点'
  if (event.kind === 'model_call' && phase === 'request') return '发起模型 HTTP 请求'
  if (event.kind === 'model_call' && phase === 'response') return '收到模型 HTTP 响应'
  if (event.kind === 'model_call' && event.title === 'Model HTTP response received') return hasModelHTTPResponse(event) ? '收到模型 HTTP 响应' : '汇总模型输出'
  if (event.kind === 'model_call' && phase === 'retry') return '模型请求重试'
  if (event.kind === 'model_call' && phase === 'error') return '模型请求失败'
  if (event.kind === 'model_call' && event.title === 'Model route selected') return '选择模型路由'
  if (event.kind === 'assistant' && event.title === 'Assistant message created') return '写入历史消息'
  if (event.kind === 'permission') return '判断工具调用权限'
  if (event.kind === 'tool_call' && event.title.startsWith('Tool completed:')) return `执行工具：${agentToolNameLabel(event.toolName ?? event.title.replace(/^Tool completed:\s*/, ''))}`
  if (event.kind === 'tool_call' && event.title.startsWith('Tool call failed:')) return `工具失败：${agentToolNameLabel(event.toolName ?? event.title.replace(/^Tool call failed:\s*/, ''))}`
  if (event.kind === 'tool_call' && event.title.startsWith('Generation ')) return '更新生成任务状态'
  if (event.kind === 'input') return '等待用户补充信息'
  if (event.kind === 'approval') return '等待用户审批'
  if (event.kind === 'tool_catalog') return '解析可用工具'
  if (event.kind === 'skill') return '激活技能'
  if (event.kind === 'manifest') return '解析 Provider 配置'
  const localizedTitle = localizedTraceTitle(event.title)
  if (localizedTitle) return localizedTitle
  return event.title
}

function traceSummary(event: AgentTraceEvent): string | undefined {
  if (!event.summary) return undefined
  const localizedSummary = localizedTraceSummary(event.summary)
  if (localizedSummary) return localizedSummary
  return event.summary.replace(/_/g, ' ')
}

function traceBehavior(event: AgentTraceEvent, data: Record<string, unknown> | undefined, eventType?: string, phase?: string): string | undefined {
  if (event.kind === 'prompt') {
    const charCount = numberValue(data?.charCount)
    const messageCount = numberValue(data?.messageCount)
    const skillCount = arrayValue(data?.skillIds)?.length
    return [`准备发送给模型`, charCount !== undefined ? `${charCount} 字符` : undefined, messageCount !== undefined ? `${messageCount} 条消息` : undefined, skillCount !== undefined ? `${skillCount} 个技能` : undefined].filter(Boolean).join('，')
  }
  if (event.kind === 'model_call' && phase === 'request') return '向模型网关发送请求'
  if (event.kind === 'model_call' && phase === 'response') return '解析模型网关返回结果'
  if (event.kind === 'model_call' && event.title === 'Model HTTP response received') return hasModelHTTPResponse(event) ? '解析模型网关返回结果' : '记录模型本轮输出摘要'
  if (event.kind === 'assistant' && event.title === 'Assistant message created') return '把最终回复保存为 assistant 消息'
  if (event.kind === 'tool_call' && event.toolName) return `调用 ${agentToolNameLabel(event.toolName)}`
  if (event.kind === 'run' && event.title === 'Worker started') return '启动执行器运行，开始执行分配到的任务'
  if (event.kind === 'run' && event.title === 'Planner started') return '启动规划器运行，开始编排任务和子 agent'
  if (event.kind === 'permission') return '根据当前配置文件、风险等级和审批模式判断是否允许工具执行'
  if (event.kind === 'context' && eventType === 'context.run_built') return '把页面焦点、技能、工具和记忆整理成本轮运行输入'
  return undefined
}

function traceImpact(event: AgentTraceEvent, data: Record<string, unknown> | undefined, eventType?: string): string | undefined {
  if (eventType === 'context.ledger_updated') {
    const retrieved = numberValue(data?.retrievedCount)
    const artifacts = numberValue(data?.artifactRefCount)
    return `上下文账本现在包含 ${retrieved ?? 0} 个引用、${artifacts ?? 0} 个产物引用`
  }
  if (eventType === 'context.item_deduped') {
    const count = numberValue(data?.dedupedCount)
    return `合并了 ${count ?? 0} 个重复引用，避免重复进入后续上下文`
  }
  if (eventType === 'context.item_dropped') {
    const original = numberValue(data?.originalChars)
    const rendered = numberValue(data?.renderedChars)
    return `工具结果从 ${original ?? 0} 字符压缩到 ${rendered ?? 0} 字符`
  }
  if (event.kind === 'tool_call' && event.status === 'completed') return '工具结果会进入运行步骤，并可能作为下一轮模型上下文'
  if (event.kind === 'tool_call' && event.status === 'failed') return '本次工具没有成功，错误会反馈给模型或用户'
  if (event.kind === 'run' && event.title === 'Worker started') return '这个执行器的后续模型调用、工具调用和产物都会归到本次任务'
  if (event.kind === 'run' && event.title === 'Planner started') return '这个规划器的后续调度会创建或更新计划任务、执行器运行和任务产物'
  if (event.kind === 'assistant' && event.title === 'Assistant message created') return '这条消息会进入线程历史，后续运行可能把它带入模型请求上下文'
  if (event.kind === 'approval' || event.kind === 'input') return '运行暂停，等待用户处理后继续'
  return undefined
}

import type { AgentRun, AgentTraceEvent } from '../../../../state/shared/types.js'
import type { AgentModelCallSummary } from './types.js'

export function modelCallStatusLabel(status: AgentModelCallSummary['status']): string {
  switch (status) {
    case 'complete': return '请求和响应已关联'
    case 'request_only': return '缺少 HTTP 响应'
    case 'response_only': return '缺少请求事件'
    case 'result_only': return '只有模型结果'
    case 'failed': return '模型请求失败'
  }
}

export function modelCallIssue(status: AgentModelCallSummary['status']): string | undefined {
  switch (status) {
    case 'request_only': return '这次调用只看到 HTTP 请求，没有看到 HTTP 回复。服务端已使用全量 trace 计算，如果仍缺失，通常是请求被取消、异常中断或采集缺口。'
    case 'response_only': return '这次调用有 HTTP 回复，但全量 trace 里没有对应请求上下文。'
    case 'result_only': return '这条记录只是模型输出汇总，不是底层 HTTP 传输。'
    case 'failed': return '模型 HTTP 调用失败。请查看错误事件、相邻重试记录，以及是否保存了失败响应摘要。'
    default: return undefined
  }
}

export function skillTraceTitle(eventType: string | undefined, fallback: string): string {
  switch (eventType) {
    case 'skill.state_resolved': return '技能上下文已解析'
    case 'skill.state_requested': return '技能状态变更请求'
    default: return fallback
  }
}

export function runStatusLabel(status: AgentRun['status']): string {
  switch (status) {
    case 'queued': return '排队中'
    case 'in_progress': return '运行中'
    case 'requires_action': return '等待处理'
    case 'completed': return '已完成'
    case 'completed_with_warnings': return '完成但有警告'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
  }
}

export function runRoleLabel(role: AgentRun['role'] | undefined): string {
  switch (role) {
    case 'planner': return '规划器'
    case 'worker': return '执行器'
    default: return '-'
  }
}

export function traceKindLabel(kind: AgentTraceEvent['kind']): string {
  switch (kind) {
    case 'run': return '运行'
    case 'thread': return '线程'
    case 'message': return '消息'
    case 'context': return '上下文'
    case 'memory': return '记忆'
    case 'manifest': return '配置'
    case 'skill': return '技能'
    case 'tool_catalog': return '工具目录'
    case 'prompt': return '提示词'
    case 'permission': return '工具权限'
    case 'reasoning': return '推理'
    case 'tool_call': return '工具调用'
    case 'model_call': return '模型调用'
    case 'approval': return '审批'
    case 'input': return '输入'
    case 'assistant': return '助手'
    case 'task': return '任务'
    case 'taskGraph': return '计划'
    case 'error': return '错误'
  }
}

export function traceEventStatusLabel(status: AgentTraceEvent['status']): string {
  switch (status) {
    case 'started': return '已开始'
    case 'completed': return '已完成'
    case 'blocked': return '被阻塞'
    case 'failed': return '失败'
    case 'info': return '信息'
  }
}

export function localizedTraceTitle(event: AgentTraceEvent): string {
  if (event.kind === 'input') return '等待用户补充信息'
  if (event.kind === 'approval') return '等待用户审批'
  if (event.kind === 'model_call' && event.title === 'Model HTTP call failed') return '模型请求失败'
  if (event.kind === 'tool_call' && event.title.startsWith('Tool call failed:')) return `工具失败：${event.toolName ?? event.title.replace(/^Tool call failed:\s*/, '')}`
  return event.title
}

export function traceBehavior(event: AgentTraceEvent): string | undefined {
  if (event.kind === 'model_call') return '执行模型调用链路'
  if (event.kind === 'tool_call' && event.toolName) return `调用 ${event.toolName}`
  if (event.kind === 'approval') return '运行暂停等待审批'
  if (event.kind === 'input') return '运行暂停等待用户补充信息'
  return undefined
}

export function traceImpact(event: AgentTraceEvent): string | undefined {
  if (event.kind === 'approval' || event.kind === 'input') return '运行暂停，等待用户处理后继续'
  if (event.kind === 'tool_call' && event.status === 'failed') return '本次工具没有成功，错误会反馈给模型或用户'
  return undefined
}

export function localizedPromptLayer(layer: string | undefined): string | undefined {
  switch (layer) {
    case 'level0_core': return '核心契约'
    case 'level1_context': return '上下文'
    case 'level2_behavior': return '行为约束'
    case 'runtime_warnings': return '运行警告'
    default: return layer
  }
}

export function localizedPromptContextLayer(layer: string | undefined): string | undefined {
  switch (layer) {
    case 'runtime_contract': return '运行契约'
    case 'focus': return '页面焦点'
    case 'behavior': return '行为约束'
    case 'retrieved': return '检索上下文'
    case 'thread_continuity': return '线程连续性'
    case 'warning': return '警告'
    case 'tool_result': return '工具结果'
    case 'memory': return '记忆'
    case 'reference': return '参考'
    default: return layer
  }
}

export function formatMs(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${Math.round(value)}ms`
}

export function formatTimestamp(value: string): string {
  return value
}

export function previewText(value: string, limit = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized
}

export function previewJSON(value: unknown): string {
  try {
    return previewText(JSON.stringify(value, null, 2), 1000)
  } catch {
    return previewText(String(value), 1000)
  }
}

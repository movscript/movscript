import type { AgentApprovalRequest, AgentRun, AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'
import { isRecord } from '@/shared/domain/jsonValue'
import { agentPermissionLabel, agentRiskLabel } from '@/features/agent/domain/agentToolDisplay'
import type { AgentTraceCategory } from './types'

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

export function traceCategoryLabel(category: AgentTraceCategory): string {
  switch (category) {
    case 'context': return '上下文'
    case 'action': return '行为'
    case 'impact': return '影响'
    case 'http': return 'HTTP'
    case 'decision': return '决策'
    case 'attention': return '需关注'
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

export function traceEventStatusLabel(status: AgentTraceEvent['status']): string {
  switch (status) {
    case 'started': return '已开始'
    case 'completed': return '已完成'
    case 'blocked': return '被阻塞'
    case 'failed': return '失败'
    case 'info': return '信息'
  }
}

export function agentPlanStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return '待开始'
    case 'running': return '运行中'
    case 'blocked': return '被阻塞'
    case 'needs_review': return '待审阅'
    case 'done': return '已完成'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
    default: return unknownLabel('计划状态', status)
  }
}

export function approvalRiskLabel(risk: string): string {
  return agentRiskLabel(risk)
}

export function approvalPermissionLabel(permission: string): string {
  return agentPermissionLabel(permission)
}

export function approvalStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'pending': return '待处理'
    case 'approved': return '已同意'
    case 'rejected': return '已拒绝'
    case 'cancelled': return '已取消'
    case 'expired': return '已过期'
    default: return status ? unknownLabel('审批状态', status) : '-'
  }
}

export function runApprovalModeLabel(mode: string | undefined): string {
  switch (mode) {
    case 'interactive': return '交互确认'
    case 'auto_readonly': return '只读自动'
    case 'auto': return '自动执行'
    default: return mode ? unknownLabel('审批模式', mode) : '-'
  }
}

export function toolApprovalLabel(approval: string | undefined): string {
  switch (approval) {
    case 'never': return '无需审批'
    case 'always': return '每次审批'
    case 'on_write': return '写入时审批'
    default: return approval ? unknownLabel('工具审批', approval) : '-'
  }
}

export function toolGrantModeLabel(mode: string | undefined): string {
  switch (mode) {
    case 'allow': return '允许'
    case 'deny': return '禁用'
    default: return mode ? unknownLabel('授权模式', mode) : '-'
  }
}

export function approvalImpactLabel(approval: Pick<AgentApprovalRequest, 'toolName' | 'risk' | 'permission' | 'preview'>): string {
  const previewSideEffect = approvalPreviewSideEffect(approval.preview)
  if (previewSideEffect) return `批准后会执行预览变更：${previewSideEffect}`

  switch (approval.toolName) {
    case 'generation_job_create': return '批准后会创建生成任务，可能消耗生成额度。'
    case 'generation_job_cancel': return '批准后会取消生成任务，未完成的输出可能不再产生。'
    case 'movscript_project_create': return '批准后会创建项目数据。'
    case 'core_memory_delete': return '批准后会删除记忆，后续运行将无法再引用它。'
    case 'core_work_start': return '批准后会提交异步任务；生成任务可能消耗额度，子 agent 任务会启动 worker run。'
    case 'core_work_cancel': return '批准后会取消异步任务；未完成的输出或子 agent 后续执行可能不再产生。'
    default: break
  }

  const permission = approval.permission ?? ''
  if (permission === 'draft.apply') return '批准后会把草稿变更应用到当前项目。'
  if (permission.includes('generation')) return '批准后会影响生成任务。'
  if (permission.includes('project') && permission.includes('write')) return '批准后会写入项目数据。'
  if (permission.includes('draft') && permission.includes('write')) return '批准后会写入草稿数据。'
  if (permission.includes('memory') && permission.includes('write')) return '批准后会写入或更新记忆。'
  if (approval.risk === 'destructive') return '批准后可能执行不可逆操作。'
  if (approval.risk === 'write') return '批准后会执行写入类操作。'
  return '批准后本次运行会继续执行这个工具调用；拒绝则会阻止这次工具调用。'
}

export function inputTypeLabel(type: string): string {
  switch (type) {
    case 'choice': return '选择'
    case 'text': return '文本'
    case 'confirmation': return '确认'
    default: return unknownLabel('输入类型', type)
  }
}

function approvalPreviewSideEffect(preview: unknown): string | undefined {
  const previewRecord = recordValue(preview)
  const review = recordValue(previewRecord?.review)
  return stringValue(review?.sideEffect)
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function unknownLabel(scope: string, value: string): string {
  return `未知${scope} (${value})`
}

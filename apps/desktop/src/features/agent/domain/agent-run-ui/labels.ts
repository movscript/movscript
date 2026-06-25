import type { AgentApprovalRequest, AgentRun, AgentTraceEvent } from '@movscript/agent-protocol'
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

  const toolName = normalizeToolName(approval.toolName)
  switch (toolName) {
    case 'generation_submit': return '批准后会按所选能力提交生成任务；content-unit 图像/视频成功后会写入候选，可能消耗生成额度。'
    case 'generation_result_register': return '批准后会把已有生成资源登记为创作片段候选。'
    case 'generation_job_create': return '批准后会创建生成任务，可能消耗生成额度。'
    case 'generation_job_cancel': return '批准后会取消生成任务，未完成的输出可能不再产生。'
    case 'movscript_project_create': return '批准后会创建项目数据。'
    case 'core_memory_delete': return '批准后会删除记忆，后续运行将无法再引用它。'
    case 'core_work_start': return '旧运行记录兼容：批准后会交接旧异步任务；新的生成和剪辑流程应使用 generation_* 或 editing_task_*。'
    case 'core_work_cancel': return '旧运行记录兼容：批准后会取消旧异步任务；新的生成任务应使用明确的生成任务取消入口。'
    case 'movscript_resource_video_trim_to_resource':
    case 'system_resource_video_trim_to_resource':
      return '批准后会派生一个裁剪后的视频 RawResource；这只是中立素材准备，不会修改剪辑项目或写入候选。'
    case 'movscript_resource_video_compose_to_resource':
    case 'movscript_resource_video_concat_to_resource':
    case 'system_resource_video_compose_to_resource':
    case 'system_resource_video_concat_to_resource':
      return '批准后会执行资源级视频合成并生成 RawResource；它不会修改剪辑项目，产品剪辑应使用 editing_* 和 Electron mediaPipeline。'
    case 'domain_read_scene_moment_timeline':
    case 'domain_read_production_timeline':
      return '批准后只会读取 domain 到 MediaEditingProject 的交接数据；实际剪辑应继续使用 editing_*。'
    case 'system_artifact_upload_export':
    case 'system_artifact_upload_hls_stream':
      return '批准后会托管已完成的导出或 HLS 产物；不会执行剪辑，也不会写入业务候选。'
    case 'system_artifact_get_stream':
      return '批准后只会读取已托管媒体流的元数据或播放地址。'
    default: break
  }

  const permission = approval.permission ?? ''
  if (permission === 'workspace.apply') return '批准后会提交工作区修改，并交给前端审阅视图接收。'
  if (permission.includes('editing.task') && !permission.includes('read')) return '批准后会通过 Electron mediaPipeline 执行本地剪辑任务；后端不会承担剪辑渲染。'
  if (permission.includes('editing.candidate')) return '批准后会把 RawResource 剪辑导出写为业务候选；不会自动采纳为最终结果。'
  if (permission.includes('editing.export')) return '批准后会处理剪辑导出或资源导入；不会自动写入业务候选。'
  if (permission.includes('editing.timeline') || permission.includes('editing.project')) return '批准后会修改 MediaEditingProject 或剪辑时间线数据，不会直接渲染或调用 AI。'
  if (permission.includes('editing.runtime')) return '批准后只会读取本地剪辑运行时能力。'
  if (permission.includes('artifact') && (permission.includes('write') || permission.includes('upload') || permission.includes('publish'))) return '批准后会托管已完成的导出或 HLS 产物；不会执行剪辑，也不会写入业务候选。'
  if (permission.includes('artifact') && permission.includes('read')) return '批准后只会读取已托管媒体流的元数据或播放地址。'
  if (permission.includes('generation')) return '批准后会影响生成任务。'
  if (permission.includes('project') && permission.includes('write')) return '批准后会写入项目数据。'
  if (permission.includes('workspace') && permission.includes('write')) return '批准后会写入工作区数据。'
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

function normalizeToolName(toolName: string | undefined): string | undefined {
  return toolName?.replace(/^mcp__movscript__/, '')
}

function unknownLabel(scope: string, value: string): string {
  return `未知${scope} (${value})`
}

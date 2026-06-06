export type AgentToolDisplayTranslator = (key: string, options?: { defaultValue?: string } & Record<string, unknown>) => string

const TOOL_NAME_LABELS_ZH: Record<string, string> = {
  workspace_update: '刷新工作区投影',
  workspace_apply: '提交工作区修改',
  workspace_apply_review: '预览工作区提交',
  candidate_asset_slot_attach: '加入素材槽候选',
  candidate_keyframe_attach: '加入关键帧候选',
  generation_job_cancel: '取消生成任务',
  workspace_create: '创建工作区',
  generation_image_generate: '提交图像生成',
  generation_image_job_get: '查看图像生成任务',
  generation_video_generate: '提交视频生成',
  generation_video_job_get: '查看视频生成任务',
  generation_job_create: '创建生成任务',
  core_memory_create: '创建记忆',
  movscript_project_create: '创建项目',
  core_memory_delete: '删除记忆',
  read_file: '读取文件',
  search_file: '搜索文件',
  edit_file: '编辑文件',
  core_file_read: '读取文件',
  core_file_search: '搜索文件',
  core_file_edit: '编辑文件',
  core_update_plan: '更新执行计划',
  movscript_focus_get: '读取当前焦点',
  generation_job_get: '查看生成任务',
  reference_get: '读取参考',
  core_memory_get: '读取记忆',
  movscript_project_standards_get: '读取项目标准',
  core_catalog_inspect: '检查 Agent 工具目录',
  generation_job_list: '列出生成任务',
  generation_model_list: '查看生成模型',
  movscript_project_list: '列出项目',
  movscript_asset_slot_query: '查询素材槽',
  movscript_creative_reference_query: '查询创意参考',
  movscript_production_context_query: '查询制作上下文',
  movscript_script_locate: '读取项目剧本',
  core_user_input_request: '请求用户补充',
  reference_search: '搜索参考',
  core_memory_search: '搜索记忆',
  core_skill_update: '更新启用技能',
  core_work_cancel: '取消异步任务',
  core_work_get: '查看异步任务',
  core_work_list: '查看异步任务列表',
  core_work_start: '提交异步任务',
  core_work_wait: '观察异步任务',
}

const TOOL_NAME_I18N_KEYS: Record<string, string> = Object.fromEntries(
  Object.keys(TOOL_NAME_LABELS_ZH).map((name) => [name, `agents.tools.names.${name}`]),
)

const RISK_LABELS_ZH: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
  write: '写入',
  generate: '生成任务',
  destructive: '破坏性',
}

const PERMISSION_LABELS_ZH: Record<string, string> = {
  read: '读取',
  write: '写入',
  execute: '执行',
  network: '网络',
  filesystem: '文件系统',
  shell: '命令行',
  'agent.catalog.read': '读取 Agent 工具目录',
  'agent.input': '请求用户输入',
  'agent.taskGraph.read': '读取 Agent 执行计划',
  'agent.taskGraph.write': '更新 Agent 执行计划',
  'agent.work.read': '读取异步任务',
  'agent.work.write': '提交异步任务',
  'agent.skills.manage': '管理 Agent 技能',
  'asset.candidate.write': '写入素材候选',
  'workspace.apply': '提交工作区修改',
  'workspace.read': '读取工作区',
  'workspace.write': '写入工作区',
  'generation.create': '创建生成任务',
  'generation.read': '读取生成任务',
  'generation.cancel': '取消生成任务',
  'keyframe.candidate.write': '写入关键帧候选',
  'reference.read': '读取参考源',
  'memory.read': '记忆读取',
  'memory.write': '记忆写入',
  'model.generation.read': '读取生成模型',
  'model.image.generate': '生成图片',
  'model.video.generate': '生成视频',
  'project.read': '读取项目数据',
  'project.write': '写入项目数据',
  'work.read': '读取异步任务',
  'work.write': '提交异步任务',
}

export function agentToolNameLabel(toolName: string | undefined, t?: AgentToolDisplayTranslator): string {
  if (!toolName) return '-'
  const fallback = TOOL_NAME_LABELS_ZH[toolName] ?? formatUnknownToolName(toolName)
  const key = TOOL_NAME_I18N_KEYS[toolName]
  return key && t ? t(key, { defaultValue: fallback }) : fallback
}

export function agentToolNameWithId(toolName: string | undefined, t?: AgentToolDisplayTranslator): string {
  if (!toolName) return '-'
  const label = agentToolNameLabel(toolName, t)
  return label === toolName ? label : `${label} (${toolName})`
}

export function agentRiskLabel(risk: string, t?: AgentToolDisplayTranslator): string {
  const fallback = RISK_LABELS_ZH[risk]
  if (fallback) return t ? t(`agents.tools.risks.${risk}`, { defaultValue: fallback }) : fallback
  return unknownLabel('risk', '风险', risk, t)
}

export function agentPermissionLabel(permission: string, t?: AgentToolDisplayTranslator): string {
  const fallback = PERMISSION_LABELS_ZH[permission] ?? businessPermissionLabel(permission)
  if (fallback) return t ? t(`agents.tools.permissions.${permissionI18nKey(permission)}`, { defaultValue: fallback }) : fallback
  return unknownLabel('permission', '权限', permission, t)
}

function businessPermissionLabel(permission: string): string | undefined {
  const parts = permission.split(/[.:/]/).filter(Boolean)
  const domain = parts.includes('project')
    ? '项目'
    : parts.includes('workspace')
      ? '工作区'
      : parts.includes('memory')
        ? '记忆'
        : parts.includes('generation')
          ? '生成任务'
          : parts.includes('model')
            ? '模型'
            : parts.includes('reference')
              ? '参考源'
              : undefined
  const target = parts.includes('assets')
    ? '素材'
    : parts.includes('artifact') || parts.includes('artifacts')
      ? '产物'
      : parts.includes('thread') || parts.includes('threads')
        ? '线程'
        : ''
  const action = parts.includes('create')
    ? '创建'
    : parts.includes('cancel')
      ? '取消'
      : parts.includes('write')
        ? '写入'
        : parts.includes('read')
          ? '读取'
          : parts.includes('execute')
            ? '执行'
            : parts.includes('delete')
              ? '删除'
              : parts.includes('generate')
                ? '生成'
                : parts.includes('apply')
                  ? '应用'
                  : undefined
  if (!domain || !action) return undefined
  return `${domain}${target}${action}`
}

function formatUnknownToolName(toolName: string): string {
  return toolName
}

function permissionI18nKey(permission: string): string {
  return permission.replace(/[^a-zA-Z0-9_]/g, '_')
}

function unknownLabel(key: string, scope: string, value: string, t?: AgentToolDisplayTranslator): string {
  const fallback = `未识别${scope}：${value}`
  return t ? t(`agents.tools.unknown.${key}`, { value, defaultValue: fallback }) : fallback
}

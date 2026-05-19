export type AgentToolDisplayTranslator = (key: string, options?: { defaultValue?: string }) => string

const TOOL_NAME_LABELS_ZH: Record<string, string> = {
  movscript_apply_draft: '应用草稿',
  movscript_attach_asset_slot_candidate: '加入素材槽候选',
  movscript_attach_keyframe_candidate: '加入关键帧候选',
  movscript_cancel_generation_job: '取消生成任务',
  movscript_cancel_subagent: '取消子代理',
  movscript_create_draft: '创建草稿',
  movscript_create_generation_job: '创建生成任务',
  movscript_create_memory: '创建记忆',
  movscript_create_plan: '创建执行计划',
  movscript_create_project: '创建项目',
  movscript_delete_memory: '删除记忆',
  movscript_get_draft: '读取草稿',
  movscript_get_draft_model: '读取草稿模型',
  movscript_get_focus: '读取当前焦点',
  movscript_get_generation_job: '查看生成任务',
  movscript_get_knowledge: '读取知识',
  movscript_get_memory: '读取记忆',
  movscript_get_plan: '读取执行计划',
  movscript_get_project_standards: '读取项目标准',
  movscript_inspect_agent_catalog: '检查 Agent 工具目录',
  movscript_list_generation_jobs: '列出生成任务',
  movscript_list_models: '查看生成模型',
  movscript_list_projects: '列出项目',
  movscript_list_subagents: '列出子代理',
  movscript_query_asset_slots: '查询素材槽',
  movscript_query_creative_references: '查询创意参考',
  movscript_query_production_context: '查询制作上下文',
  movscript_read_project_scripts: '读取项目剧本',
  movscript_replan: '重新规划',
  movscript_request_user_input: '请求用户补充',
  movscript_search_knowledge: '搜索知识',
  movscript_search_memories: '搜索记忆',
  movscript_spawn_subagent: '启动子代理',
  movscript_update_active_skills: '更新启用技能',
  movscript_update_draft: '更新草稿',
  movscript_wait_subagent: '等待子代理',
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
  'generation.create': '创建生成任务',
  'generation.read': '读取生成任务',
  'generation.cancel': '取消生成任务',
  'model.generation.read': '读取生成模型',
  'model.image.generate': '生成图片',
  'model.video.generate': '生成视频',
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
  return unknownLabel('风险', risk)
}

export function agentPermissionLabel(permission: string, t?: AgentToolDisplayTranslator): string {
  const fallback = PERMISSION_LABELS_ZH[permission] ?? businessPermissionLabel(permission)
  if (fallback) return t ? t(`agents.tools.permissions.${permissionI18nKey(permission)}`, { defaultValue: fallback }) : fallback
  return unknownLabel('权限', permission)
}

function businessPermissionLabel(permission: string): string | undefined {
  const parts = permission.split(/[.:/]/).filter(Boolean)
  const domain = parts.includes('project')
    ? '项目'
    : parts.includes('draft')
      ? '草稿'
      : parts.includes('memory')
        ? '记忆'
        : parts.includes('generation')
          ? '生成任务'
          : parts.includes('model')
            ? '模型'
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

function unknownLabel(scope: string, value: string): string {
  return `未知${scope} (${value})`
}

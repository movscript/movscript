export type AgentToolDisplayTranslator = (key: string, options?: { defaultValue?: string } & Record<string, unknown>) => string

const TOOL_NAME_LABELS_ZH: Record<string, string> = {
  workspace_fetch: '拉取工作区',
  workspace_status: '检查工作区状态',
  workspace_review: '审阅工作区',
  workspace_submit: '提交工作区',
  workspace_update: '刷新工作区投影',
  workspace_apply: '提交工作区修改',
  workspace_apply_review: '预览工作区提交',
  generation_job_cancel: '取消生成任务',
  workspace_create: '创建工作区',
  generation_image_generate: '提交图像生成',
  generation_content_unit_image_generate: '生成创作片段图像',
  generation_image_job_get: '查看图像生成任务',
  generation_content_unit_image_job_get: '写入图像候选',
  generation_video_generate: '提交视频生成',
  generation_content_unit_video_generate: '生成创作片段视频',
  generation_video_job_get: '查看视频生成任务',
  generation_content_unit_video_job_get: '写入视频候选',
  generation_audio_generate: '提交音频生成',
  generation_audio_job_get: '查看音频生成任务',
  movscript_shot_library_query: '查询镜头库',
  movscript_shot_group_create: '创建镜头组',
  movscript_shot_group_get: '读取镜头组',
  movscript_shot_group_add_shots: '写入镜头组镜头',
  movscript_video_shot_cuts_analyze: '分析视频切镜头',
  movscript_resource_video_extract_frames: '抽取视频帧',
  movscript_resource_upload: '上传资源',
  domain_upsert_storyboard: '创建或更新分镜',
  system_shot_library_query: '查询镜头库',
  system_shot_group_create: '创建镜头组',
  system_shot_group_get: '读取镜头组',
  system_shot_group_add_shots: '写入镜头组镜头',
  system_video_shot_cuts_analyze: '分析视频切镜头',
  system_generate_content_unit_image: '生成创作片段图像',
  system_generate_content_unit_image_job_get: '写入图像候选',
  system_generate_content_unit_video: '生成创作片段视频',
  system_generate_content_unit_video_job_get: '写入视频候选',
  system_resource_video_extract_frames: '抽取视频帧',
  system_resource_upload: '上传资源',
  generation_job_create: '创建生成任务',
  core_memory_create: '创建记忆',
  movscript_project_create: '创建项目',
  movscript_resource_video_trim_to_resource: '中立裁剪视频资源',
  movscript_resource_video_compose_to_resource: '资源级合成视频',
  movscript_resource_video_concat_to_resource: '资源级拼接视频',
  system_resource_video_trim_to_resource: '中立裁剪视频资源',
  system_resource_video_compose_to_resource: '资源级合成视频',
  system_resource_video_concat_to_resource: '资源级拼接视频',
  domain_read_scene_moment_timeline: '读取场景剪辑交接',
  domain_read_production_timeline: '读取成片剪辑交接',
  editing_project_create: '创建剪辑项目',
  editing_project_create_from_edit_plan: '从剪辑计划创建项目',
  editing_project_get: '读取剪辑项目',
  editing_project_update_settings: '更新剪辑项目设置',
  editing_project_add_asset: '添加剪辑素材',
  editing_project_remove_asset: '移除剪辑素材',
  editing_project_save: '保存剪辑项目',
  editing_timeline_apply_commands: '批量应用剪辑命令',
  editing_timeline_add_track: '添加剪辑轨道',
  editing_timeline_remove_track: '移除剪辑轨道',
  editing_timeline_add_clip: '添加剪辑片段',
  editing_timeline_update_clip: '更新剪辑片段',
  editing_timeline_split_clip: '切分剪辑片段',
  editing_timeline_move_clip: '移动剪辑片段',
  editing_timeline_delete_clip: '删除剪辑片段',
  editing_timeline_validate: '校验剪辑时间线',
  editing_runtime_capabilities_get: '检查本地剪辑能力',
  editing_task_render_create: '创建剪辑渲染任务',
  editing_task_hls_create: '创建 HLS 打包任务',
  editing_task_transcode_create: '创建本地转码任务',
  editing_task_reframe_create: '创建画幅重构任务',
  editing_task_get: '查看剪辑任务',
  editing_task_cancel: '取消剪辑任务',
  editing_task_logs_get: '读取剪辑任务日志',
  editing_export_save_local: '保存本地剪辑导出',
  editing_export_import_resource: '导入剪辑导出资源',
  editing_export_publish_hls: '发布剪辑 HLS',
  editing_export_create_candidate: '创建剪辑候选',
  system_artifact_upload_export: '上传导出产物',
  system_artifact_upload_hls_stream: '发布托管 HLS',
  system_artifact_get_stream: '读取托管媒体流',
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
  'editing.project.read': '读取剪辑项目',
  'editing.project.write': '写入剪辑项目',
  'editing.timeline.read': '读取剪辑时间线',
  'editing.timeline.write': '写入剪辑时间线',
  'editing.runtime.read': '读取本地剪辑能力',
  'editing.task.read': '读取剪辑任务',
  'editing.task.write': '执行剪辑任务',
  'editing.task.cancel': '取消剪辑任务',
  'editing.export.read': '读取剪辑导出',
  'editing.export.write': '写入剪辑导出',
  'editing.candidate.write': '写入剪辑候选',
  'artifact.export.write': '上传导出产物',
  'artifact.stream.write': '发布托管媒体流',
  'artifact.stream.read': '读取托管媒体流',
  'artifact.write': '写入产物托管',
  'artifact.read': '读取产物托管',
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
  const normalized = normalizeAgentToolName(toolName)
  const fallback = TOOL_NAME_LABELS_ZH[normalized] ?? formatUnknownToolName(normalized)
  const key = TOOL_NAME_I18N_KEYS[normalized]
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
        : parts.includes('editing')
          ? '剪辑'
          : parts.includes('artifact') || parts.includes('artifacts')
            ? '产物托管'
            : parts.includes('generation')
              ? '生成任务'
              : parts.includes('model')
                ? '模型'
                : parts.includes('reference')
                  ? '参考源'
                  : undefined
  const target = parts.includes('timeline')
    ? '时间线'
    : parts.includes('runtime')
      ? '能力'
      : parts.includes('task')
        ? '任务'
        : parts.includes('export')
          ? '导出'
          : parts.includes('stream') || parts.includes('streams')
            ? '媒体流'
            : parts.includes('candidate')
              ? '候选'
              : parts.includes('assets')
                ? '素材'
                : parts.includes('thread') || parts.includes('threads')
                  ? '线程'
                  : ''
  const action = parts.includes('create')
    ? '创建'
    : parts.includes('cancel')
      ? '取消'
      : parts.includes('upload')
        ? '上传'
        : parts.includes('publish')
          ? '发布'
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
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_.:/-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || toolName
}

function normalizeAgentToolName(toolName: string): string {
  return toolName.replace(/^mcp__movscript__/, '')
}

function permissionI18nKey(permission: string): string {
  return permission.replace(/[^a-zA-Z0-9_]/g, '_')
}

function unknownLabel(key: string, scope: string, value: string, t?: AgentToolDisplayTranslator): string {
  const fallback = `未识别${scope}：${value}`
  return t ? t(`agents.tools.unknown.${key}`, { value, defaultValue: fallback }) : fallback
}

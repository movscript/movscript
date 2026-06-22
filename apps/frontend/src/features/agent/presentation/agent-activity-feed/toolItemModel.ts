import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type { AgentActivityBlockItem, AgentActivityDebugDetail, AgentActivityKind } from './types'

export interface ToolActivityRecord {
  id: string
  toolName: string
  status: string
  createdAt: string
  durationMs?: number
  roundIndex?: number
  roundLabel?: string
  completedAt?: string
  error?: string
  summary?: string
}

export function isGenerationSubmitTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  return normalized === 'generation_image_generate'
    || normalized === 'generation_content_unit_image_generate'
    || normalized === 'system_generate_content_unit_image'
    || normalized === 'generation_video_generate'
    || normalized === 'generation_content_unit_video_generate'
    || normalized === 'system_generate_content_unit_video'
    || normalized === 'generation_audio_generate'
    || normalized === 'generation_voiceover_generate'
    || normalized === 'system_generate_voiceover'
    || normalized === 'generation_music_generate'
    || normalized === 'system_generate_music'
    || normalized === 'generation_sfx_generate'
    || normalized === 'system_generate_sfx'
    || normalized === 'generation_subtitle_generate'
    || normalized === 'system_generate_subtitle'
    || normalized === 'generation_subtitle_align'
    || normalized === 'system_align_subtitle'
    || normalized === 'generation_subtitle_translate'
    || normalized === 'system_translate_subtitle'
    || normalized === 'generation_job_create'
}

export function block(
  record: ToolActivityRecord,
  kind: AgentActivityKind,
  title: string,
  lines: string[],
  code?: AgentActivityBlockItem['code'],
): AgentActivityBlockItem {
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

export function toolDebugDetail(record: ToolActivityRecord): AgentActivityDebugDetail | undefined {
  if (!record.error) return undefined
  return { error: record.error }
}

export function fallbackToolText(record: ToolActivityRecord): string {
  const label = agentToolNameLabel(record.toolName)
  const prefix = statusPrefix(record.status)
  const normalized = normalizeToolName(record.toolName)
  if (record.error) return `${label}失败：${record.error}`
  if (isReadTool(record.toolName)) return `${prefix}读取数据：${label}`
  if (normalized.includes('search')) return `${prefix}搜索数据：${label}`
  if (normalized.includes('list')) return `${prefix}查看列表：${label}`
  if (normalized.includes('create') || normalized.includes('start') || normalized.includes('spawn')) return `${prefix}启动任务：${label}`
  if (normalized.includes('apply') || normalized.includes('attach') || normalized.includes('edit')) return `${prefix}写入数据：${label}`
  return `${prefix}${label}`
}

export function fallbackToolKind(toolName: string): AgentActivityKind {
  const normalized = normalizeToolName(toolName)
  if (isEditingTool(normalized)) return editingToolKind(editingToolFamily(normalized), normalized)
  if (isArtifactTool(normalized)) return artifactToolKind(normalized)
  if (normalized.startsWith('workspace_')) return 'workspace'
  if (normalized.includes('apply') || normalized.includes('attach') || normalized.includes('edit') || normalized.includes('delete')) return 'write'
  if (normalized.includes('generation') || normalized.includes('operation') || normalized.includes('subagent')) return 'task'
  if (isReadTool(toolName)) return 'read'
  return 'system'
}

function statusPrefix(status: string): string {
  if (status === 'in_progress' || status === 'started') return '正在'
  if (status === 'failed' || status === 'blocked') return ''
  return '已'
}

function isReadTool(toolName: string) {
  const normalized = normalizeToolName(toolName)
  return normalized.includes('read')
    || normalized.includes('get')
    || normalized.includes('query')
    || normalized.includes('list')
    || normalized.includes('search')
    || normalized.includes('inspect')
}

export function isEditingTool(toolName: string): boolean {
  return normalizeToolName(toolName).startsWith('editing_')
}

export function isArtifactTool(toolName: string): boolean {
  return normalizeToolName(toolName).startsWith('system_artifact_')
}

export function isDomainEditingHandoffTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  return normalized === 'domain_read_scene_moment_timeline'
    || normalized === 'domain_read_production_timeline'
}

export function isResourceVideoCompatibilityTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  return normalized === 'movscript_resource_video_trim_to_resource'
    || normalized === 'movscript_resource_video_compose_to_resource'
    || normalized === 'movscript_resource_video_concat_to_resource'
    || normalized === 'system_resource_video_trim_to_resource'
    || normalized === 'system_resource_video_compose_to_resource'
    || normalized === 'system_resource_video_concat_to_resource'
}

export function normalizeToolName(toolName: string): string {
  return toolName.replace(/^mcp__movscript__/, '')
}

export function editingToolFamily(toolName: string): 'project' | 'timeline' | 'runtime' | 'task' | 'export' {
  if (toolName.startsWith('editing_project_')) return 'project'
  if (toolName.startsWith('editing_timeline_')) return 'timeline'
  if (toolName.startsWith('editing_runtime_')) return 'runtime'
  if (toolName.startsWith('editing_task_')) return 'task'
  return 'export'
}

export function editingToolKind(
  family: 'project' | 'timeline' | 'runtime' | 'task' | 'export',
  toolName: string,
): AgentActivityKind {
  if (family === 'runtime') return 'read'
  if (family === 'task') return toolName.endsWith('_get') || toolName.endsWith('_logs_get') ? 'read' : 'task'
  if (family === 'project' && toolName.endsWith('_get')) return 'read'
  if (family === 'timeline' && toolName.endsWith('_validate')) return 'read'
  return 'write'
}

export function editingToolDescription(family: 'project' | 'timeline' | 'runtime' | 'task' | 'export'): string {
  switch (family) {
    case 'project': return '正在处理 MediaEditingProject 项目数据。'
    case 'timeline': return '正在修改或校验剪辑时间线。'
    case 'runtime': return '正在检查 Electron mediaPipeline 与 FFmpeg 能力。'
    case 'task': return '正在通过 Electron mediaPipeline 处理本地媒体任务。'
    case 'export': return '正在处理剪辑导出、本地保存、资源导入或 RawResource 候选写入。'
  }
}

export function artifactToolKind(toolName: string): AgentActivityKind {
  return toolName.endsWith('_get_stream') || toolName.endsWith('_get') ? 'read' : 'write'
}

export function artifactToolDescription(toolName: string): string {
  if (toolName === 'system_artifact_upload_export') return '正在把已完成的本地导出上传为 RawResource。'
  if (toolName === 'system_artifact_upload_hls_stream') return '正在发布已完成的 HLS manifest/segments 为托管媒体流。'
  if (toolName === 'system_artifact_get_stream') return '正在读取托管媒体流的播放信息。'
  return '正在处理已完成产物的托管信息。'
}

export function domainEditingHandoffDescription(): string {
  return '正在读取 domain 到 MediaEditingProject 的交接数据；实际剪辑应继续使用 editing_*。'
}

export function resourceVideoCompatibilityDescription(toolName: string): string {
  if (toolName.endsWith('_trim_to_resource')) {
    return '这是中立视频素材准备，会生成新的 RawResource；不能替代剪辑时间线裁剪。'
  }
  return '这是资源级视频合成工具，只生成新的 RawResource；产品剪辑、拼接和导出应使用 editing_* 与 Electron mediaPipeline。'
}

export function workToolTitle(toolName: string): string {
  if (toolName === 'core_work_wait') return '观察旧异步任务'
  if (toolName === 'core_work_cancel') return '取消旧异步任务'
  return '查看旧异步任务'
}

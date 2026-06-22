import type { AgentRun } from '@movscript/core/agent/protocol'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'
import { isAgentRunTerminalStatus } from '@movscript/core/agent/protocol'

export function hasAgentAsyncWorkHandoffActivity(input: {
  activity?: ChatRunActivity
}): boolean {
  const activity = input.activity
  if (!activity) return false
  return hasAsyncWorkStart(activity)
}

export function isAgentAsyncWorkHandoffRun(run: AgentRun | null | undefined): boolean {
  if (!run || !isAgentRunTerminalStatus(run.status)) return false
  return run.steps.some((step) => step.type === 'tool_call' && isAsyncHandoffTool(step.toolName))
}

function hasAsyncWorkStart(activity: ChatRunActivity): boolean {
  const step = [...(activity.steps ?? [])].reverse().find((item) => item.type === 'tool_call' && isAsyncHandoffTool(item.toolName))
  const event = [...(activity.events ?? [])].reverse().find((item) => item.kind === 'tool_call' && isAsyncHandoffTool(item.toolName))
  return !!step || !!event
}

export function isAsyncHandoffTool(toolName: string | undefined): boolean {
  const normalized = normalizeToolName(toolName)
  return isGenerationSubmitTool(normalized)
    || isEditingTaskCreateTool(normalized)
    || isLegacyCoreWorkStartTool(normalized)
}

export function isLegacyCoreWorkTool(toolName: string | undefined): boolean {
  const normalized = normalizeToolName(toolName)
  return normalized === 'core_work_start'
    || normalized === 'core_work_wait'
    || normalized === 'core_work_get'
    || normalized === 'core_work_cancel'
    || normalized === 'core_work_list'
}

function isLegacyCoreWorkStartTool(toolName: string | undefined): boolean {
  return normalizeToolName(toolName) === 'core_work_start'
}

function isGenerationSubmitTool(toolName: string | undefined): boolean {
  return toolName === 'generation_image_generate'
    || toolName === 'generation_content_unit_image_generate'
    || toolName === 'system_generate_content_unit_image'
    || toolName === 'generation_video_generate'
    || toolName === 'generation_content_unit_video_generate'
    || toolName === 'system_generate_content_unit_video'
    || toolName === 'generation_audio_generate'
    || toolName === 'generation_voiceover_generate'
    || toolName === 'system_generate_voiceover'
    || toolName === 'generation_music_generate'
    || toolName === 'system_generate_music'
    || toolName === 'generation_sfx_generate'
    || toolName === 'system_generate_sfx'
    || toolName === 'generation_subtitle_generate'
    || toolName === 'system_generate_subtitle'
    || toolName === 'generation_subtitle_align'
    || toolName === 'system_align_subtitle'
    || toolName === 'generation_subtitle_translate'
    || toolName === 'system_translate_subtitle'
    || toolName === 'generation_job_create'
}

function isEditingTaskCreateTool(toolName: string | undefined): boolean {
  return toolName === 'editing_task_render_create'
    || toolName === 'editing_task_hls_create'
    || toolName === 'editing_task_transcode_create'
    || toolName === 'editing_task_reframe_create'
}

function normalizeToolName(toolName: string | undefined): string | undefined {
  return toolName?.replace(/^mcp__movscript__/, '')
}

import type { MCPTool } from '../../protocol/types'
import imageGenerateTool from './image-generate.tool.json'
import imageJobGetTool from './image-job-get.tool.json'
import videoGenerateTool from './video-generate.tool.json'
import videoJobGetTool from './video-job-get.tool.json'
import audioGenerateTool from './audio-generate.tool.json'
import audioJobGetTool from './audio-job-get.tool.json'
import { objectSchema } from '../schema'

type AgentCatalogTool = {
  name: string
  description: string
  inputSchema: MCPTool['inputSchema']
  outputSchema?: MCPTool['outputSchema']
}

export function generationTools(): MCPTool[] {
  return [
    mcpTool(imageGenerateTool as AgentCatalogTool),
    contentUnitGenerateTool(
      'generation_content_unit_image_generate',
      'Compile a content-unit backend prompt, submit an image generation job, and bind the job to automatic content-candidate creation when the job succeeds. Use this as the primary content-unit image generation path; system_generate_image remains the low-level prompt channel.',
      'image',
    ),
    mcpTool(imageJobGetTool as AgentCatalogTool),
    contentUnitJobGetTool(
      'generation_content_unit_image_job_get',
      'Fetch a content-unit image generation job and automatically create or refresh content-unit candidates for successful output_resource_ids.',
    ),
    generationJobGetBatchTool('generation_image_job_get_batch', 'Synchronously fetch the latest state of multiple image generation jobs submitted by generation_image_generate. Results are returned in input order with per-job errors.'),
    mcpTool(videoGenerateTool as AgentCatalogTool),
    contentUnitGenerateTool(
      'generation_content_unit_video_generate',
      'Compile a content-unit backend prompt, submit a video generation job, and bind the job to automatic content-candidate creation when the job succeeds. Use this as the primary content-unit video generation path; system_generate_video remains the low-level prompt channel.',
      'video',
    ),
    mcpTool(videoJobGetTool as AgentCatalogTool),
    contentUnitJobGetTool(
      'generation_content_unit_video_job_get',
      'Fetch a content-unit video generation job and automatically create or refresh content-unit candidates for successful output_resource_ids.',
    ),
    generationJobGetBatchTool('generation_video_job_get_batch', 'Synchronously fetch the latest state of multiple video generation jobs submitted by generation_video_generate. Results are returned in input order with per-job errors.'),
    mcpTool(audioGenerateTool as AgentCatalogTool),
    audioSubmitTool('generation_voiceover_generate', 'Submit a voiceover/text-to-speech AI generation job and return its job id. This creates an audio RawResource when complete; it does not edit timelines or write candidates.'),
    audioSubmitTool('generation_music_generate', 'Submit an AI music generation job and return its job id. This creates an audio RawResource when complete; it does not edit timelines or write candidates.'),
    audioSubmitTool('generation_sfx_generate', 'Submit an AI sound-effect generation job and return its job id. This creates an audio RawResource when complete; it does not edit timelines or write candidates.'),
    audioSubmitTool('generation_subtitle_generate', 'Submit an audio transcription/subtitle generation job and return its job id. This creates subtitle/timing resources when complete; it does not burn subtitles into video.'),
    audioSubmitTool('generation_subtitle_align', 'Submit a subtitle forced-alignment job and return its job id. This aligns script/subtitle text to audio/video timing; it does not burn subtitles into video.'),
    audioSubmitTool('generation_subtitle_translate', 'Submit a subtitle translation job and return its job id. This translates subtitle text while preserving timing metadata when supported.'),
    mcpTool(audioJobGetTool as AgentCatalogTool),
    generationJobGetBatchTool('generation_audio_job_get_batch', 'Synchronously fetch the latest state of multiple audio generation jobs submitted by generation_audio_generate. Results are returned in input order with per-job errors.'),
  ]
}

function contentUnitGenerateTool(name: string, description: string, kind: 'image' | 'video'): MCPTool {
  const base = (kind === 'image' ? imageGenerateTool : videoGenerateTool) as AgentCatalogTool
  return {
    name,
    description,
    inputSchema: objectSchema(
      {
        ...base.inputSchema.properties,
        contentUnitId: { type: ['string', 'number'], description: 'Target MovScript content unit id. The tool compiles this content unit prompt before generation.' },
        content_unit_id: { type: ['string', 'number'], description: 'Alias for contentUnitId.' },
      },
    ),
    ...(base.outputSchema ? { outputSchema: base.outputSchema } : {}),
  }
}

function contentUnitJobGetTool(name: string, description: string): MCPTool {
  return {
    name,
    description,
    inputSchema: objectSchema(
      {
        jobId: { type: 'number', minimum: 1 },
        job_id: { type: 'number', minimum: 1 },
        projectDir: { type: 'string', description: 'MovScript project source directory used when creating successful candidates.' },
        project_dir: { type: 'string', description: 'Alias for projectDir.' },
        cwd: { type: 'string', description: 'Alias for projectDir.' },
        projectUid: { type: 'string', description: 'Optional manifest project_uid used for scoped candidate metadata.' },
        project_uid: { type: 'string', description: 'Alias for projectUid.' },
        contentUnitId: { type: ['string', 'number'], description: 'Target MovScript content unit id for automatic candidate creation.' },
        content_unit_id: { type: ['string', 'number'], description: 'Alias for contentUnitId.' },
        outputKind: { type: 'string', enum: ['image', 'video'] },
        output_kind: { type: 'string', enum: ['image', 'video'] },
        promptSnapshot: { type: 'object', additionalProperties: true },
        prompt_snapshot: { type: 'object', additionalProperties: true },
        verbosity: { type: 'string', enum: ['summary', 'debug'], description: 'Use summary for compact polling output; debug includes the full backend job payload.' },
      },
    ),
    outputSchema: objectSchema(
      {
        status: { type: 'string' },
        generation_mode: { type: 'string' },
        candidate_policy: { type: 'string' },
        will_auto_select: { type: 'boolean' },
        requires_user_adoption: { type: 'boolean' },
        jobId: { type: 'number' },
        job_id: { type: 'number' },
        contentUnitId: { type: ['string', 'number'] },
        content_unit_id: { type: ['string', 'number'] },
        terminal: { type: 'boolean' },
        outputResourceIds: { type: 'array', items: { type: 'number' } },
        output_resource_ids: { type: 'array', items: { type: 'number' } },
        candidate_created: { type: 'boolean' },
        candidate_count: { type: 'number' },
        candidates: { type: 'array', items: { type: 'object', additionalProperties: true } },
        selected_candidate: { type: 'object', additionalProperties: true },
        selected_raw_resource: { type: 'object', additionalProperties: true },
        stale_status: { type: 'string' },
        frontend: { type: 'object', additionalProperties: true },
        job: { type: 'object' },
      },
      ['status', 'jobId', 'terminal', 'contentUnitId'],
    ),
  }
}

function mcpTool(tool: AgentCatalogTool): MCPTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
  }
}

function audioSubmitTool(name: string, description: string): MCPTool {
  const base = audioGenerateTool as AgentCatalogTool
  return {
    name,
    description,
    inputSchema: base.inputSchema,
    ...(base.outputSchema ? { outputSchema: base.outputSchema } : {}),
  }
}

function generationJobGetBatchTool(name: string, description: string): MCPTool {
  return {
    name,
    description,
    inputSchema: objectSchema(
      {
        jobIds: { type: 'array', items: { type: 'number' }, description: 'Generation job IDs.' },
        job_ids: { type: 'array', items: { type: 'number' }, description: 'Alias for jobIds.' },
        items: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Optional item array. Each item may include jobId or job_id.' },
        verbosity: { type: 'string', enum: ['summary', 'debug'], description: 'Use summary for compact polling output; debug includes the full backend job payload.' },
      },
    ),
    outputSchema: objectSchema(
      {
        status: { type: 'string' },
        total: { type: 'number' },
        success_count: { type: 'number' },
        failed_count: { type: 'number' },
        terminal_count: { type: 'number' },
        all_terminal: { type: 'boolean' },
        output_resource_ids: { type: 'array', items: { type: 'number' } },
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
        message: { type: 'string' },
      },
      ['status', 'total', 'success_count', 'failed_count', 'terminal_count', 'all_terminal', 'items', 'message']
    ),
  }
}

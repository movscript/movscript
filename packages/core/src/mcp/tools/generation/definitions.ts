import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function generationTools(): MCPTool[] {
  return [
    generationCapabilityListTool(),
    generationPrepareTool(),
    generationSubmitTool(),
    generationJobGetTool(),
    generationJobGetBatchTool(),
    generationResultRegisterTool(),
  ]
}

const GENERATION_CAPABILITIES = [
  'image_generation',
  'video_generation',
  'audio_generation',
  'image',
  'image_edit',
  'video',
  'video_i2v',
  'video_v2v',
  'audio_tts',
  'audio_transcribe',
  'audio_translate',
  'audio_music',
  'audio_sfx',
  'audio_chat',
  'voice_clone',
  'voice_design',
  'subtitle_align',
  'subtitle_translate',
] as const

function generationCapabilityListTool(): MCPTool {
  return {
    name: 'generation_capability_list',
    description: 'List MovScript generation capabilities accepted by generation_prepare and generation_submit.',
    inputSchema: objectSchema(
      {
        include_models: { type: 'boolean', description: 'When true, include enabled model counts for each capability.' },
      },
    ),
    outputSchema: objectSchema(
      {
        capabilities: { type: 'array', items: { type: 'string', enum: [...GENERATION_CAPABILITIES] } },
        count: { type: 'number' },
        models_by_capability: { type: 'object', additionalProperties: true },
      },
      ['capabilities', 'count']
    ),
  }
}

function generationPrepareTool(): MCPTool {
  return {
    name: 'generation_prepare',
    description: 'Prepare a MovScript generation request: validate capability/scope, list usable models, and compile content-unit prompts when scope is content_unit. Capability-family requests must include an explicit operation or generation_intent.operation.',
    inputSchema: generationRequestSchema(['capability']),
    outputSchema: objectSchema(
      {
        status: { type: 'string' },
        capability: { type: 'string' },
        scope: { type: 'string' },
        model_contracts: { type: 'array', items: { type: 'object', additionalProperties: true } },
        models: { type: 'array', items: { type: 'object', additionalProperties: true } },
        prompt: { type: 'object', additionalProperties: true },
        blockers: { type: 'array', items: { type: 'object', additionalProperties: true } },
        message: { type: 'string' },
      },
      ['status', 'capability', 'scope', 'message']
    ),
  }
}

function generationSubmitTool(): MCPTool {
  return {
    name: 'generation_submit',
    description: 'Submit any MovScript generation job through one unified capability contract. Capability-family submissions must include an explicit operation or generation_intent.operation; the tool never infers the operation from resource count. Use scope=content_unit for candidate-producing image/video generation, otherwise outputs are RawResources until explicitly registered.',
    inputSchema: generationRequestSchema(['capability']),
    outputSchema: objectSchema(
      {
        status: { type: 'string' },
        capability: { type: 'string' },
        scope: { type: 'string' },
        output_kind: { type: 'string' },
        generation_mode: { type: 'string' },
        candidate_policy: { type: 'string' },
        jobId: { type: 'number' },
        job_id: { type: 'number' },
        terminal: { type: 'boolean' },
        monitor: { type: 'object', additionalProperties: true },
        surface: { type: 'object', additionalProperties: true },
        message: { type: 'string' },
        job: { type: 'object', additionalProperties: true },
      },
      ['status', 'capability', 'scope', 'jobId', 'terminal', 'monitor']
    ),
  }
}

function generationJobGetTool(): MCPTool {
  return {
    name: 'generation_job_get',
    description: 'Fetch any MovScript generation job by id. For content-unit jobs, pass scope=content_unit, contentUnitId, and output_kind so successful terminal polls can create or refresh content-unit candidates.',
    inputSchema: objectSchema(
      {
        jobId: { type: 'number', minimum: 1 },
        job_id: { type: 'number', minimum: 1 },
        capability: { type: 'string', enum: [...GENERATION_CAPABILITIES] },
        scope: { type: 'string', enum: ['free', 'content_unit', 'asset', 'storyboard', 'keyframe'] },
        projectDir: { type: 'string', description: 'MovScript project source directory used when creating successful candidates.' },
        project_dir: { type: 'string', description: 'Alias for projectDir.' },
        cwd: { type: 'string', description: 'Alias for projectDir.' },
        projectUid: { type: 'string', description: 'Optional manifest project_uid used for scoped candidate metadata.' },
        project_uid: { type: 'string', description: 'Alias for projectUid.' },
        contentUnitId: { type: ['string', 'number'], description: 'Target MovScript content unit id for automatic candidate creation.' },
        content_unit_id: { type: ['string', 'number'], description: 'Alias for contentUnitId.' },
        outputKind: { type: 'string', enum: ['image', 'video', 'audio', 'subtitle', 'voice_profile', 'json'] },
        output_kind: { type: 'string', enum: ['image', 'video', 'audio', 'subtitle', 'voice_profile', 'json'] },
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

function generationJobGetBatchTool(): MCPTool {
  return {
    name: 'generation_job_get_batch',
    description: 'Synchronously fetch the latest state of multiple MovScript generation jobs. Items may include capability, scope, contentUnitId, and output_kind.',
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

function generationResultRegisterTool(): MCPTool {
  return {
    name: 'generation_result_register',
    description: 'Register an existing generation RawResource as a content-unit candidate. Use this when a low-level generation result should enter domain candidate review.',
    inputSchema: objectSchema(
      {
        contentUnitId: { type: ['string', 'number'], description: 'Target MovScript content unit id.' },
        content_unit_id: { type: ['string', 'number'], description: 'Alias for contentUnitId.' },
        resourceId: { type: 'number', minimum: 1 },
        resource_id: { type: 'number', minimum: 1 },
        outputKind: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'metadata'] },
        output_kind: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'metadata'] },
        candidateId: { type: 'string' },
        candidate_id: { type: 'string' },
        title: { type: 'string' },
        projectDir: { type: 'string' },
        project_dir: { type: 'string' },
        cwd: { type: 'string' },
        projectUid: { type: 'string' },
        project_uid: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
      },
      ['contentUnitId', 'resourceId']
    ),
    outputSchema: objectSchema(
      {
        status: { type: 'string' },
        candidate: { type: 'object', additionalProperties: true },
        surface: { type: 'object', additionalProperties: true },
      },
    ),
  }
}

function generationRequestSchema(required: string[] = []): MCPTool['inputSchema'] {
  return objectSchema(
    {
      capability: { type: 'string', enum: [...GENERATION_CAPABILITIES], description: 'MovScript generation capability. Prefer generation families such as image_generation, video_generation, or audio_generation plus an explicit operation.' },
      scope: { type: 'string', enum: ['free', 'content_unit', 'asset', 'storyboard', 'keyframe'], description: 'Generation target scope. content_unit image/video jobs create candidates on successful terminal polling.' },
      prompt: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      model_id: { type: 'string' },
      provider_id: { type: 'string' },
      operation: {
        type: 'string',
        enum: [
          'text_to_image',
          'reference_to_image',
          'image_to_image',
          'prompt_to_video',
          'reference_to_video',
          'image_to_video',
          'first_frame_to_video',
          'first_last_frame_to_video',
          'video_to_video',
          'video_edit',
          'video_extend',
          'video_inpaint',
          'object_insert',
          'object_remove',
          'motion_control',
          'lip_sync',
          'video_upscale',
          'tts',
          'stt',
          'speech_translate',
          'audio_chat',
          'voice_clone',
          'voice_design',
          'dubbing',
          'music',
          'sfx',
          'speech_enhancement',
        ],
        description: 'Explicit model operation intent. Required for image_generation, video_generation, and audio_generation; agents must choose this instead of relying on resource count, route, provider, or adapter details.',
      },
      model_operation: { type: 'string', description: 'Alias for operation.' },
      generation_intent: {
        type: 'object',
        additionalProperties: true,
        description: 'Explicit capability intent, e.g. {capability:"video_generation",operation:"first_last_frame_to_video",reference_assets:[...]}',
      },
      reference_assets: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            role: { type: 'string', enum: ['generic', 'first_frame', 'last_frame', 'reference_image', 'reference_video', 'reference_audio'] },
            media_type: { type: 'string', enum: ['image', 'video', 'audio'] },
            resource_id: { type: 'number', minimum: 1 },
          },
          required: ['role'],
        },
        description: 'Semantic roles for input/reference resources. Use reference_image/reference_video/reference_audio for omni reference video, and first_frame/last_frame for first-last video generation.',
      },
      parameter_mode: { type: 'string', enum: ['compatible', 'strict'] },
      param_mode: { type: 'string', enum: ['compatible', 'strict'] },
      projectDir: { type: 'string', description: 'MovScript project source directory.' },
      project_dir: { type: 'string', description: 'Alias for projectDir.' },
      cwd: { type: 'string', description: 'Alias for projectDir.' },
      projectUid: { type: 'string', description: 'Optional manifest project_uid used to namespace generated job metadata.' },
      project_uid: { type: 'string', description: 'Alias for projectUid.' },
      contentUnitId: { type: ['string', 'number'], description: 'Target content unit for scope=content_unit.' },
      content_unit_id: { type: ['string', 'number'], description: 'Alias for contentUnitId.' },
      candidateId: { type: 'string' },
      candidate_id: { type: 'string' },
      candidate_policy: { type: 'string', enum: ['none', 'auto_create', 'register_existing'] },
      input_resource_ids: { type: 'array', items: { type: 'number' } },
      reference_resource_ids: { type: 'array', items: { type: 'number' } },
      negative_prompt: { type: 'string' },
      aspect_ratio: { type: 'string' },
      image_size: { type: 'string' },
      duration: { type: 'number', minimum: 0 },
      quality: { type: 'string' },
      steps: { type: 'number', minimum: 1 },
      seed: { type: 'number' },
      fps: { type: 'number', minimum: 1 },
      voice: { type: 'string' },
      language: { type: 'string' },
      source_language: { type: 'string' },
      target_language: { type: 'string' },
      model: { type: 'string' },
      audio_format: { type: 'string' },
      response_format: { type: 'string' },
      output_format: { type: 'string' },
      subtitle_format: { type: 'string' },
      style: { type: 'string' },
      speed: { type: 'number', minimum: 0.25, maximum: 4 },
      instructions: { type: 'string' },
      extra_params: { type: 'object', additionalProperties: true },
      timeout_ms: { type: 'number', minimum: 1 },
      poll_interval_ms: { type: 'number', minimum: 1 },
    },
    required
  )
}

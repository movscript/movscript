import type { MCPTool } from '../types'
import { objectSchema } from './schema'

export function generationJobTools(): MCPTool[] {
  return [
    {
      name: 'generation_job_create',
      description: 'Create one or more independent single-output AI image or video generation jobs through the MovScript backend. Before choosing model_id, input_resource_ids, or extra_params, inspect generation_model_list and obey the selected model capability contract: capabilities, input_requirements, supported_params, and params_schema. Each backend job is single-output; when multiple candidates are needed, use output_count or extra_params.image_count/max_images to enqueue multiple jobs and monitor the returned jobIds. Returns output_resource/output_resource_id for completed single-job calls, output_resource_ids when wait results aggregate independent jobs, and param_validation audit_version 1 data, including non-blocking preflight_errors and input_preflight_errors, for direct chat display. This is cost-bearing and should only run after explicit user approval.',
      inputSchema: objectSchema(
        {
          prompt: { type: 'string' },
          title: { type: 'string', description: 'Optional display title for the generation job.' },
          output_type: { type: 'string', enum: ['image', 'video'], description: 'High-level output type. Ignored when job_type is provided.' },
          job_type: { type: 'string', enum: ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v'] },
          model_id: { type: 'string', description: 'Public logical model ID from generation_model_list. If omitted, MovScript chooses the first available model for the requested capability.' },
          input_resource_ids: { type: 'array', items: { type: 'number' }, description: 'Optional reference image/video resource IDs. Count should satisfy the selected model contract input_requirements; mismatches are reported in param_validation.input_preflight_errors.' },
          reference_type: { type: 'string', enum: ['image', 'video'], description: 'Use video with output_type video when reference resources should create a video_v2v job.' },
          aspect_ratio: { type: 'string', description: 'Optional aspect ratio such as 1:1, 16:9, or 9:16.' },
          duration: { type: 'number', description: 'Optional video duration in seconds.' },
          output_count: { type: 'number', minimum: 1, maximum: 15, description: 'Number of independent single-output jobs to create. For image candidates, this is preferred over asking one provider job for multiple images.' },
          outputCount: { type: 'number', minimum: 1, maximum: 15, description: 'Alias for output_count.' },
          extra_params: {
            type: 'object',
            description: 'Optional model-specific generation parameters. Keys must come from the selected model returned by generation_model_list.supported_params / params_schema. Unsupported keys are omitted before submission and reported in param_validation audit_version 1 dropped_extra_params; obvious local type/option/range and compact cross-parameter rule mismatches are reported in non-blocking param_validation.preflight_errors.',
            additionalProperties: true,
          },
          feature_key: { type: 'string', description: 'Optional caller source key for audit. Defaults to agent.chat_generation.' },
          projectId: { type: 'number' },
          wait: { type: 'boolean', description: 'Defaults to true. When false, returns after enqueueing the job.' },
          timeout_ms: { type: 'number', description: 'Maximum wait time. Defaults to 180000 for image, 600000 for video.' },
          poll_interval_ms: { type: 'number', description: 'Polling interval. Defaults to 2500.' },
        },
        ['prompt']
      ),
      outputSchema: objectSchema(
        {
          status: { type: 'string', description: 'Current or final backend generation status.' },
          job: { type: 'object', description: 'Normalized generation job payload.' },
          jobId: { type: 'number', description: 'Generation job ID for monitoring and audit.' },
          jobIds: { type: 'array', items: { type: 'number' }, description: 'Generation job IDs when multiple independent single-output jobs were created.' },
          jobs: { type: 'array', items: { type: 'object' }, description: 'Normalized generation job payloads when multiple independent single-output jobs were created.' },
          monitor: {
            type: 'object',
            description: 'Present when the job needs asynchronous monitoring.',
            properties: {
              tool: { type: 'string', enum: ['generation_job_wait', 'generation_job_get'] },
              args: { type: 'object' },
              message: { type: 'string' },
            },
          },
          output_resource: { type: 'object', description: 'Generated resource object when available.' },
          output_resource_id: { type: 'number', description: 'Generated resource ID when available.' },
          output_resources: { type: 'array', items: { type: 'object' }, description: 'Generated resource objects when a wait result aggregates independent completed jobs.' },
          output_resource_ids: { type: 'array', items: { type: 'number' }, description: 'Generated resource IDs when a wait result aggregates independent completed jobs.' },
          media: { type: 'object', description: 'Media preview metadata when available.' },
          param_validation: {
            type: 'object',
            description: 'audit_version 1 parameter filtering and preflight audit.',
            properties: {
              audit_version: { type: 'number', const: 1 },
              model_config_id: { type: 'number' },
              model_contract_loaded: { type: 'boolean' },
              params_schema_loaded: { type: 'boolean' },
              params_schema_rule_count: { type: 'number' },
              input_requirements: { type: 'object' },
              submitted_inputs: { type: 'object' },
              supported_params: { type: 'array', items: { type: 'string' } },
              provided_extra_params: { type: 'array', items: { type: 'string' } },
              submitted_extra_params: { type: 'array', items: { type: 'string' } },
              dropped_extra_params: { type: 'array', items: { type: 'string' } },
              dropped_top_level_params: { type: 'array', items: { type: 'string' } },
              drop_reasons: { type: 'object' },
              renamed_extra_params: { type: 'object' },
              extra_params_parse_error: { type: 'string' },
              preflight_errors: { type: 'array' },
              input_preflight_errors: { type: 'array' },
            },
          },
          terminal: { type: 'boolean', description: 'Whether status is terminal when wait=true.' },
          message: { type: 'string' },
        },
        ['status', 'job', 'jobId', 'param_validation', 'message']
      ),
    },
    {
      name: 'generation_job_get',
      description: 'Inspect one AI image or video generation job. Returns status, progress hints, output resource, and media preview data when available.',
      inputSchema: objectSchema(
        {
          jobId: { type: 'number', description: 'Generation job ID.' },
          projectId: { type: 'number' },
        },
        ['jobId']
      ),
    },
    {
      name: 'generation_job_wait',
      description: 'Wait for one or more AI image or video generation jobs to reach a terminal status, or return pending jobs when the wait times out. Use this instead of repeatedly calling generation_job_get.',
      inputSchema: objectSchema(
        {
          jobIds: { type: 'array', items: { type: ['string', 'number'] }, minItems: 1, description: 'Generation job IDs to wait for.' },
          jobId: { type: ['string', 'number'], description: 'Single-job compatibility alias. Ignored when jobIds is present.' },
          projectId: { type: 'number' },
          mode: { type: 'string', enum: ['all', 'any'], description: 'Defaults to all. any returns when any requested job reaches a terminal status.' },
          timeout_ms: { type: 'number', description: 'Maximum wait time. Defaults to 180000ms.' },
          heartbeat_ms: { type: 'number', description: 'Reserved for event stream heartbeat metadata.' },
        },
      ),
      outputSchema: objectSchema(
        {
          status: { type: 'string', enum: ['completed', 'partial', 'timeout', 'failed', 'cancelled'] },
          done: { type: 'boolean' },
          jobIds: { type: 'array', items: { type: 'number' } },
          completed: { type: 'array', items: { type: 'object' } },
          pending: { type: 'array', items: { type: 'object' } },
          failed: { type: 'array', items: { type: 'object' } },
          cancelled: { type: 'array', items: { type: 'object' } },
          output_resource_ids: { type: 'array', items: { type: 'number' } },
          jobs: { type: 'array', items: { type: 'object' } },
          message: { type: 'string' },
        },
        ['status', 'done', 'jobIds', 'completed', 'pending', 'failed', 'cancelled', 'message']
      ),
    },
    {
      name: 'generation_job_list',
      description: 'List recent AI image or video generation jobs for the current project so the agent can monitor queued and running work.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          status: { type: 'string', description: 'Optional job status filter, such as pending, running, succeeded, failed, or cancelled.' },
          job_type: { type: 'string', description: 'Optional job type filter, such as image, image_edit, video, video_i2v, or video_v2v.' },
          limit: { type: 'number', description: 'Maximum number of jobs to return. Defaults to 20.' },
        }
      ),
    },
    {
      name: 'generation_job_cancel',
      description: 'Cancel a running video generation job. This is cost/state affecting and should only run after explicit user approval.',
      inputSchema: objectSchema(
        {
          jobId: { type: 'number', description: 'Generation job ID.' },
          projectId: { type: 'number' },
        },
        ['jobId']
      ),
    },
  ]
}

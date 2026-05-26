import type { MCPTool } from '../types'
import { objectSchema } from './schema'

export function generationConnectorTools(): MCPTool[] {
  return [
    {
      name: 'tool_comfyui',
      description: 'Use a configured ComfyUI server from local console, organization, or admin generation-tool settings. Supports listing configured ComfyUI servers, checking status, reading object info, queueing a workflow prompt, reading queue state, reading history, and importing outputs. Local user servers are called directly from the desktop runtime; organization/admin servers with hidden secrets are called through the backend proxy.',
      inputSchema: objectSchema(
        {
          operation: { type: 'string', enum: ['list_servers', 'status', 'object_info', 'queue_prompt', 'queue', 'history', 'import_history_outputs'] },
          server_id: { type: 'string', description: 'Configured ComfyUI server ID. Defaults to the enabled default/highest-priority ComfyUI server.' },
          server_scope: { type: 'string', enum: ['local', 'org', 'admin'], description: 'Optional scope discriminator when multiple configured servers share the same ID.' },
          workflow: { type: 'object', additionalProperties: true, description: 'ComfyUI workflow/prompt JSON required for queue_prompt.' },
          client_id: { type: 'string', description: 'Optional ComfyUI client_id for queue_prompt.' },
          prompt_id: { type: 'string', description: 'Optional prompt_id for history.' },
          output_name: { type: 'string', description: 'Optional filename prefix for imported ComfyUI outputs.' },
          folder_id: { type: ['string', 'number'], description: 'Optional resource folder id for imported outputs.' },
          projectId: { type: 'number', description: 'Project id required when attaching imported resources as candidates.' },
          asset_slot_id: { type: 'number', description: 'Optional asset slot id; when provided with import_history_outputs, imported resources are attached as asset slot candidates.' },
          keyframe_id: { type: 'number', description: 'Optional original keyframe id; when provided with import_history_outputs, imported resources are attached as keyframe candidates.' },
        },
        ['operation']
      ),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          server: { type: 'object' },
          servers: { type: 'array', items: { type: 'object' } },
          data: { type: 'object' },
          output_resources: { type: 'array', items: { type: 'object' } },
          output_resource_ids: { type: 'array', items: { type: 'number' } },
          candidate_results: { type: 'array', items: { type: 'object' } },
          message: { type: 'string' },
        },
        ['status']
      ),
    },
    {
      name: 'tool_webui',
      description: 'Use a configured Stable Diffusion WebUI / AUTOMATIC1111 compatible server from local console, organization, or admin generation-tool settings. Supports listing configured WebUI servers, checking progress/status, listing models, txt2img, img2img, imports, and arbitrary safe sdapi GET calls. Local user servers are called directly from the desktop runtime; organization/admin servers with hidden secrets are called through the backend proxy.',
      inputSchema: objectSchema(
        {
          operation: { type: 'string', enum: ['list_servers', 'status', 'models', 'txt2img', 'img2img', 'progress', 'get'] },
          server_id: { type: 'string', description: 'Configured WebUI server ID. Defaults to the enabled default/highest-priority WebUI server.' },
          server_scope: { type: 'string', enum: ['local', 'org', 'admin'], description: 'Optional scope discriminator when multiple configured servers share the same ID.' },
          payload: { type: 'object', additionalProperties: true, description: 'Request JSON for txt2img or img2img.' },
          path: { type: 'string', description: 'Optional /sdapi/v1/... path for operation=get.' },
          import_outputs: { type: 'boolean', description: 'When true for txt2img/img2img, upload returned base64 images into the MovScript resource library and omit raw image payloads from the tool result.' },
          output_name: { type: 'string', description: 'Optional filename prefix for imported WebUI outputs.' },
          folder_id: { type: ['string', 'number'], description: 'Optional resource folder id for imported outputs.' },
          projectId: { type: 'number', description: 'Project id required when attaching imported resources as candidates.' },
          asset_slot_id: { type: 'number', description: 'Optional asset slot id; when provided with import_outputs, imported resources are attached as asset slot candidates.' },
          keyframe_id: { type: 'number', description: 'Optional original keyframe id; when provided with import_outputs, imported resources are attached as keyframe candidates.' },
        },
        ['operation']
      ),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          server: { type: 'object' },
          servers: { type: 'array', items: { type: 'object' } },
          data: { type: 'object' },
          output_resources: { type: 'array', items: { type: 'object' } },
          output_resource_ids: { type: 'array', items: { type: 'number' } },
          candidate_results: { type: 'array', items: { type: 'object' } },
          message: { type: 'string' },
        },
        ['status']
      ),
    },
  ]
}

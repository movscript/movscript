import type { MCPTool } from '../types'
import { objectSchema } from './schema'

export function generationModelTools(): MCPTool[] {
  return [
    {
      name: 'generation_model_list',
      description: 'List enabled AI models for a capability or backend AI feature key. Prefer capability for generic generation: image for text-to-image, image_edit for image-to-image, video for text-to-video, and video_v2v for video-to-video. Backend feature keys are product routing keys such as ref_image_gen, ref_video_gen, canvas_image, canvas_video, style_transfer, or multi_angle; do not pass workflow template keys such as image-generation or text-generation as feature keys. The result includes public model_id values plus model_contracts with contract_version 1, capabilities, input_requirements, supported_param_keys, supported_params, and params_schema rule counts so the agent can choose a valid model before generation. Use model_id for generation calls.',
      inputSchema: objectSchema(
        {
          capability: { type: 'string', description: 'Optional capability filter such as text, image, image_edit, video, video_i2v, or video_v2v.' },
          feature: { type: 'string', description: 'Optional backend AI feature key filter. Takes precedence over capability when provided. Valid examples include ref_image_gen, ref_video_gen, canvas_image, canvas_video, style_transfer, multi_angle, motion_imitation, and video_edit. Do not use workflow template keys like image-generation.' },
          feature_key: { type: 'string', description: 'Alias for feature. Use only backend AI feature keys, not workflow template keys.' },
          provider_variants: { type: 'boolean', description: 'When true, include provider-specific model variants.' },
          include_provider_variants: { type: 'boolean', description: 'Alias for provider_variants.' },
        }
      ),
      outputSchema: objectSchema(
        {
          count: { type: 'number' },
          queries: { type: 'array', items: { type: 'string' } },
          model_contracts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['contract_version', 'model_id', 'capabilities', 'input_requirements', 'supported_param_keys', 'supported_params'],
              properties: {
                contract_version: { type: 'number', const: 1 },
                model_id: { type: 'string', description: 'Public logical model ID to pass to generation_job_create.' },
                display_name: { type: 'string' },
                short_name: { type: 'string' },
                logical_model_id: { type: 'string', description: 'Legacy alias for model_id.' },
                capabilities: { type: 'array', items: { type: 'string' } },
                accepts_image_input: { type: 'boolean' },
                input_requirements: {
                  type: 'object',
                  required: ['image', 'video'],
                  properties: {
                    image: {
                      type: 'object',
                      required: ['min', 'max'],
                      properties: {
                        min: { type: 'number' },
                        max: { type: 'number' },
                      },
                    },
                    video: {
                      type: 'object',
                      required: ['min', 'max'],
                      properties: {
                        min: { type: 'number' },
                        max: { type: 'number' },
                      },
                    },
                  },
                },
                supported_param_keys: { type: 'array', items: { type: 'string' } },
                supported_params: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    required: ['key'],
                    properties: {
                      key: { type: 'string' },
                      label: { type: 'string' },
                      type: { type: 'string', enum: ['select', 'number', 'boolean', 'string'] },
                      options: { type: 'array', items: { type: 'string' } },
                      conflicts_with: { type: 'array', items: { type: 'string' } },
                      conditional_enum: { type: 'array' },
                      conditional_const: { type: 'array' },
                      requires_value: { type: 'array' },
                    },
                  },
                },
                params_schema_loaded: { type: 'boolean' },
                params_schema_rule_count: { type: 'number' },
              },
            },
          },
          models: { type: 'array' },
        },
        ['count', 'queries', 'model_contracts', 'models']
      ),
    },
  ]
}

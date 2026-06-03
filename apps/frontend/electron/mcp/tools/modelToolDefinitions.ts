import type { MCPTool } from '../types'
import { objectSchema } from './schema'

export function modelTools(): MCPTool[] {
  return [
    {
      name: 'generation_model_list',
      description: 'List enabled generation models for a runtime capability. Use image for text-to-image, image_edit for image-to-image, video for text-to-video, video_i2v for image-to-video, video_v2v for video-to-video, audio_tts for voiceover generation, audio_transcribe for STT, subtitle_align for subtitle alignment, and render_video for renderer capabilities. The result includes public model_id values plus model_contracts with contract_version 1, capabilities, input_requirements, supported_param_keys, supported_params, and params_schema rule counts so the agent can choose a valid model before calling generation provider tools.',
      inputSchema: objectSchema(
        {
          capability: { type: 'string', description: 'Optional capability filter such as text, image, image_edit, video, video_i2v, video_v2v, audio_tts, audio_transcribe, subtitle_align, or render_video.' },
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
                model_id: { type: 'string', description: 'Public logical model ID to pass to plugin generation tools.' },
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

import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function modelTools(): MCPTool[] {
  return [
    {
      name: 'generation_model_list',
      description: 'List enabled generation and speech models for an AI runtime capability. For image/video family capabilities, callers may pass target_output plus reference_assets and let the backend resolver infer usable model operations. The result exposes public model contracts only; provider routes, adapters, and endpoints are Admin/debug details.',
      inputSchema: objectSchema(
        {
          capability: { type: 'string', description: 'Optional AI capability family such as text_generation, image_generation, video_generation, or audio_generation.' },
          target_output: { type: 'string', enum: ['image', 'video', 'audio', 'text'], description: 'Optional resolver target output. Use this with reference_assets to ask the backend to infer usable image/video model operations.' },
          targetOutput: { type: 'string', enum: ['image', 'video', 'audio', 'text'], description: 'Alias for target_output.' },
          resolve_intent: { type: 'boolean', description: 'When true, backend resolves the model intent from capability, target_output, and reference_assets instead of requiring operation.' },
          resolveIntent: { type: 'boolean', description: 'Alias for resolve_intent.' },
          operation: { type: 'string', description: 'Optional explicit model operation intent such as text_to_image, reference_to_image, first_last_frame_to_video, text_to_speech, speech_to_text, music_generation, or sound_effect_generation. If omitted for image/video requests, backend resolver can infer it from target_output and reference_assets.' },
          model_operation: { type: 'string', description: 'Alias for operation.' },
          reference_assets: {
            type: 'array',
            description: 'Optional reference asset intent used to narrow route-capable models without exposing route details.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['role'],
              properties: {
                role: { type: 'string', description: 'Reference role such as generic, reference_image, target_image, reference_video, target_video, reference_audio, first_frame, last_frame, voice_sample, or transcript.' },
                media_type: { type: 'string', enum: ['image', 'video', 'audio', 'text'], description: 'Optional media type hint.' },
              },
            },
          },
          provider_variants: { type: 'boolean', description: 'Admin/debug hint for backend querying; returned records remain public model contracts without route details.' },
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
              required: ['contract_version', 'model_id', 'capabilities', 'operations', 'supported_params_by_operation', 'params_schema_by_operation'],
              properties: {
                contract_version: { type: 'number', const: 2 },
                model_id: { type: 'string', description: 'Public logical model ID to pass to plugin generation tools.' },
                display_name: { type: 'string' },
                short_name: { type: 'string' },
                logical_model_id: { type: 'string', description: 'Alias for model_id when returned by older backend surfaces.' },
                capabilities: { type: 'array', items: { type: 'string' } },
                operations: { type: 'array', items: { type: 'string' } },
                inferred_operation: { type: 'string', description: 'Backend-inferred operation for the requested capability/reference combination, when resolve_intent is used.' },
                resolver_operations: { type: 'array', items: { type: 'string' }, description: 'All backend-inferred operations supported by this public model for the requested references.' },
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
                supported_param_keys_by_operation: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { type: 'string' } },
                },
                supported_params_by_operation: {
                  type: 'object',
                  additionalProperties: {
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
                },
                params_schema_by_operation: {
                  type: 'object',
                  additionalProperties: { type: 'object', additionalProperties: true },
                },
                params_schema_loaded_by_operation: {
                  type: 'object',
                  additionalProperties: { type: 'boolean' },
                },
              },
            },
          },
          models: { type: 'array', description: 'Compatibility alias for model_contracts; contains public model contracts, not raw provider route records.' },
        },
        ['count', 'queries', 'model_contracts', 'models']
      ),
    },
  ]
}

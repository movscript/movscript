import assert from 'node:assert/strict'
import test from 'node:test'

import { summarizeModelContractForAgent } from './summary'

test('agent model contract summary strips route provider and adapter details', () => {
  const summary = summarizeModelContractForAgent({
    id: 12,
    model_id: 'grok-video-public',
    display_name: 'Grok Video',
    capabilities: ['video_generation'],
    inferred_operation: 'first_last_frame_to_video',
    resolver_operations: ['first_last_frame_to_video', 'reference_to_video'],
    accepts_image_input: true,
    route_binding_id: 34,
    provider_id: 'yunwu-main',
    provider_model_id: 'grok-video-3',
    adapter_type: 'yunwu_unified_video',
    endpoint_base_url: 'https://yunwu.ai',
    endpoint_path_prefix: '/v1',
    credential_id: 56,
    route_bindings: [
      {
        route_binding_id: 34,
        provider_model_id: 'grok-video-3',
        adapter_type: 'yunwu_unified_video',
      },
    ],
  })

  assert.equal(summary.model_id, 'grok-video-public')
  assert.equal(summary.inferred_operation, 'first_last_frame_to_video')
  assert.deepEqual(summary.resolver_operations, ['first_last_frame_to_video', 'reference_to_video'])
  const serialized = JSON.stringify(summary)
  for (const forbidden of [
    'route_binding_id',
    'route_bindings',
    'provider_id',
    'provider_model_id',
    'adapter_type',
    'endpoint_base_url',
    'endpoint_path_prefix',
    'credential_id',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `summary leaked ${forbidden}: ${serialized}`)
  }
})

test('agent model contract summary exposes v2 operation-scoped params', () => {
  const summary = summarizeModelContractForAgent({
    model_id: 'video-public',
    capabilities: ['video_generation'],
    operations: ['prompt_to_video', 'image_to_video'],
    supported_params_by_operation: {
      prompt_to_video: [{ key: 'duration', label: 'Duration', type: 'number', min: 1, max: 10 }],
      image_to_video: [{ key: 'prompt_strength', label: 'Prompt strength', type: 'number', min: 0, max: 1 }],
    },
    params_schema_by_operation: {
      prompt_to_video: {
        type: 'object',
        properties: {
          duration: { type: 'number', minimum: 1, maximum: 10 },
        },
      },
      image_to_video: {
        type: 'object',
        properties: {
          prompt_strength: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  })

  assert.equal(summary.contract_version, 2)
  assert.deepEqual(summary.operations, ['image_to_video', 'prompt_to_video'])
  assert.deepEqual(summary.supported_param_keys_by_operation, {
    image_to_video: ['prompt_strength'],
    prompt_to_video: ['duration'],
  })
  assert.deepEqual(summary.params_schema_loaded_by_operation, {
    image_to_video: true,
    prompt_to_video: true,
  })
})

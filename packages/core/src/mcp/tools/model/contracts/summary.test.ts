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
    operation_profile: 'generation',
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
    'operation_profile',
    'credential_id',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `summary leaked ${forbidden}: ${serialized}`)
  }
})

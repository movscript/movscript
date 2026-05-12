import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGenerationJobPayload } from './generationJobPayload'

test('buildGenerationJobPayload promotes numeric duration and aspect ratio', () => {
  assert.deepEqual(buildGenerationJobPayload({
    modelConfigId: 42,
    jobType: 'video',
    title: 'Video job',
    prompt: ' make a shot ',
    params: { aspect_ratio: '16:9', duration: '5', resolution: '720p' },
    inputResourceIds: [7],
    featureKey: 'tool.video',
  }), {
    model_config_id: 42,
    job_type: 'video',
    title: 'Video job',
    prompt: 'make a shot',
    aspect_ratio: '16:9',
    duration: 5,
    extra_params: JSON.stringify({ resolution: '720p' }),
    input_resource_ids: [7],
    feature_key: 'tool.video',
  })
})

test('buildGenerationJobPayload keeps non numeric duration in extra params', () => {
  assert.deepEqual(buildGenerationJobPayload({
    modelConfigId: 42,
    jobType: 'video',
    title: 'Video job',
    prompt: 'make a shot',
    params: { duration: 'auto', negative_prompt: 'low quality' },
    inputResourceIds: [],
    featureKey: 'tool.video',
  }), {
    model_config_id: 42,
    job_type: 'video',
    title: 'Video job',
    prompt: 'make a shot',
    aspect_ratio: undefined,
    duration: undefined,
    extra_params: JSON.stringify({ negative_prompt: 'low quality', duration: 'auto' }),
    input_resource_ids: [],
    feature_key: 'tool.video',
  })
})

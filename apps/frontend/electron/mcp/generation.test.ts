import assert from 'node:assert/strict'
import test from 'node:test'

import {
  generationJobMessage,
  getGenerationProgress,
  getGenerationStage,
  isTerminalGenerationStatus,
  normalizeGenerationJob,
} from './generation'

test('normalizeGenerationJob maps provider/model metadata and output media', () => {
  const normalized = normalizeGenerationJob({
    ID: 44,
    status: 'succeeded',
    job_type: 'video_i2v',
    provider_name: 'Provider X',
    model_display: 'Motion Model',
    model_identifier: 'motion-model-v1',
    model_config_id: 12,
    progress_percent: '87',
    provider_status: 'rendering',
    output_resource: {
      ID: 91,
      type: 'video',
      name: 'result.mp4',
      url: '/api/v1/resources/91/file',
      direct_url: '/signed/result.mp4',
      mime_type: 'video/mp4',
    },
  })

  assert.equal(normalized.jobId, 44)
  assert.equal(normalized.jobType, 'video_i2v')
  assert.equal(normalized.providerName, 'Provider X')
  assert.equal(normalized.modelDisplay, 'Motion Model')
  assert.equal(normalized.modelIdentifier, 'motion-model-v1')
  assert.equal(normalized.modelConfigId, 12)
  assert.equal(normalized.progress, 87)
  assert.equal(normalized.stage, 'rendering')
  assert.equal(normalized.output_resource_id, 91)
  assert.deepEqual(normalized.media, {
    id: 91,
    type: 'video',
    name: 'result.mp4',
    url: '/api/v1/resources/91/file',
    direct_url: '/signed/result.mp4',
    mime_type: 'video/mp4',
  })
})

test('normalizeGenerationJob uses explicit output_resource_id when present', () => {
  const normalized = normalizeGenerationJob({
    id: 45,
    status: 'succeeded',
    output_resource_id: 100,
    output_resource: {
      id: 99,
      type: 'image',
      name: 'result.png',
      url: '/api/v1/resources/99/file',
      mime_type: 'image/png',
    },
  })

  assert.equal(normalized.jobId, 45)
  assert.equal(normalized.output_resource_id, 100)
  assert.deepEqual(normalized.media, {
    id: 100,
    type: 'image',
    name: 'result.png',
    url: '/api/v1/resources/99/file',
    direct_url: undefined,
    mime_type: 'image/png',
  })
})

test('getGenerationProgress normalizes provider progress variants', () => {
  assert.equal(getGenerationProgress({ progress: 0.42 }), 42)
  assert.equal(getGenerationProgress({ percent: '66' }), 66)
  assert.equal(getGenerationProgress({ metadata: { progress: '0.75' } }), 75)
  assert.equal(getGenerationProgress({ progress: 'not-a-number' }), undefined)
})

test('getGenerationStage reads provider stage variants', () => {
  assert.equal(getGenerationStage({ stage: 'queued' }), 'queued')
  assert.equal(getGenerationStage({ provider_status: ' rendering ' }), 'rendering')
  assert.equal(getGenerationStage({ metadata: { stage: 'uploading' } }), 'uploading')
  assert.equal(getGenerationStage({ metadata: { stage: '   ' } }), undefined)
})

test('generation terminal and message helpers describe final and active jobs', () => {
  assert.equal(isTerminalGenerationStatus('succeeded'), true)
  assert.equal(isTerminalGenerationStatus('running'), false)
  assert.equal(generationJobMessage(7, { status: 'succeeded', output_resource_id: 3 }), '生成完成，输出资源 #3。')
  assert.equal(generationJobMessage(7, { status: 'failed', error: 'provider failed' }), '生成失败：provider failed。')
  assert.equal(generationJobMessage(7, { status: 'running', progress: 25, stage: 'rendering' }), '生成任务 Job #7 仍在进行中，状态：running，进度 25%，阶段：rendering。')
})

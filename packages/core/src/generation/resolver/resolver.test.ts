import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveGenerationModels, type GenerationResolverModelLike } from './index.js'

test('generation resolver matches models from prompt references without a user-selected operation', () => {
  const models: GenerationResolverModelLike[] = [
    {
      model_id: 'prompt-video',
      display_name: 'Prompt Video',
      capabilities: ['video_generation'],
    },
    {
      model_id: 'cross-over-video',
      display_name: 'Cross-over Video',
      capabilities: ['video_generation'],
      resolver_profile: {
        output: 'video',
        input_slots: [{
          media_type: 'image',
          roles: ['reference_image', 'first_frame'],
          max: 1,
          label: '图像输入',
        }],
        operations: ['image_to_video', 'first_frame_to_video'],
      },
    },
  ]

  const ordinaryReference = resolveGenerationModels({
    targetOutput: 'video',
    references: [{ media_type: 'image', role: 'reference_image', resource_id: 1 }],
    models,
  })
  assert.deepEqual(ordinaryReference.profile?.labels, ['参考图生视频'])
  assert.equal(ordinaryReference.matches.map((match) => match.model_id).join(','), 'cross-over-video')
  assert.equal(ordinaryReference.matches[0]?.legacy_operation, 'image_to_video')
  assert.equal(ordinaryReference.blocked[0]?.model_id, 'prompt-video')

  const firstFrame = resolveGenerationModels({
    targetOutput: 'video',
    references: [{ media_type: 'image', role: 'first_frame', resource_id: 1 }],
    models,
  })
  assert.deepEqual(firstFrame.profile?.labels, ['首帧生视频'])
  assert.equal(firstFrame.matches[0]?.model_id, 'cross-over-video')
  assert.equal(firstFrame.matches[0]?.legacy_operation, 'first_frame_to_video')
})

test('generation resolver does not treat ordinary image references as first-frame references', () => {
  const firstFrameOnly: GenerationResolverModelLike = {
    model_id: 'first-frame-only',
    display_name: 'First Frame Only',
    resolver_profile: {
      output: 'video',
      input_slots: [{
        media_type: 'image',
        roles: ['first_frame'],
        max: 1,
        label: '首帧',
      }],
      operations: ['first_frame_to_video'],
    },
  }

  const result = resolveGenerationModels({
    targetOutput: 'video',
    references: [{ media_type: 'image', role: 'reference_image', resource_id: 10 }],
    models: [firstFrameOnly],
  })

  assert.equal(result.matches.length, 0)
  assert(result.blocked[0]?.blockers.some((blocker) => blocker.code === 'unsupported_reference'))
})

test('generation resolver ranks exact first-last frame support above generic image-to-video support', () => {
  const genericImageToVideo: GenerationResolverModelLike = {
    model_id: 'generic-i2v',
    display_name: 'Generic I2V',
    capabilities: ['video_generation', 'video_i2v'],
    accepts_image_input: true,
    input_requirements: {
      image: { min: 0, max: 1 },
      video: { min: 0, max: 0 },
    },
  }
  const firstLastFrame: GenerationResolverModelLike = {
    model_id: 'first-last-video',
    display_name: 'First Last Video',
    resolver_profile: {
      output: 'video',
      input_slots: [
        { media_type: 'image', roles: ['first_frame'], max: 1, label: '首帧' },
        { media_type: 'image', roles: ['last_frame'], max: 1, label: '尾帧' },
      ],
      operations: ['first_last_frame_to_video'],
    },
  }

  const result = resolveGenerationModels({
    targetOutput: 'video',
    references: [
      { media_type: 'image', role: 'first_frame', resource_id: 11 },
      { media_type: 'image', role: 'last_frame', resource_id: 12 },
    ],
    models: [genericImageToVideo, firstLastFrame],
  })

  assert.deepEqual(result.profile?.labels, ['首尾帧生视频'])
  assert.equal(result.matches[0]?.model_id, 'first-last-video')
  assert.equal(result.matches[0]?.legacy_operation, 'first_last_frame_to_video')
  assert.equal(result.blocked[0]?.model_id, 'generic-i2v')
  assert(result.blocked[0]?.blockers.some((blocker) => blocker.code === 'too_many_references'))
})

test('generation resolver reports structural reference blockers before matching models', () => {
  const result = resolveGenerationModels({
    targetOutput: 'video',
    references: [{ role: 'first_frame', resource_id: 7 }],
    models: [],
  })

  assert.equal(result.profile?.labels[0], '文生视频')
  assert.equal(result.references.length, 0)
  assert.equal(result.blockers[0]?.code, 'missing_reference_media_type')
})

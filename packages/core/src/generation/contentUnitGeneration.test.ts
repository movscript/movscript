import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContentUnitGenerationRequest,
  generationExecutionJobTypeForIntent,
} from './contentUnitGeneration.js'

test('content-unit generation request requires explicit generation intent', () => {
  assert.throws(
    () => buildContentUnitGenerationRequest({
      contentUnitId: 'scene-1',
      outputKind: 'video',
      compiledPrompt: { text: 'A character enters the room.' },
      modelId: 'story-video',
    }),
    /generationIntent with capability and operation is required/,
  )

  const request = buildContentUnitGenerationRequest({
    contentUnitId: 'scene-1',
    outputKind: 'video',
    compiledPrompt: { text: 'A character enters the room.', resource_ids: [101] },
    modelId: 'story-video',
    generationIntent: {
      capability: 'video_generation',
      operation: 'first_frame_to_video',
      reference_assets: [{ role: 'first_frame', media_type: 'image', resource_id: 101 }],
    },
  })

  assert.equal(request.generationIntent.operation, 'first_frame_to_video')
  assert.equal(request.jobType, 'video')
})

test('generation intent maps audio_generation operations to execution job types', () => {
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'text_to_speech' }, 'audio'), 'audio')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'music_generation' }, 'audio'), 'audio')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'sound_effect_generation' }, 'audio'), 'audio')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'speech_to_text' }, 'audio'), 'audio')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'speech_translate' }, 'audio'), 'audio')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'speech_to_speech' }, 'audio'), 'audio')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'voice_clone' }, 'text'), 'audio')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'voice_design' }, 'text'), 'audio')
})

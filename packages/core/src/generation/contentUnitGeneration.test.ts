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
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'tts' }, 'audio'), 'audio_tts')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'music' }, 'audio'), 'audio_music')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'sfx' }, 'audio'), 'audio_sfx')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'stt' }, 'audio'), 'audio_transcribe')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'speech_translate' }, 'audio'), 'audio_translate')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'audio_chat' }, 'audio'), 'audio_chat')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'voice_clone' }, 'text'), 'voice_clone')
  assert.equal(generationExecutionJobTypeForIntent({ capability: 'audio_generation', operation: 'voice_design' }, 'text'), 'voice_design')
})

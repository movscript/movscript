import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeModelCapabilityAlias } from './capability'

test('model capability normalization accepts capability names but not legacy operation aliases', () => {
  assert.equal(normalizeModelCapabilityAlias('audio_generation'), 'audio_generation')
  assert.equal(normalizeModelCapabilityAlias('audio_music'), 'audio_music')
  assert.equal(normalizeModelCapabilityAlias('music'), 'audio_music')
  assert.equal(normalizeModelCapabilityAlias('sfx'), 'audio_sfx')
  assert.equal(normalizeModelCapabilityAlias('tts'), 'audio_tts')
  assert.equal(normalizeModelCapabilityAlias('stt'), 'audio_transcribe')
  assert.equal(normalizeModelCapabilityAlias('speech_translate'), 'audio_translate')

  assert.equal(normalizeModelCapabilityAlias('music_generation'), undefined)
  assert.equal(normalizeModelCapabilityAlias('sound_effect_generation'), undefined)
  assert.equal(normalizeModelCapabilityAlias('text_to_speech'), undefined)
  assert.equal(normalizeModelCapabilityAlias('speech_to_text'), undefined)
  assert.equal(normalizeModelCapabilityAlias('prompt_to_video'), undefined)
  assert.equal(normalizeModelCapabilityAlias('image_to_video'), undefined)
})

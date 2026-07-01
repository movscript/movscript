import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeModelCapabilityAlias } from './capability'

function token(...parts: string[]): string {
  return parts.join('')
}

function legacyToken(...parts: string[]): string {
  return parts.join('_')
}

test('model capability normalization accepts only canonical generation capability families', () => {
  assert.equal(normalizeModelCapabilityAlias('text_generation'), 'text_generation')
  assert.equal(normalizeModelCapabilityAlias('image_generation'), 'image_generation')
  assert.equal(normalizeModelCapabilityAlias('video_generation'), 'video_generation')
  assert.equal(normalizeModelCapabilityAlias('audio_generation'), 'audio_generation')

  assert.equal(normalizeModelCapabilityAlias(legacyToken('audio', 'music')), undefined)
  assert.equal(normalizeModelCapabilityAlias(token('mu', 'sic')), undefined)
  assert.equal(normalizeModelCapabilityAlias(legacyToken('audio', 'sfx')), undefined)
  assert.equal(normalizeModelCapabilityAlias(token('s', 'fx')), undefined)
  assert.equal(normalizeModelCapabilityAlias(token('t', 'ts')), undefined)
  assert.equal(normalizeModelCapabilityAlias(token('s', 'tt')), undefined)
  assert.equal(normalizeModelCapabilityAlias('speech_translate'), undefined)
  assert.equal(normalizeModelCapabilityAlias(legacyToken('voice', 'chat')), undefined)
  assert.equal(normalizeModelCapabilityAlias(legacyToken('speech', 'chat')), undefined)
  assert.equal(normalizeModelCapabilityAlias('omni'), undefined)
  assert.equal(normalizeModelCapabilityAlias('music_generation'), undefined)
  assert.equal(normalizeModelCapabilityAlias('sound_effect_generation'), undefined)
  assert.equal(normalizeModelCapabilityAlias('text_to_speech'), undefined)
  assert.equal(normalizeModelCapabilityAlias('speech_to_text'), undefined)
  assert.equal(normalizeModelCapabilityAlias('forced_alignment'), undefined)

  assert.equal(normalizeModelCapabilityAlias('render_video'), undefined)
  assert.equal(normalizeModelCapabilityAlias('prompt_to_video'), undefined)
  assert.equal(normalizeModelCapabilityAlias('image_to_video'), undefined)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { translateApiError } from './apiError'

test('translateApiError preserves invalid model config detail', () => {
  const message = 'invalid ai model config: custom_supported_params.add[0]: parameter key is required'
  const translated = translateApiError({
    code: 'INVALID_MODEL_CONFIG',
    message,
    error: message,
  })

  assert.equal(translated.includes('Invalid model configuration'), true)
  assert.equal(translated.includes('custom_supported_params.add[0]'), true)
})

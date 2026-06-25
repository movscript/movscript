import assert from 'node:assert/strict'
import test from 'node:test'
import { translateAPIRequestError, translateApiError } from './apiError'

test('translateApiError preserves invalid model catalog detail', () => {
  const message = 'invalid ai model catalog: custom_supported_params.add[0]: parameter key is required'
  const translated = translateApiError({
    code: 'INVALID_MODEL_CATALOG',
    message,
    error: message,
  })

  assert.equal(translated.includes('Invalid model catalog or route configuration'), true)
  assert.equal(translated.includes('custom_supported_params.add[0]'), true)
})

test('translateAPIRequestError unwraps axios response data before translating', () => {
  const translated = translateAPIRequestError({
    response: {
      data: {
        error: 'running jobs must be cancelled before deletion',
      },
    },
  })

  assert.equal(translated, 'Running jobs must be cancelled before deletion')
})

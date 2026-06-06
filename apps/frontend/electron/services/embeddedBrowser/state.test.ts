import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeEmbeddedBrowserBounds,
  normalizeRendererEmbeddedBrowserBounds,
} from './state'

test('normalizeRendererEmbeddedBrowserBounds converts renderer CSS pixels to Electron view coordinates', () => {
  assert.deepEqual(
    normalizeRendererEmbeddedBrowserBounds({ x: 20, y: 40, width: 300, height: 200 }, 1.25),
    { x: 25, y: 50, width: 375, height: 250 },
  )
})

test('normalizeRendererEmbeddedBrowserBounds keeps bounds unchanged at default or invalid zoom', () => {
  const input = { x: 20, y: 40, width: 300, height: 200 }

  assert.deepEqual(normalizeRendererEmbeddedBrowserBounds(input, 1), normalizeEmbeddedBrowserBounds(input))
  assert.deepEqual(normalizeRendererEmbeddedBrowserBounds(input, Number.NaN), normalizeEmbeddedBrowserBounds(input))
  assert.deepEqual(normalizeRendererEmbeddedBrowserBounds(input, 0), normalizeEmbeddedBrowserBounds(input))
})

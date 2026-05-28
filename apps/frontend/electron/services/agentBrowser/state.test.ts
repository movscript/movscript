import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeAgentBrowserBounds,
  normalizeRendererAgentBrowserBounds,
} from './state'

test('normalizeRendererAgentBrowserBounds converts renderer CSS pixels to Electron view coordinates', () => {
  assert.deepEqual(
    normalizeRendererAgentBrowserBounds({ x: 20, y: 40, width: 300, height: 200 }, 1.25),
    { x: 25, y: 50, width: 375, height: 250 },
  )
})

test('normalizeRendererAgentBrowserBounds keeps bounds unchanged at default or invalid zoom', () => {
  const input = { x: 20, y: 40, width: 300, height: 200 }

  assert.deepEqual(normalizeRendererAgentBrowserBounds(input, 1), normalizeAgentBrowserBounds(input))
  assert.deepEqual(normalizeRendererAgentBrowserBounds(input, Number.NaN), normalizeAgentBrowserBounds(input))
  assert.deepEqual(normalizeRendererAgentBrowserBounds(input, 0), normalizeAgentBrowserBounds(input))
})

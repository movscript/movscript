import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AGENT_BROWSER_MIN_BOUND_SIZE,
  agentBrowserBoundsFromViewportElement,
  agentBrowserBoundsFromViewportRect,
} from './agentBrowserBounds'

test('agent browser bounds adapter normalizes viewport rects for Electron browser views', () => {
  assert.deepEqual(agentBrowserBoundsFromViewportRect({
    left: 10.4,
    top: 20.6,
    width: 300.2,
    height: 180.8,
  }), {
    x: 10,
    y: 21,
    width: 300,
    height: 181,
  })
})

test('agent browser bounds adapter rejects missing or too small interaction boxes', () => {
  assert.equal(agentBrowserBoundsFromViewportRect({
    left: 0,
    top: 0,
    width: AGENT_BROWSER_MIN_BOUND_SIZE - 1,
    height: 200,
  }), null)
  assert.equal(agentBrowserBoundsFromViewportRect({
    left: 0,
    top: 0,
    width: 200,
    height: Number.NaN,
  }), null)
  assert.equal(agentBrowserBoundsFromViewportElement(null), null)
})

test('agent browser bounds adapter can read from the viewport interaction element', () => {
  const viewport = {
    getBoundingClientRect: () => ({ left: 8, top: 12, width: 640, height: 360 }),
  } as Pick<HTMLElement, 'getBoundingClientRect'>

  assert.deepEqual(agentBrowserBoundsFromViewportElement(viewport), {
    x: 8,
    y: 12,
    width: 640,
    height: 360,
  })
})

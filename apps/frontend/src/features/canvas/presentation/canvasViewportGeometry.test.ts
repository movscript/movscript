import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canvasClientPointFromEvent,
  canvasDefaultClientPointFromViewportElement,
  canvasOverlayPointFromClient,
  canvasRenderDiagnosticViewport,
  canvasViewportContextMenuBoundary,
  canvasViewportDropHitBoxFromEvent,
  canvasViewportSizeFromElement,
  createCanvasViewportDropHitMapFromElement,
  type CanvasViewportElement,
} from './canvasViewportGeometry'

const viewport: CanvasViewportElement = {
  clientWidth: 500,
  clientHeight: 300,
  getBoundingClientRect: () => ({
    left: 10,
    top: 20,
    right: 510,
    bottom: 320,
    width: 500,
    height: 300,
  }),
}

test('canvas viewport geometry adapter reads default points and overlay points from the viewport element', () => {
  assert.deepEqual(canvasDefaultClientPointFromViewportElement(viewport), { x: 260, y: 170 })
  assert.deepEqual(canvasOverlayPointFromClient({ x: 90, y: 120 }, viewport), { x: 80, y: 100 })
  assert.deepEqual(canvasOverlayPointFromClient({ x: 90, y: 120 }, null), { x: 90, y: 120 })
  assert.deepEqual(canvasClientPointFromEvent({ clientX: 90, clientY: 120 }), { x: 90, y: 120 })
})

test('canvas viewport geometry adapter exposes menu boundaries and media viewport size', () => {
  assert.deepEqual(canvasViewportContextMenuBoundary(viewport), { width: 500, height: 300 })
  assert.deepEqual(canvasViewportSizeFromElement(null, { width: 800, height: 600 }), { width: 800, height: 600 })
})

test('canvas viewport geometry adapter creates the viewport drop hit map', () => {
  const hitMap = createCanvasViewportDropHitMapFromElement(viewport)

  assert.equal(hitMap.boxFromClient({ x: 250, y: 120 })?.id, 'canvas.flow-viewport')
  assert.equal(hitMap.boxFromClient({ x: 4, y: 120 }), null)
  assert.equal(canvasViewportDropHitBoxFromEvent({ event: { clientX: 250, clientY: 120 }, viewport })?.id, 'canvas.flow-viewport')
  assert.equal(canvasViewportDropHitBoxFromEvent({ event: { clientX: 4, clientY: 120 }, viewport }), null)
  assert.deepEqual(createCanvasViewportDropHitMapFromElement(null).boxes(), [])
})

test('canvas viewport geometry adapter provides SSR-safe render diagnostic viewport metrics', () => {
  assert.deepEqual(canvasRenderDiagnosticViewport(), { width: 0, height: 0, dpr: 1 })
})

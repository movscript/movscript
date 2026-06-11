import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canvasContextMenuPositionFromElement,
  canvasContextMenuPositionFromRect,
  canvasContextMenuStyleFromPosition,
  canvasContextMenuViewportFromWindow,
} from './canvasContextMenuPlacement'

test('canvas context menu placement clamps fixed menus to the viewport', () => {
  assert.deepEqual(
    canvasContextMenuPositionFromRect({
      x: 760,
      y: 540,
      positioning: 'fixed',
      menuRect: { width: 180, height: 140 },
      viewport: { width: 900, height: 640 },
    }),
    { left: 712, top: 492 },
  )
})

test('canvas context menu placement clamps viewport menus to the overlay boundary', () => {
  assert.deepEqual(
    canvasContextMenuPositionFromRect({
      x: 500,
      y: 320,
      positioning: 'viewport',
      boundary: { width: 520, height: 340 },
      menuRect: { width: 160, height: 120 },
      viewport: { width: 900, height: 640 },
    }),
    { left: 352, top: 212 },
  )
})

test('canvas context menu placement can read menu size from the rendered element', () => {
  const element = {
    getBoundingClientRect: () => ({ width: 200, height: 90 }),
  }

  assert.deepEqual(
    canvasContextMenuPositionFromElement({
      element,
      x: -20,
      y: 40,
      positioning: 'viewport',
      boundary: { width: 300, height: 200 },
    }),
    { left: 8, top: 40 },
  )
})

test('canvas context menu style is derived at the placement boundary', () => {
  assert.deepEqual(
    canvasContextMenuStyleFromPosition({ left: 24, top: 32 }),
    { left: 24, top: 32 },
  )

  assert.deepEqual(
    canvasContextMenuStyleFromPosition({ left: Number.NaN, top: Number.POSITIVE_INFINITY }),
    { left: 0, top: 0 },
  )
})

test('canvas context menu viewport metrics are SSR-safe', () => {
  assert.deepEqual(canvasContextMenuViewportFromWindow(), { width: 0, height: 0 })
})

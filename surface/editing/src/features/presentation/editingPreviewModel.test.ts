import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activeCanvasPresetId,
  clampPreviewScale,
  colorWithAlpha,
  formatAspectRatio,
} from './editingPreviewModel'

test('editing preview scale is rounded and constrained to the supported viewport range', () => {
  assert.equal(clampPreviewScale(0.04), 0.5)
  assert.equal(clampPreviewScale(1.04), 1)
  assert.equal(clampPreviewScale(1.06), 1.1)
  assert.equal(clampPreviewScale(3), 2)
})

test('editing preview aspect ratio label is normalized from project dimensions', () => {
  assert.equal(formatAspectRatio(1920, 1080), '16:9')
  assert.equal(formatAspectRatio(1080, 1920), '9:16')
  assert.equal(formatAspectRatio(1024, 1024), '1:1')
  assert.equal(formatAspectRatio(0, 720), '1:720')
})

test('editing preview canvas preset matching uses the normalized aspect ratio', () => {
  assert.equal(activeCanvasPresetId(1920, 1080), '16:9')
  assert.equal(activeCanvasPresetId(1080, 1920), '9:16')
  assert.equal(activeCanvasPresetId(1024, 1024), '1:1')
  assert.equal(activeCanvasPresetId(1200, 800), undefined)
})

test('editing preview text backgrounds convert hex colors to clamped rgba', () => {
  assert.equal(colorWithAlpha('#336699', 0.35), 'rgba(51, 102, 153, 0.35)')
  assert.equal(colorWithAlpha('#369', 1.5), 'rgba(51, 102, 153, 1.00)')
  assert.equal(colorWithAlpha('rgb(1 2 3)', 0.35), 'rgb(1 2 3)')
})

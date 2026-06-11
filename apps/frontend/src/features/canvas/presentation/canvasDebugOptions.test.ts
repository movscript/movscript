import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CANVAS_DEBUG_STORAGE_KEY,
  canvasRenderDiagnosticsEnabled,
  compactCanvasDebugOptions,
  parseCanvasDebugOptions,
} from './canvasDebugOptions'

test('canvas debug options parse storage and query specs outside the page component', () => {
  const storage = (key: string) => key === CANVAS_DEBUG_STORAGE_KEY ? 'grid=0,media=1,shelf=0' : null

  const options = parseCanvasDebugOptions('?canvasDebugNodes=0&canvasDebugVideos=false', storage)

  assert.equal(options.enabled, true)
  assert.equal(options.source, 'query')
  assert.equal(options.grid, false)
  assert.equal(options.media, true)
  assert.equal(options.shelf, false)
  assert.equal(options.nodes, false)
  assert.equal(options.videos, false)
})

test('canvas debug options let query disable storage debug mode', () => {
  const options = parseCanvasDebugOptions('?canvasDebug=off', () => 'on')

  assert.equal(options.enabled, false)
  assert.equal(options.source, 'query')
})

test('canvas render diagnostics only enable in dev or explicit render diagnostics env', () => {
  const debugOptions = parseCanvasDebugOptions('?canvasDebug', () => null)

  assert.equal(canvasRenderDiagnosticsEnabled({ dev: false, renderDiagnostics: '1' }, debugOptions), false)
  assert.equal(canvasRenderDiagnosticsEnabled({ dev: true }, undefined), false)
  assert.equal(canvasRenderDiagnosticsEnabled({ dev: true }, debugOptions), true)
  assert.equal(canvasRenderDiagnosticsEnabled({ dev: true, renderDiagnostics: '1' }, undefined), true)
})

test('canvas debug options compact enabled flags for diagnostics output', () => {
  const options = parseCanvasDebugOptions('?canvasDebug=grid=0,media=0', () => null)

  assert.match(compactCanvasDebugOptions(options), /^query:/)
  assert.match(compactCanvasDebugOptions(options), /grid=0/)
  assert.match(compactCanvasDebugOptions(options), /media=0/)
  assert.equal(compactCanvasDebugOptions(parseCanvasDebugOptions('', () => null)), 'off')
})

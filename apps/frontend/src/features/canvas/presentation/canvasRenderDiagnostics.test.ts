import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canvasRenderDiagnosticFirstMediaSummary,
  canvasRenderDiagnosticMediaNodeCounts,
  compactCanvasRenderDiagnosticMediaSrc,
  compactCanvasRenderDiagnosticResource,
} from './canvasRenderDiagnostics'

test('canvas render diagnostics compact media sources and resources predictably', () => {
  assert.equal(
    compactCanvasRenderDiagnosticMediaSrc('https://example.test/assets/a.png?sig=1', 'https://example.test'),
    '/assets/a.png?sig=1',
  )
  assert.equal(compactCanvasRenderDiagnosticMediaSrc(undefined, 'https://example.test'), 'empty')
  const invalidLongSrc = `http://[${'x'.repeat(90)}`
  assert.equal(compactCanvasRenderDiagnosticMediaSrc(invalidLongSrc, 'https://example.test'), `${invalidLongSrc.slice(0, 80)}...`)

  assert.equal(
    compactCanvasRenderDiagnosticResource({ ID: 42, type: 'image', size: 2048, name: 'hero.png' }),
    '#42:image:2048:hero.png',
  )
  assert.equal(compactCanvasRenderDiagnosticResource(undefined), 'none')
})

test('canvas render diagnostics summarize media nodes from type and resource metadata', () => {
  const nodes = [
    { id: 'image-node', type: 'image', data: { resource: { ID: 1, type: 'image', name: 'a.png' } } },
    { id: 'video-resource-node', type: 'resource', data: { resource: { ID: 2, type: 'video', size: 10, name: 'b.mp4' } } },
    { id: 'text-node', type: 'text', data: { resource: { ID: 3, type: 'text', name: 'c.txt' } } },
  ]

  assert.deepEqual(canvasRenderDiagnosticMediaNodeCounts(nodes), { images: 1, videos: 1 })
  assert.equal(
    canvasRenderDiagnosticFirstMediaSummary(nodes),
    'image-node:#1:image:0:a.png|video-resource-node:#2:video:10:b.mp4',
  )
})

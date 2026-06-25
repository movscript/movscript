import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compactResourceMediaDiagnosticElementRect,
  compactResourceMediaDiagnosticRect,
  compactResourceMediaDiagnosticSrc,
  RESOURCE_MEDIA_DIAGNOSTIC_STORAGE_KEY,
  resourceMediaDiagnosticsEnabled,
} from '@movscript/resource-surface/resource-media-diagnostics'

test('resource media diagnostics compact source URLs relative to an origin', () => {
  assert.equal(
    compactResourceMediaDiagnosticSrc('https://example.test/api/v1/resources/1/file?token=x', 'https://example.test'),
    '/api/v1/resources/1/file?token=x',
  )
  assert.equal(compactResourceMediaDiagnosticSrc(undefined, 'https://example.test'), 'empty')
  assert.equal(
    compactResourceMediaDiagnosticSrc('data:image/png;base64,aW1hZ2U=', 'https://example.test'),
    'data:image/png;base64 (8 chars)',
  )
  assert.equal(
    compactResourceMediaDiagnosticSrc('blob:http://127.0.0.1:5173/154ec143-ec07-4bdb-9e25-8b82e182b877', 'http://127.0.0.1:5173'),
    'object-url(origin=127.0.0.1:5173, id=154ec143...)',
  )
  assert.equal(compactResourceMediaDiagnosticSrc('blob:local-preview', 'https://example.test'), 'object-url(local-preview)')

  const invalidLongSrc = `http://[${'x'.repeat(120)}`
  assert.equal(compactResourceMediaDiagnosticSrc(invalidLongSrc, 'https://example.test'), `${invalidLongSrc.slice(0, 96)}...`)
})

test('resource media diagnostics compact measured rects', () => {
  assert.equal(
    compactResourceMediaDiagnosticRect({ width: 320.6, height: 180.2, left: 12.4, top: -4.6 }),
    '321x180+12+-5',
  )

  const element = {
    getBoundingClientRect: () => ({ width: 100.4, height: 80.5, left: 20.2, top: 10.1 }),
  } as HTMLElement
  assert.equal(compactResourceMediaDiagnosticElementRect(element), '100x81+20+10')
})

test('resource media diagnostics gate debug output from env, query, and storage outside UI components', () => {
  assert.equal(resourceMediaDiagnosticsEnabled({ dev: false, renderDiagnostics: '1', search: '?canvasDebug' }), false)
  assert.equal(resourceMediaDiagnosticsEnabled({ dev: true, renderDiagnostics: '1' }), true)
  assert.equal(resourceMediaDiagnosticsEnabled({ dev: true, search: '?canvasDebug' }, () => null), true)
  assert.equal(resourceMediaDiagnosticsEnabled({ dev: true, search: '' }, () => null), false)
  assert.equal(resourceMediaDiagnosticsEnabled({ dev: true, search: '' }, (key) => key === RESOURCE_MEDIA_DIAGNOSTIC_STORAGE_KEY ? '1' : null), true)
})

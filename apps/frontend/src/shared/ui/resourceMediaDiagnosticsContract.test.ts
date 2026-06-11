import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('resource media diagnostic rect measurement is owned by the shared diagnostics helper', () => {
  const authedImageSource = readFileSync(resolve('src/shared/ui/AuthedImage.tsx'), 'utf8')
  const canvasShelfSource = readFileSync(resolve('src/features/canvas/ui/CanvasResourceShelf.tsx'), 'utf8')
  const diagnosticsSource = readFileSync(resolve('src/shared/ui/resourceMediaDiagnostics.ts'), 'utf8')

  assert.match(diagnosticsSource, /export function compactResourceMediaDiagnosticElementRect/)
  assert.match(diagnosticsSource, /export function resourceMediaDiagnosticsEnabled/)
  assert.match(authedImageSource, /compactResourceMediaDiagnosticElementRect\(element\)/)
  assert.match(authedImageSource, /resourceMediaDiagnosticsEnabled\(\{/)
  assert.match(canvasShelfSource, /resourceMediaDiagnosticsEnabled\(\{/)
  assert.doesNotMatch(authedImageSource, /getBoundingClientRect\(\)/)
  assert.doesNotMatch(authedImageSource, /window\.localStorage\.getItem/)
  assert.doesNotMatch(canvasShelfSource, /window\.localStorage\.getItem/)
  assert.doesNotMatch(authedImageSource, /movscript\.canvasDebug/)
  assert.doesNotMatch(canvasShelfSource, /movscript\.canvasDebug/)
})

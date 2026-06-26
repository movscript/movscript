import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('project home exposes multiple content canvas documents instead of a single canvas card', () => {
  const source = readFileSync(resolve('src/features/project/components/ProjectOverviewPage.tsx'), 'utf8')

  assert.match(source, /ProjectOverviewCanvasList/)
  assert.match(source, /readContentCanvasDocumentsState/)
  assert.match(source, /createContentCanvasDocument/)
  assert.match(source, /contentCanvasDocumentNodeIds/)
  assert.match(source, /canvasId=\$\{encodeURIComponent\(canvasId\)\}/)
  assert.match(source, /lane\.definition\.id !== 'content_canvas'/)
})

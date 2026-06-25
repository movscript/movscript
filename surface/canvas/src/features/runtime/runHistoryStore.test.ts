import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { CANVAS_RUNTIME_STORAGE_KEY } from './runHistoryStore'

test('canvas runtime history persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/features/canvas/runtime/runHistoryStore.ts'), 'utf8')

  assert.equal(CANVAS_RUNTIME_STORAGE_KEY, 'movscript.canvasRuntime.v1')
  assert.match(source, /createSurfaceStateStorage\(CANVAS_RUNTIME_STORAGE_KEY, fallback\)/)
})

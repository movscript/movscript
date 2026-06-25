import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  calculateShotWorkspaceGridMetrics,
  shotLibraryMeasuredBoxFromRect,
} from './shotLibraryLayout'

test('shot library workspace metrics derive columns and page size from measured dialog box', () => {
  assert.deepEqual(calculateShotWorkspaceGridMetrics({ width: 0, height: 0 }, 3), {
    columns: 2,
    pageSize: 2,
  })

  assert.deepEqual(calculateShotWorkspaceGridMetrics({ width: 640, height: 360 }, 8), {
    columns: 2,
    pageSize: 2,
  })

  assert.deepEqual(calculateShotWorkspaceGridMetrics({ width: 1180, height: 720 }, 12), {
    columns: 4,
    pageSize: 8,
  })
})

test('shot library measurement adapter normalizes DOMRect dimensions', () => {
  assert.deepEqual(shotLibraryMeasuredBoxFromRect({ width: 320.4, height: 180.6 }), {
    width: 320,
    height: 181,
  })
  assert.deepEqual(shotLibraryMeasuredBoxFromRect({ width: -20, height: Number.NaN }), {
    width: 0,
    height: 0,
  })
})

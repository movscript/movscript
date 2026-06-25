import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  shotLibraryMeasuredBoxFromElement,
  subscribeShotLibraryMeasuredBox,
} from './shotLibraryMeasurement'

test('shot library measurement adapter reads normalized dimensions from the measured element', () => {
  assert.deepEqual(
    shotLibraryMeasuredBoxFromElement({
      getBoundingClientRect: () => ({ width: 420.4, height: 210.6 }),
    }),
    { width: 420, height: 211 },
  )
})

test('shot library measurement adapter is safe when no element is available', () => {
  let measured = false
  const unsubscribe = subscribeShotLibraryMeasuredBox(null, () => {
    measured = true
  })

  unsubscribe()
  assert.equal(measured, false)
})

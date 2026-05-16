import assert from 'node:assert/strict'
import test from 'node:test'

import { pickContentWorkbenchUploadTarget } from './contentWorkbenchUploadTarget'

test('content workbench upload target prioritizes missing slot on selected unit', () => {
  const target = pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots: [
      { ID: 10, status: 'locked' },
      { ID: 11, status: 'missing' },
    ],
    momentAssetSlots: [
      { ID: 1, status: 'missing' },
    ],
  })

  assert.equal(target?.ID, 11)
})

test('content workbench upload target falls back to selected unit slot before other moment gaps', () => {
  const target = pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots: [
      { ID: 10, status: 'locked' },
    ],
    momentAssetSlots: [
      { ID: 1, status: 'missing' },
    ],
  })

  assert.equal(target?.ID, 10)
})

test('content workbench upload target falls back to moment gaps when no unit is selected', () => {
  const target = pickContentWorkbenchUploadTarget({
    selectedUnitAssetSlots: [],
    momentAssetSlots: [
      { ID: 1, status: 'locked' },
      { ID: 2, status: 'missing' },
    ],
  })

  assert.equal(target?.ID, 2)
})

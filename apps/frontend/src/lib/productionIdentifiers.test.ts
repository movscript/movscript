import assert from 'node:assert/strict'
import test from 'node:test'

import { productionIdentifier, sceneIdentifier, unitIdentifier } from './productionIdentifiers'

test('formats scene identifiers', () => {
  assert.equal(sceneIdentifier({ scene_code: '3' }), 'Scene 3')
  assert.equal(sceneIdentifier({ scene_code: '  ' }), '')
})

test('formats content unit identifiers by kind', () => {
  assert.equal(unitIdentifier({ kind: 'shot', unit_code: '4' }), 'Cut 4')
  assert.equal(unitIdentifier({ kind: 'voiceover', unit_code: '1' }), 'VO 1')
  assert.equal(unitIdentifier({ kind: 'custom', unit_code: '2' }), 'Item 2')
})

test('joins scene and unit identifiers', () => {
  assert.equal(productionIdentifier({ scene_code: '2' }, { kind: 'shot', unit_code: '5' }), 'Scene 2 · Cut 5')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeNonEmptyString, numberField, uniqueStrings } from './runtimeScalarInput.js'

test('normalizeNonEmptyString trims strings and rejects blank values', () => {
  assert.equal(normalizeNonEmptyString('  value  '), 'value')
  assert.equal(normalizeNonEmptyString('  '), undefined)
  assert.equal(normalizeNonEmptyString(1), undefined)
})

test('numberField accepts only finite numbers', () => {
  assert.equal(numberField(3), 3)
  assert.equal(numberField(Number.NaN), undefined)
  assert.equal(numberField('3'), undefined)
})

test('uniqueStrings preserves first occurrence order', () => {
  assert.deepEqual(uniqueStrings(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c'])
})

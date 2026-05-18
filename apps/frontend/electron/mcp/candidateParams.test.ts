import assert from 'node:assert/strict'
import test from 'node:test'

import { getRequiredPositiveIntegerAliasParam } from './candidateParams.ts'

test('candidate ID aliases resolve a single positive integer', () => {
  assert.equal(getRequiredPositiveIntegerAliasParam({ resource_id: 88 }, ['resource_id', 'outputResourceId'], 'resource_id'), 88)
  assert.equal(getRequiredPositiveIntegerAliasParam({ outputResourceId: '88' }, ['resource_id', 'outputResourceId'], 'resource_id'), 88)
  assert.equal(getRequiredPositiveIntegerAliasParam({ resource_id: 88, outputResourceId: '88' }, ['resource_id', 'outputResourceId'], 'resource_id'), 88)
})

test('candidate ID aliases reject missing, invalid, and conflicting values', () => {
  assert.throws(
    () => getRequiredPositiveIntegerAliasParam({}, ['resource_id', 'outputResourceId'], 'resource_id'),
    /resource_id is required/,
  )
  for (const value of [0, -1, 1.2, Number.NaN, 'abc']) {
    assert.throws(
      () => getRequiredPositiveIntegerAliasParam({ outputResourceId: value }, ['resource_id', 'outputResourceId'], 'resource_id'),
      /resource_id must be a positive integer/,
    )
  }
  assert.throws(
    () => getRequiredPositiveIntegerAliasParam({ resource_id: 88, outputResourceId: 89 }, ['resource_id', 'outputResourceId'], 'resource_id'),
    /resource_id aliases must match/,
  )
})

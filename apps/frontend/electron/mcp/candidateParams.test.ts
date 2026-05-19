import assert from 'node:assert/strict'
import test from 'node:test'

import { getRequiredPositiveIntegerAliasParam, getRequiredPositiveIntegerAliasParams } from './candidateParams.ts'

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

test('candidate resource ID aliases resolve bulk output arrays', () => {
  assert.deepEqual(
    getRequiredPositiveIntegerAliasParams({ output_resource_ids: [88, '89'] }, ['resource_id', 'output_resource_ids'], 'resource_id'),
    [88, 89],
  )
  assert.deepEqual(
    getRequiredPositiveIntegerAliasParams({ resource_ids: [88, 89], outputResourceIds: ['88', '89'] }, ['resource_ids', 'outputResourceIds'], 'resource_id'),
    [88, 89],
  )
})

test('candidate resource ID aliases reject invalid and conflicting bulk values', () => {
  assert.throws(
    () => getRequiredPositiveIntegerAliasParams({ output_resource_ids: [88, 0] }, ['output_resource_ids'], 'resource_id'),
    /resource_id must be a positive integer or positive integer array/,
  )
  assert.throws(
    () => getRequiredPositiveIntegerAliasParams({ resource_ids: [88], outputResourceIds: [88, 89] }, ['resource_ids', 'outputResourceIds'], 'resource_id'),
    /resource_id aliases must match/,
  )
})

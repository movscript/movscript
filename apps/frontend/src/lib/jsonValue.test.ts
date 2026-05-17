import assert from 'node:assert/strict'
import test from 'node:test'
import { isRecord } from './jsonValue'

test('isRecord accepts only plain frontend records', () => {
  class RuntimeRecord {
    value = 'runtime'
  }

  assert.equal(isRecord({ value: 'plain' }), true)
  assert.equal(isRecord(Object.create(null)), true)
  assert.equal(isRecord([]), false)
  assert.equal(isRecord(new Date()), false)
  assert.equal(isRecord(new Map()), false)
  assert.equal(isRecord(new RuntimeRecord()), false)
})

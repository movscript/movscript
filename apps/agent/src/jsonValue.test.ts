import assert from 'node:assert/strict'
import test from 'node:test'
import { isJSONRecord, isJSONValue, isRecord } from './jsonValue.js'

test('isRecord accepts plain objects only', () => {
  assert.equal(isRecord({ ok: true }), true)
  assert.equal(isRecord(null), false)
  assert.equal(isRecord([]), false)
  assert.equal(isRecord('value'), false)
})

test('isJSONValue accepts nested JSON-compatible values', () => {
  assert.equal(isJSONValue({ a: ['x', 1, true, null, { b: false }] }), true)
})

test('isJSONValue rejects non-JSON-compatible nested values', () => {
  assert.equal(isJSONValue({ a: undefined }), false)
  assert.equal(isJSONValue({ a: Symbol('x') }), false)
  assert.equal(isJSONValue({ a: () => undefined }), false)
})

test('isJSONRecord narrows JSON object records', () => {
  assert.equal(isJSONRecord({ ok: true }), true)
  assert.equal(isJSONRecord(['ok']), false)
})

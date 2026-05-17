import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneJSONValue, isJSONRecord, isJSONValue, isRecord } from './jsonValue.js'

test('isRecord accepts plain objects only', () => {
  assert.equal(isRecord({ ok: true }), true)
  assert.equal(isRecord(Object.create(null)), true)
  assert.equal(isRecord(null), false)
  assert.equal(isRecord([]), false)
  assert.equal(isRecord('value'), false)
  assert.equal(isRecord(new Date('2026-01-01T00:00:00.000Z')), false)
  assert.equal(isRecord(new Map([['ok', true]])), false)
  assert.equal(isRecord(new (class CustomRecord {})()), false)
})

test('isJSONValue accepts nested JSON-compatible values', () => {
  assert.equal(isJSONValue({ a: ['x', 1, true, null, { b: false }] }), true)
})

test('isJSONValue rejects non-JSON-compatible nested values', () => {
  assert.equal(isJSONValue({ a: undefined }), false)
  assert.equal(isJSONValue({ a: Symbol('x') }), false)
  assert.equal(isJSONValue({ a: () => undefined }), false)
  assert.equal(isJSONValue({ a: Number.NaN }), false)
  assert.equal(isJSONValue({ a: Number.POSITIVE_INFINITY }), false)
  assert.equal(isJSONValue(new Date('2026-01-01T00:00:00.000Z')), false)
  assert.equal(isJSONValue(new Map([['ok', true]])), false)
  assert.equal(isJSONValue(new (class CustomRecord {})()), false)
})

test('isJSONRecord narrows JSON object records', () => {
  assert.equal(isJSONRecord({ ok: true }), true)
  assert.equal(isJSONRecord(['ok']), false)
  assert.equal(isJSONRecord(new Date('2026-01-01T00:00:00.000Z')), false)
})

test('cloneJSONValue returns an independent JSON snapshot', () => {
  const source = { a: ['x', { b: true }] }
  const cloned = cloneJSONValue(source)

  source.a[1] = { b: false }

  assert.deepEqual(cloned, { a: ['x', { b: true }] })
})

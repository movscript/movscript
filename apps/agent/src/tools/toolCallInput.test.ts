import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeApprovedToolNames, normalizeStringArray, normalizeToolCall } from './toolCallInput.js'

test('normalizeStringArray keeps unique non-empty string values', () => {
  assert.deepEqual(normalizeStringArray(['a', '', 'a', ' b ', 1, null]), ['a', ' b '])
  assert.deepEqual(normalizeStringArray('a'), [])
})

test('normalizeApprovedToolNames delegates to string-list normalization', () => {
  assert.deepEqual(normalizeApprovedToolNames(['tool_a', 'tool_a', 'tool_b']), ['tool_a', 'tool_b'])
})

test('normalizeToolCall accepts named calls with record args', () => {
  assert.deepEqual(normalizeToolCall({ name: ' tool ', args: { value: 1 } }), {
    name: 'tool',
    args: { value: 1 },
  })
})

test('normalizeToolCall omits non-record args and rejects invalid calls', () => {
  assert.deepEqual(normalizeToolCall({ name: 'tool', args: 'nope' }), { name: 'tool' })
  assert.equal(normalizeToolCall({ name: '' }), undefined)
  assert.equal(normalizeToolCall(null), undefined)
})

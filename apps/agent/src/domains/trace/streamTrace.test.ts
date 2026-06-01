import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeModelStreamTrace, summarizeModelStreamTraceData } from './streamTrace.js'

test('summarizeModelStreamTrace hashes stream text and tool arguments', () => {
  const summary = summarizeModelStreamTrace({
    kind: 'tool_call',
    delta: 'raw delta',
    accumulated: 'raw accumulated',
    toolCall: {
      index: 0,
      id: 'call_1',
      type: 'function',
      name: 'tool_a',
      argumentsDelta: '{"secret"',
      argumentsBuffer: '{"secret":"value"}',
      argumentsJSON: { secret: 'value' },
      parseStatus: 'valid_json',
    },
  })

  const json = JSON.stringify(summary)
  assert.equal(summary.kind, 'tool_call')
  assert.match(json, /deltaHash/)
  assert.match(json, /accumulatedHash/)
  assert.match(json, /argumentsBufferHash/)
  assert.match(json, /argumentsJSONHash/)
  assert.doesNotMatch(json, /raw delta/)
  assert.doesNotMatch(json, /raw accumulated/)
  assert.doesNotMatch(json, /secret/)
  assert.doesNotMatch(json, /value/)
})

test('summarizeModelStreamTraceData only rewrites nested stream payloads', () => {
  const data = summarizeModelStreamTraceData({
    phase: 'stream',
    latencyMs: 12,
    stream: { kind: 'reasoning', delta: 'private reasoning', accumulated: 'private reasoning' },
  }) as Record<string, unknown>

  assert.equal(data.phase, 'stream')
  assert.equal(data.latencyMs, 12)
  assert.match(JSON.stringify(data.stream), /deltaHash/)
  assert.doesNotMatch(JSON.stringify(data), /private reasoning/)
  assert.deepEqual(summarizeModelStreamTraceData({ phase: 'request' }), { phase: 'request' })
})

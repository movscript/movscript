import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeTraceQuery } from './server.js'

test('normalizeTraceQuery accepts bounded pagination and known trace kind', () => {
  const result = normalizeTraceQuery(new URL('http://127.0.0.1/runs/run_1/trace?cursor=trace_1&limit=25&kind=model_call'))

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.query, {
    cursor: 'trace_1',
    limit: 25,
    kind: 'model_call',
  })
})

test('normalizeTraceQuery rejects unknown trace kind', () => {
  const result = normalizeTraceQuery(new URL('http://127.0.0.1/runs/run_1/trace?kind=unknown_kind'))

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /invalid trace kind/)
})

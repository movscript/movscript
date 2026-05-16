import assert from 'node:assert/strict'
import test from 'node:test'
import { extractAgentContext, extractFocusTimings } from './runtimeContext.js'
import type { JSONValue } from '../types.js'

test('extractAgentContext reads project and production ids from focus payloads', () => {
  assert.deepEqual(extractAgentContext({
    data: {
      focus: {
        project: { id: 42 },
        productionId: 99,
      },
    },
  }), {
    currentProjectId: 42,
    currentProductionId: 99,
  })
})

test('extractFocusTimings reads explicit focus timings', () => {
  assert.deepEqual(extractFocusTimings({
    data: {
      timings: {
        totalMs: 120,
        focusMs: 80,
      },
    },
  }), {
    totalMs: 120,
    focusMs: 80,
  })
})

test('extractFocusTimings falls back focusMs to totalMs', () => {
  const result: JSONValue = {
    content: [{
      type: 'text',
      text: JSON.stringify({ timings: { totalMs: 50 } }),
    }],
  }

  assert.deepEqual(extractFocusTimings(result), {
    totalMs: 50,
    focusMs: 50,
  })
})

test('extractFocusTimings ignores invalid timings', () => {
  assert.equal(extractFocusTimings({ data: { timings: { totalMs: Number.NaN } } }), undefined)
  assert.equal(extractFocusTimings({ data: { timings: 'none' } }), undefined)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { extractAgentContext, extractFocusTimings, isValidAgentReferenceId } from './runtimeContext.js'
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

test('extractAgentContext ignores invalid project ids', () => {
  for (const projectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(extractAgentContext({
      data: {
        focus: {
          project: { id: projectId },
          productionId: 99,
        },
      },
    }), {
      currentProjectId: undefined,
      currentProductionId: 99,
    })
  }
})

test('extractAgentContext ignores invalid production ids', () => {
  for (const productionId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(extractAgentContext({
      data: {
        focus: {
          project: { id: 42 },
          productionId,
        },
      },
    }), {
      currentProjectId: 42,
      currentProductionId: undefined,
    })
  }
})

test('isValidAgentReferenceId accepts non-empty string refs and positive safe integer refs only', () => {
  assert.equal(isValidAgentReferenceId('entity_1'), true)
  assert.equal(isValidAgentReferenceId(42), true)
  for (const value of ['', '   ', 0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(isValidAgentReferenceId(value), false)
  }
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

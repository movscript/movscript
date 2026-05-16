import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultRunPolicy, normalizeRunPolicyOverride } from './runPolicy.js'

test('defaultRunPolicy returns interactive standard limits by default', () => {
  assert.deepEqual(defaultRunPolicy(), {
    approvalMode: 'interactive',
    maxToolCalls: 20,
    maxIterations: 20,
    allowNetwork: false,
    allowFileBytes: false,
    workflow: { profile: 'standard', includeMemories: true, allowForcedToolCalls: true },
  })
})

test('defaultRunPolicy preserves explicit approval, sandbox, workflow, and numeric overrides', () => {
  assert.deepEqual(defaultRunPolicy({
    approvalMode: 'auto',
    sandboxMode: true,
    workflow: { profile: 'compact', includeMemories: false, allowForcedToolCalls: false },
    policy: { maxToolCalls: 3, maxIterations: 5 },
  }), {
    approvalMode: 'auto',
    sandboxMode: true,
    maxToolCalls: 3,
    maxIterations: 5,
    allowNetwork: false,
    allowFileBytes: false,
    workflow: { profile: 'compact', includeMemories: false, allowForcedToolCalls: false },
  })
})

test('normalizeRunPolicyOverride clamps positive numeric limits and ignores invalid values', () => {
  assert.deepEqual(normalizeRunPolicyOverride({ maxToolCalls: 0, maxIterations: Number.NaN }), {})
  assert.deepEqual(normalizeRunPolicyOverride({ maxToolCalls: 1.8, maxIterations: 500 }), {
    maxToolCalls: 1,
    maxIterations: 200,
  })
  assert.deepEqual(normalizeRunPolicyOverride(null), {})
})

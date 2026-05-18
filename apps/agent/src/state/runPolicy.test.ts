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
  assert.deepEqual(normalizeRunPolicyOverride({ approvalMode: 'root', maxToolCalls: 0, maxIterations: Number.NaN }), {})
  assert.deepEqual(normalizeRunPolicyOverride({ approvalMode: 'auto_readonly', maxToolCalls: 1.8, maxIterations: 500 }), {
    approvalMode: 'auto_readonly',
    maxToolCalls: 1,
    maxIterations: 200,
  })
  assert.deepEqual(normalizeRunPolicyOverride(null), {})
})

test('defaultRunPolicy lets policy override approval mode for client settings', () => {
  assert.equal(defaultRunPolicy({
    approvalMode: 'interactive',
    policy: { approvalMode: 'auto_readonly' },
  }).approvalMode, 'auto_readonly')
})

test('normalizeRunPolicyOverride ignores non-plain policy override objects', () => {
  class RuntimePolicy {
    maxToolCalls = 99
    maxIterations = 99
  }

  assert.deepEqual(normalizeRunPolicyOverride(new RuntimePolicy()), {})
})

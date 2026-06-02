import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultRuntimeLimits, normalizeRuntimeLimitsOverride } from './runtimeLimits.js'

test('defaultRuntimeLimits returns interactive standard limits by default', () => {
  assert.deepEqual(defaultRuntimeLimits(), {
    approvalMode: 'interactive',
    maxToolCalls: 20,
    maxIterations: 20,
    allowNetwork: false,
    allowFileBytes: false,
    execution: { mode: 'standard', includeMemories: true, allowForcedToolCalls: true },
  })
})

test('defaultRuntimeLimits preserves explicit approval, sandbox, execution, and numeric overrides', () => {
  assert.deepEqual(defaultRuntimeLimits({
    approvalMode: 'auto',
    sandboxMode: true,
    execution: { mode: 'compact', includeMemories: false, allowForcedToolCalls: false },
    override: { maxToolCalls: 3, maxIterations: 5 },
  }), {
    approvalMode: 'auto',
    sandboxMode: true,
    maxToolCalls: 3,
    maxIterations: 5,
    allowNetwork: false,
    allowFileBytes: false,
    execution: { mode: 'compact', includeMemories: false, allowForcedToolCalls: false },
  })
})

test('defaultRuntimeLimits uses config file defaults before per-run runtime limit overrides', () => {
  assert.deepEqual(defaultRuntimeLimits({
    maxToolCalls: 6.8,
    maxIterations: 9,
    execution: { mode: 'deep', includeMemories: true, allowForcedToolCalls: false },
    override: { maxIterations: 2 },
  }), {
    approvalMode: 'interactive',
    maxToolCalls: 6,
    maxIterations: 2,
    allowNetwork: false,
    allowFileBytes: false,
    execution: { mode: 'deep', includeMemories: true, allowForcedToolCalls: false },
  })
})

test('normalizeRuntimeLimitsOverride clamps positive numeric limits and ignores invalid values', () => {
  assert.deepEqual(normalizeRuntimeLimitsOverride({ approvalMode: 'root', maxToolCalls: 0, maxIterations: Number.NaN }), {})
  assert.deepEqual(normalizeRuntimeLimitsOverride({
    approvalMode: 'auto_readonly',
    sandboxMode: true,
    maxToolCalls: 1.8,
    maxIterations: 500,
    execution: { mode: 'compact', includeMemories: false, allowForcedToolCalls: false },
  }), {
    approvalMode: 'auto_readonly',
    sandboxMode: true,
    maxToolCalls: 1,
    maxIterations: 200,
    execution: { mode: 'compact', includeMemories: false, allowForcedToolCalls: false },
  })
  assert.deepEqual(normalizeRuntimeLimitsOverride(null), {})
})

test('defaultRuntimeLimits lets runtime limits override approval mode for client settings', () => {
  assert.equal(defaultRuntimeLimits({
    approvalMode: 'interactive',
    override: { approvalMode: 'auto_readonly' },
  }).approvalMode, 'auto_readonly')
})

test('normalizeRuntimeLimitsOverride ignores non-plain runtime limits override objects', () => {
  class RuntimeLimits {
    maxToolCalls = 99
    maxIterations = 99
  }

  assert.deepEqual(normalizeRuntimeLimitsOverride(new RuntimeLimits()), {})
})

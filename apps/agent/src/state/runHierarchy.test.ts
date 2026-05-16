import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRunHierarchyInput, normalizeRunProgress, normalizeRunRole } from './runHierarchy.js'

test('normalizeRunHierarchyInput applies default role and trims hierarchy ids', () => {
  assert.deepEqual(normalizeRunHierarchyInput({
    parentRunId: ' parent ',
    planId: ' plan ',
    taskId: ' task ',
  }, { defaultRole: 'planner' }), {
    role: 'planner',
    parentRunId: 'parent',
    planId: 'plan',
    taskId: 'task',
  })
})

test('normalizeRunHierarchyInput prefers explicit valid role over default role', () => {
  assert.deepEqual(normalizeRunHierarchyInput({ role: 'worker' }, { defaultRole: 'planner' }), {
    role: 'worker',
  })
})

test('normalizeRunHierarchyInput drops invalid ids and keeps clamped progress and blocked reason', () => {
  assert.deepEqual(normalizeRunHierarchyInput({
    role: 'invalid',
    parentRunId: ' ',
    planId: 123,
    taskId: null,
    progress: '1.5',
    blockedReason: ' Needs approval ',
  }), {
    progress: 1,
    blockedReason: 'Needs approval',
  })
})

test('normalizeRunRole accepts only planner and worker roles', () => {
  assert.equal(normalizeRunRole('planner'), 'planner')
  assert.equal(normalizeRunRole('worker'), 'worker')
  assert.equal(normalizeRunRole('assistant'), undefined)
})

test('normalizeRunProgress clamps finite numeric values and ignores invalid values', () => {
  assert.equal(normalizeRunProgress(-1), 0)
  assert.equal(normalizeRunProgress('0.25'), 0.25)
  assert.equal(normalizeRunProgress(2), 1)
  assert.equal(normalizeRunProgress('nope'), undefined)
  assert.equal(normalizeRunProgress(undefined), undefined)
})

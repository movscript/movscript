import assert from 'node:assert/strict'
import test from 'node:test'

import { shallowReferenceArrayEqual } from '@/features/agent/components/AgentRenderEquality'

test('shallowReferenceArrayEqual compares array items by reference', () => {
  const item = { id: 'a' }
  assert.equal(shallowReferenceArrayEqual([item], [item]), true)
  assert.equal(shallowReferenceArrayEqual([{ id: 'a' }], [{ id: 'a' }]), false)
  assert.equal(shallowReferenceArrayEqual(undefined, []), false)
})

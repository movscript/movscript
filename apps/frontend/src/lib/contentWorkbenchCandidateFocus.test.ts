import assert from 'node:assert/strict'
import test from 'node:test'

import { pickContentWorkbenchFirstUsableUnit, pickContentWorkbenchFocusAfterIgnoredCandidate } from './contentWorkbenchCandidateFocus'

test('content workbench returns to a confirmed unit after ignoring the current candidate', () => {
  assert.equal(pickContentWorkbenchFocusAfterIgnoredCandidate([
    { id: 1, status: 'draft' },
    { id: 2, status: 'confirmed' },
    { id: 3, status: 'candidate' },
  ], 1), 2)
})

test('content workbench can fall back to another candidate after ignore', () => {
  assert.equal(pickContentWorkbenchFocusAfterIgnoredCandidate([
    { id: 1, status: 'draft' },
    { id: 2, status: 'ignored' },
    { id: 3, status: 'candidate' },
  ], 1), 3)
})

test('content workbench clears unit focus when no useful unit remains', () => {
  assert.equal(pickContentWorkbenchFocusAfterIgnoredCandidate([
    { id: 1, status: 'draft' },
    { id: 2, status: 'archived' },
    { id: 3, status: 'rejected' },
  ], 1), null)
})

test('content workbench first usable unit prefers confirmed production targets', () => {
  assert.equal(pickContentWorkbenchFirstUsableUnit([
    { id: 1, status: 'candidate' },
    { id: 2, status: 'locked' },
    { id: 3, status: 'draft' },
  ]), 2)
})

test('content workbench first usable unit skips ignored or rejected units', () => {
  assert.equal(pickContentWorkbenchFirstUsableUnit([
    { id: 1, status: 'ignored' },
    { id: 2, status: 'rejected' },
    { id: 3, status: 'candidate' },
  ]), 3)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { sourceBoundaryForContextRef } from './sourceBoundary.js'

test('source boundary classifies knowledge as advisory context', () => {
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'knowledge', id: 'storyboard.rhythm.basic' }, 'runtime'), {
    source: 'knowledge',
    evidence: 'advisory',
  })
})

test('source boundary classifies drafts and memories separately from project facts', () => {
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'draft', id: 'draft_1' }, 'runtime'), {
    source: 'draft',
    evidence: 'draft',
  })
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'memory', id: 'memory_1' }, 'runtime'), {
    source: 'memory',
    evidence: 'summary',
  })
})

test('source boundary classifies backend and mcp project refs as verified facts', () => {
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'project', id: '12' }, 'runtime'), {
    source: 'backend',
    evidence: 'verified',
  })
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'production', id: '7' }, 'mcp'), {
    source: 'mcp',
    evidence: 'verified',
  })
})

test('source boundary keeps sandbox tool results advisory', () => {
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'tool_result', id: 'call_1' }, 'sandbox'), {
    source: 'tool_result',
    evidence: 'advisory',
  })
})

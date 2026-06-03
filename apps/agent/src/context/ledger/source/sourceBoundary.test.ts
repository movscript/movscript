import assert from 'node:assert/strict'
import test from 'node:test'
import { sourceBoundaryForContextRef } from './sourceBoundary.js'

test('source boundary classifies reference as advisory context', () => {
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'reference', id: 'storyboard.rhythm.basic' }, 'runtime'), {
    source: 'reference',
    evidence: 'advisory',
  })
})

test('source boundary classifies workspaces and memories separately from project facts', () => {
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'workspace', id: 'workspace_1' }, 'runtime'), {
    source: 'workspace',
    evidence: 'workspace',
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
  assert.deepEqual(sourceBoundaryForContextRef({ type: 'project', id: '13' }, 'mcp'), {
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

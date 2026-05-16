import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertRunExecutionNotCancelled,
  collectRunSubtreeIds,
  createAbortError,
  durationBetweenMs,
  isAbortError,
  normalizeCancelReason,
  normalizeOptionalCancelReason,
  RuntimeRunControllerRegistry,
} from './runLifecycleControl.js'
import type { AgentRun } from '../state/types.js'

test('createAbortError marks cancellation errors with AbortError name', () => {
  const error = createAbortError('stop now')
  assert.equal(error.message, 'stop now')
  assert.equal(error.name, 'AbortError')
  assert.equal(isAbortError(error), true)
  assert.equal(isAbortError(new Error('stop now')), false)
})

test('assertRunExecutionNotCancelled throws for aborted signals and cancelled persisted runs', () => {
  const controller = new AbortController()
  controller.abort('stop now')
  assert.throws(() => assertRunExecutionNotCancelled({
    runId: 'run_1',
    signal: controller.signal,
    getRunStatus: () => 'in_progress',
  }), (error) => error instanceof Error && error.name === 'AbortError' && error.message === 'stop now')

  assert.throws(() => assertRunExecutionNotCancelled({
    runId: 'run_1',
    getRunStatus: () => 'cancelled',
  }), (error) => error instanceof Error && error.name === 'AbortError' && error.message === 'Run was cancelled.')

  assert.doesNotThrow(() => assertRunExecutionNotCancelled({
    runId: 'run_1',
    getRunStatus: () => 'in_progress',
  }))
})

test('durationBetweenMs returns non-negative finite differences only', () => {
  assert.equal(durationBetweenMs('2026-05-16T00:00:00.000Z', '2026-05-16T00:00:01.500Z'), 1500)
  assert.equal(durationBetweenMs('bad', '2026-05-16T00:00:01.500Z'), undefined)
  assert.equal(durationBetweenMs('2026-05-16T00:00:02.000Z', '2026-05-16T00:00:01.000Z'), undefined)
})

test('normalizeCancelReason trims input and falls back for empty values', () => {
  assert.equal(normalizeCancelReason(' stop '), 'stop')
  assert.equal(normalizeCancelReason('  '), 'Run subtree was cancelled.')
  assert.equal(normalizeCancelReason(undefined, 'fallback'), 'fallback')
})

test('normalizeOptionalCancelReason trims input and returns undefined for empty values', () => {
  assert.equal(normalizeOptionalCancelReason(' stop '), 'stop')
  assert.equal(normalizeOptionalCancelReason('  '), undefined)
  assert.equal(normalizeOptionalCancelReason(undefined), undefined)
})

test('collectRunSubtreeIds returns depth-first run subtree ids', () => {
  const children = new Map<string, AgentRun[]>([
    ['run_root', [run('run_a'), run('run_b')]],
    ['run_a', [run('run_c')]],
  ])
  assert.deepEqual(collectRunSubtreeIds('run_root', (runId) => children.get(runId) ?? []), [
    'run_root',
    'run_a',
    'run_c',
    'run_b',
  ])
})

test('RuntimeRunControllerRegistry creates, returns, and releases matching controllers only', () => {
  const registry = new RuntimeRunControllerRegistry()
  const first = registry.create('run_1')
  const second = registry.create('run_1')

  assert.equal(registry.get('run_1'), second)
  registry.release('run_1', first)
  assert.equal(registry.get('run_1'), second)
  registry.release('run_1', second)
  assert.equal(registry.get('run_1'), undefined)
})

function run(id: string): AgentRun {
  return {
    id,
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

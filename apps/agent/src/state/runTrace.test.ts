import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { appendTraceEvent, buildRunStep } from './runTrace.js'

test('buildRunStep creates in-progress step with round metadata', () => {
  const step = buildRunStep({
    id: 'step_1',
    runId: 'run_1',
    type: 'tool_call',
    toolName: 'movscript_read_project_scripts',
    createdAt: '2026-05-06T00:00:00.000Z',
    round: {
      roundId: 'round_1',
      roundIndex: 1,
      roundLabel: 'Model turn 1',
      roundSource: 'model',
    },
  })

  assert.equal(step.status, 'in_progress')
  assert.equal(step.roundId, 'round_1')
  assert.equal(step.roundSource, 'model')
  assert.equal(step.toolName, 'movscript_read_project_scripts')
})

test('appendTraceEvent builds sanitized trace data and updates run timestamp without mutating run trace list', () => {
  const run = {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress' as const,
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: {
      approvalMode: 'interactive' as const,
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    steps: [],
    traceEvents: [],
  }

  const event = appendTraceEvent({
    id: 'trace_1',
    run,
    now: '2026-05-06T00:00:01.000Z',
    kind: 'policy',
    title: 'Policy',
    status: 'completed',
    data: {
      keep: 'value',
      skip: undefined,
      nested: { value: 1, unsupported: Symbol('x') },
    },
  })

  assert.equal(run.traceEvents.length, 0)
  assert.equal(run.updatedAt, '2026-05-06T00:00:01.000Z')
  assert.equal(event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data.keep : undefined, 'value')
  assert.equal(event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? 'skip' in event.data : true, false)
  assert.deepEqual(event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data.nested : undefined, {
    value: 1,
    unsupported: 'Symbol(x)',
  })
})

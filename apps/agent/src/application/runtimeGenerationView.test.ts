import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultRunPolicy } from '../state/runPolicy.js'
import type { AgentRun, AgentTraceEvent } from '../state/types.js'
import { buildRuntimeRunGenerationView } from './runtimeGenerationView.js'

test('buildRuntimeRunGenerationView replays generation progress and media from run trace', () => {
  const run = makeRun()
  const events: AgentTraceEvent[] = [
    trace('trace_1', {
      generation: {
        jobId: 7,
        jobType: 'image',
        providerName: 'Provider A',
        modelDisplay: 'Image Model',
        modelIdentifier: 'image-model',
        modelConfigId: 12,
        status: 'running',
        stage: 'rendering',
        progress: 0.4,
        outputResourceId: 41,
      },
    }),
    trace('trace_2', {
      generation: {
        jobId: 7,
        jobType: 'image',
        providerName: 'Provider A',
        modelDisplay: 'Image Model',
        modelIdentifier: 'image-model',
        modelConfigId: 12,
        status: 'succeeded',
        stage: 'completed',
        terminal: true,
        outputResources: [{
          ID: 41,
          owner_id: 1,
          type: 'image',
          name: 'result.png',
          url: '/api/v1/resources/41/file',
          size: 1234,
          mime_type: 'image/png',
        }],
      },
    }),
  ]

  const view = buildRuntimeRunGenerationView({
    run,
    events,
    generatedAt: '2026-01-01T00:00:10.000Z',
  })

  assert.equal(view.schema, 'movscript.agent-run-generation-view.v1')
  assert.equal(view.generatedAt, '2026-01-01T00:00:10.000Z')
  assert.equal(view.runId, run.id)
  assert.equal(view.jobs.length, 1)
  assert.equal(view.latestJob?.jobId, 7)
  assert.equal(view.latestJob?.status, 'succeeded')
  assert.equal(view.latestJob?.terminal, true)
  assert.deepEqual(view.outputResourceIds, [41])
  assert.equal(view.outputResources[0]?.ID, 41)
  assert.equal(view.metadataByResourceId['41']?.modelDisplay, 'Image Model')
  assert.equal(view.active, 0)
  assert.equal(view.terminal, 1)
  assert.equal(view.succeeded, 1)
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    role: 'planner',
    policy: defaultRunPolicy(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

function trace(id: string, data: AgentTraceEvent['data']): AgentTraceEvent {
  return {
    id,
    runId: 'run_1',
    kind: 'tool_call',
    title: id,
    status: 'completed',
    data,
    createdAt: id === 'trace_1' ? '2026-01-01T00:00:01.000Z' : '2026-01-01T00:00:02.000Z',
  }
}

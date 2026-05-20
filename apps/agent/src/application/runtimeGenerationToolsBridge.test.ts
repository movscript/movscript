import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRun, JSONValue } from '../state/types.js'
import { createRuntimeGenerationToolsBridge } from './runtimeGenerationToolsBridge.js'

test('createRuntimeGenerationToolsBridge wires generation wait through runtime tracing', async () => {
  const traces: string[] = []
  const run = { id: 'run_1' } as AgentRun
  const bridge = createRuntimeGenerationToolsBridge({
    mcpClient: { label: 'mcpClient' } as never,
    recordTrace: (_run, trace) => {
      traces.push(`${trace.toolName}:${trace.status}:${trace.title}`)
    },
    waitFlow: async (input) => {
      assert.deepEqual(input.request, { jobIds: [42] })
      input.onGenerationEvent?.({
        kind: 'generation_job',
        stage: 'completed',
        toolName: 'movscript_get_generation_job',
        jobId: 42,
        status: 'succeeded',
        terminal: true,
        message: 'Job #42 done.',
      })
      return {
        status: 'completed',
        done: true,
        mode: 'all',
        jobIds: [42],
        jobs: [{ jobId: 42, status: 'succeeded', terminal: true }],
        completed: [{ jobId: 42, status: 'succeeded', terminal: true }],
        pending: [],
        failed: [],
        cancelled: [],
        timeout_ms: 100,
        heartbeat_ms: 10,
        terminal: true,
        message: '生成任务完成。',
      }
    },
  })

  const result = await bridge.waitGenerationJobs(run, { jobIds: [42] })

  assert.equal((result as Record<string, JSONValue>).status, 'completed')
  assert.deepEqual(traces, [
    'movscript_wait_generation_jobs:completed:Generation completed: Job #42',
    'movscript_wait_generation_jobs:completed:Generation wait completed',
  ])
})

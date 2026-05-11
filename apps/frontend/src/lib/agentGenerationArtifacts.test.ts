import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentRun } from './localAgentClient'
import { selectLatestGeneratedResource } from './agentGenerationArtifacts'

function runWithResults(results: unknown[]): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    policy: { maxToolCalls: 10, maxIterations: 6 },
    steps: results.map((result, index) => ({
      id: `step_${index}`,
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: index === 0 ? 'movscript_create_generation_job' : 'movscript_get_generation_job',
      result,
      createdAt: new Date(index).toISOString(),
    })),
  } as unknown as AgentRun
}

test('selectLatestGeneratedResource reads MCP data wrapper output resources', () => {
  const run = runWithResults([
    {
      data: {
        status: 'succeeded',
        jobId: 101,
        output_resource_id: 202,
      },
    },
  ])

  assert.deepEqual(selectLatestGeneratedResource(run), {
    jobId: 101,
    outputResourceId: 202,
  })
})

test('selectLatestGeneratedResource uses the latest generation result', () => {
  const run = runWithResults([
    { output_resource_id: 201, job: { ID: 101 } },
    { output_resource: { ID: 202 }, jobId: 102 },
  ])

  assert.deepEqual(selectLatestGeneratedResource(run), {
    jobId: 102,
    outputResourceId: 202,
  })
})

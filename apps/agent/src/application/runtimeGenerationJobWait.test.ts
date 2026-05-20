import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONValue } from '../state/types.js'
import { waitRuntimeGenerationJobs } from './runtimeGenerationJobWait.js'

test('waitRuntimeGenerationJobs polls generation jobs until all are terminal', async () => {
  const calls: Array<{ name: string; args: Record<string, JSONValue> }> = []
  const statuses = new Map<number, string>([
    [101, 'running'],
    [102, 'running'],
  ])
  let current = 0
  let sleepCalls = 0

  const result = await waitRuntimeGenerationJobs({
    mcpClient: {
      initialize: async () => ({}),
      callTool: async (name, args = {}) => {
        calls.push({ name, args })
        const jobId = Number(args.jobId)
        return {
          data: {
            jobId,
            status: statuses.get(jobId) ?? 'running',
            progress: statuses.get(jobId) === 'succeeded' ? 100 : 50,
            ...(jobId === 101 && statuses.get(jobId) === 'succeeded' ? { output_resource_id: 901 } : {}),
          },
        }
      },
    },
    request: { jobIds: [101, 102], projectId: 7, timeout_ms: 1_000, poll_interval_ms: 100 },
    currentTimeMs: () => current,
    sleep: async () => {
      sleepCalls += 1
      current += 100
      statuses.set(101, 'succeeded')
      statuses.set(102, 'succeeded')
    },
  })

  assert.equal(sleepCalls, 1)
  assert.equal(result.status, 'completed')
  assert.equal(result.done, true)
  assert.deepEqual(result.jobIds, [101, 102])
  assert.equal(result.completed.length, 2)
  assert.deepEqual(result.pending, [])
  assert.deepEqual(result.output_resource_ids, [901])
  assert.deepEqual(calls.map((call) => call.name), [
    'movscript_get_generation_job',
    'movscript_get_generation_job',
    'movscript_get_generation_job',
    'movscript_get_generation_job',
  ])
  assert.deepEqual(calls[0]?.args, { jobId: 101, projectId: 7 })
})

test('waitRuntimeGenerationJobs returns timeout without treating pending jobs as failed', async () => {
  let current = 0

  const result = await waitRuntimeGenerationJobs({
    mcpClient: {
      initialize: async () => ({}),
      callTool: async (_name, args = {}) => ({
        data: {
          jobId: args.jobId,
          status: 'running',
          terminal: false,
        },
      }),
    },
    request: { jobId: 201, timeout_ms: 100, poll_interval_ms: 100 },
    currentTimeMs: () => current,
    sleep: async () => {
      current += 100
    },
  })

  assert.equal(result.status, 'timeout')
  assert.equal(result.done, false)
  assert.equal(result.pending.length, 1)
  assert.equal(result.failed.length, 0)
})

test('waitRuntimeGenerationJobs supports any mode with partial status', async () => {
  const result = await waitRuntimeGenerationJobs({
    mcpClient: {
      initialize: async () => ({}),
      callTool: async (_name, args = {}) => ({
        data: {
          jobId: args.jobId,
          status: args.jobId === 301 ? 'succeeded' : 'running',
          terminal: args.jobId === 301,
        },
      }),
    },
    request: { jobIds: [301, 302], mode: 'any', timeout_ms: 0 },
  })

  assert.equal(result.status, 'partial')
  assert.equal(result.done, true)
  assert.equal(result.completed.length, 1)
  assert.equal(result.pending.length, 1)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentIOManager } from './agentIOManager.js'
import { GenerationJobIOProvider } from './providers/generationJobProvider.js'
import type { JSONValue } from '../types.js'
import { MCPError } from '../mcpClient.js'

test('AgentIOManager starts and waits generation job operations', async () => {
  const calls: Array<{ name: string; args: Record<string, JSONValue> }> = []
  let observed = false
  const manager = new AgentIOManager({
    providers: [new GenerationJobIOProvider({
      initialize: async () => ({}),
      callTool: async (name, args = {}) => {
        calls.push({ name, args })
        if (name === 'movscript_create_generation_job') {
          return { data: { jobId: 42, status: 'queued', terminal: false } } as JSONValue
        }
        observed = true
        return { data: { jobId: 42, status: 'succeeded', terminal: true, output_resource_id: 9001 } } as JSONValue
      },
    })],
  })

  const operation = await manager.start({
    runId: 'run_1',
    kind: 'generation_job',
    request: { prompt: 'make image', job_type: 'image' },
  })

  assert.equal(operation.kind, 'generation_job')
  assert.equal(operation.status, 'waiting')
  assert.deepEqual(operation.externalHandle, { provider: 'movscript', type: 'generation_job', id: 42 })

  const wait = await manager.wait({ operationIds: [operation.id], timeoutMs: 0 })

  assert.equal(observed, true)
  assert.equal(wait.status, 'completed')
  assert.equal(wait.done, true)
  assert.equal(wait.completed[0]?.status, 'completed')
  assert.deepEqual(calls.map((call) => call.name), ['movscript_create_generation_job', 'movscript_get_generation_job'])
})

test('AgentIOManager can cancel generation job operations', async () => {
  const manager = new AgentIOManager({
    providers: [new GenerationJobIOProvider({
      initialize: async () => ({}),
      callTool: async (name, args = {}) => {
        if (name === 'movscript_create_generation_job') return { data: { jobId: 77, status: 'queued', terminal: false } } as JSONValue
        if (name === 'movscript_cancel_generation_job') return { data: { jobId: args.jobId, status: 'cancelled', terminal: true } } as JSONValue
        throw new Error(`unexpected tool ${name}`)
      },
    })],
  })

  const operation = await manager.start({
    runId: 'run_1',
    kind: 'generation_job',
    request: { prompt: 'make image' },
  })
  const cancelled = await manager.cancel(operation.id)

  assert.equal(cancelled.status, 'cancelled')
  assert.equal(manager.get(operation.id).status, 'cancelled')
})

test('GenerationJobIOProvider retries once with backend suggested_fix', async () => {
  const calls: Array<{ name: string; args: Record<string, JSONValue> }> = []
  const manager = new AgentIOManager({
    providers: [new GenerationJobIOProvider({
      initialize: async () => ({}),
      callTool: async (name, args = {}) => {
        calls.push({ name, args })
        if (calls.length === 1) {
          throw new MCPError('backend rejected', -32000, {
            type: 'backend_http_error',
            status: 400,
            code: 'INVALID_PARAMETER_OPTION',
            suggested_fix: { aspect_ratio: '16:9' },
          })
        }
        return { data: { jobId: 88, status: 'queued', terminal: false, repair_note: args.repair_note } } as JSONValue
      },
    })],
  })

  const operation = await manager.start({
    runId: 'run_1',
    kind: 'generation_job',
    request: { prompt: 'make image', aspect_ratio: 'bad' },
  })

  assert.equal(operation.status, 'waiting')
  assert.equal(calls.length, 2)
  assert.equal(calls[1]?.args.aspect_ratio, '16:9')
  assert.equal((operation.result as any).repair_note, 'Retried once with backend suggested_fix after generation parameter validation failed.')
})

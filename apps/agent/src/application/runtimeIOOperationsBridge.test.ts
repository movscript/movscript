import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeIOOperationsBridge } from './runtimeIOOperationsBridge.js'
import type { AgentRun, AgentTraceEvent } from '../state/types.js'

test('runtime operation bridge delegates operations and records traces', async () => {
  const calls: string[] = []
  const traces: AgentTraceEvent[] = []
  const operation = {
    id: 'io_1',
    runId: 'run_1',
    kind: 'generation_job' as const,
    mode: 'async' as const,
    status: 'waiting' as const,
    request: { prompt: 'image' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const bridge = createRuntimeIOOperationsBridge({
    ioManager: {
      start: async (input: unknown) => {
        calls.push(`start:${JSON.stringify(input)}`)
        return operation
      },
      get: (operationId: string) => {
        calls.push(`get:${operationId}`)
        return operation
      },
      list: () => {
        calls.push('list')
        return [operation]
      },
      wait: async (input: { onOperation?: (item: any) => void }) => {
        calls.push('wait')
        input.onOperation?.({ ...operation, status: 'completed' })
        return { status: 'completed', done: true, completed: [{ ...operation, status: 'completed' }], failed: [], cancelled: [], pending: [] }
      },
      cancel: async (operationId: string) => {
        calls.push(`cancel:${operationId}`)
        return { ...operation, status: 'cancelled' as const }
      },
    } as never,
    recordTrace: (_run, trace) => traces.push(trace as AgentTraceEvent),
  })
  const run = { id: 'run_1' } as AgentRun

  assert.deepEqual(await bridge.startIO(run, { kind: 'generation_job', request: { prompt: 'image' } }), { status: 'started', operation })
  assert.deepEqual(bridge.getIO(run, { operationId: 'io_1' }), { status: 'read', operation })
  assert.deepEqual(bridge.listIO(run), { status: 'listed', operations: [operation] })
  assert.equal((await bridge.waitIO(run, { operationIds: ['io_1'] }) as any).status, 'completed')
  assert.deepEqual(await bridge.cancelIO(run, { operationId: 'io_1' }), { status: 'cancelled', operation: { ...operation, status: 'cancelled' } })

  assert.equal(calls.some((call) => call.startsWith('start:')), true)
  assert.equal(calls.includes('get:io_1'), true)
  assert.equal(calls.includes('list'), true)
  assert.equal(calls.includes('wait'), true)
  assert.equal(calls.includes('cancel:io_1'), true)
  assert.equal(traces.some((trace) => trace.toolName === 'agent_io_start'), true)
  assert.equal(traces.some((trace) => trace.toolName === 'agent_io_wait'), true)
  assert.equal(traces.some((trace) => trace.toolName === 'agent_io_cancel'), true)
})

test('runtime operation bridge rejects unsupported start kinds with guidance', async () => {
  const bridge = createRuntimeIOOperationsBridge({
    ioManager: {
      start: async () => {
        throw new Error('should not start')
      },
    } as never,
  })
  const run = { id: 'run_1' } as AgentRun

  await assert.rejects(
    bridge.startIO(run, { kind: 'subagent_run', request: {} }),
    /use movscript_spawn_subagent/,
  )
  await assert.rejects(
    bridge.startIO(run, { kind: 'backend_http', request: {} }),
    /supports only kind "generation_job"/,
  )
})

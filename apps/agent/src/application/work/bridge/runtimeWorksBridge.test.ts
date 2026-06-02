import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeWorksBridge } from './runtimeWorksBridge.js'
import type { AgentRun, AgentTraceEvent } from '../../../state/shared/types.js'

test('runtime work bridge delegates operations and records traces', async () => {
  const calls: string[] = []
  const traces: AgentTraceEvent[] = []
  const work = {
    id: 'work_1',
    runId: 'run_1',
    kind: 'generation_job' as const,
    mode: 'async' as const,
    status: 'waiting' as const,
    request: { prompt: 'image' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const bridge = createRuntimeWorksBridge({
    workManager: {
      start: async (input: unknown) => {
        calls.push(`start:${JSON.stringify(input)}`)
        return work
      },
      get: (workId: string) => {
        calls.push(`get:${workId}`)
        return work
      },
      list: () => {
        calls.push('list')
        return [work]
      },
      wait: async (input: { onWork?: (item: any) => void }) => {
        calls.push('wait')
        input.onWork?.({ ...work, status: 'completed' })
        return { status: 'completed', done: true, completed: [{ ...work, status: 'completed' }], failed: [], cancelled: [], pending: [] }
      },
      cancel: async (workId: string) => {
        calls.push(`cancel:${workId}`)
        return { ...work, status: 'cancelled' as const }
      },
    } as never,
    recordTrace: (_run, trace) => traces.push(trace as AgentTraceEvent),
  })
  const run = { id: 'run_1' } as AgentRun

  assert.deepEqual(await bridge.startWork(run, {
    kind: 'generation_job',
    request: { prompt: 'image' },
    continuationPolicy: { mode: 'any_completed', groupId: 'batch_1' },
  }), { status: 'started', work })
  assert.deepEqual(bridge.getWork(run, { workId: 'work_1' }), { status: 'read', work })
  assert.deepEqual(bridge.listWork(run), { status: 'listed', works: [work] })
  assert.equal((await bridge.waitWork(run, { workIds: ['work_1'] }) as any).status, 'completed')
  assert.deepEqual(await bridge.cancelWork(run, { workId: 'work_1' }), { status: 'cancelled', work: { ...work, status: 'cancelled' } })

  const startCall = calls.find((call) => call.startsWith('start:'))
  assert.ok(startCall)
  assert.deepEqual(JSON.parse(startCall.slice('start:'.length)).continuationPolicy, {
    mode: 'any_completed',
    groupId: 'batch_1',
  })
  assert.equal(calls.includes('get:work_1'), true)
  assert.equal(calls.includes('list'), true)
  assert.equal(calls.includes('wait'), true)
  assert.equal(calls.includes('cancel:work_1'), true)
  assert.equal(traces.some((trace) => trace.toolName === 'core_work_start'), true)
  assert.equal(traces.some((trace) => trace.toolName === 'core_work_wait'), true)
  assert.equal(traces.some((trace) => trace.toolName === 'core_work_cancel'), true)
  const startTraceData = traces.find((trace) => trace.toolName === 'core_work_start')?.data as any
  const waitTraceData = traces.find((trace) => trace.title === 'Runtime work wait completed')?.data as any
  assert.equal(startTraceData.runtimeWork.request, undefined)
  assert.equal(startTraceData.runtimeWork.requestMode, 'summary')
  assert.equal(waitTraceData.runtimeWorkWait.completed[0].request, undefined)
  assert.equal(waitTraceData.runtimeWorkWait.completed[0].requestMode, 'summary')
})

test('runtime work bridge rejects unsupported start kinds with guidance', async () => {
  const bridge = createRuntimeWorksBridge({
    workManager: {
      start: async () => {
        throw new Error('should not start')
      },
    } as never,
  })
  const run = { id: 'run_1' } as AgentRun

  await assert.rejects(
    bridge.startWork(run, { kind: 'subagent', request: {} }),
    /does not support kind: subagent/,
  )
  await assert.rejects(
    bridge.startWork(run, { kind: 'unsupported_operation', request: {} }),
    /does not support kind: unsupported_operation/,
  )
})

test('runtime work bridge enqueues start wakeups without polling in the start call', async () => {
  const events: string[] = []
  const work = {
    id: 'work_monitor',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'generation_job' as const,
    mode: 'async' as const,
    status: 'waiting' as const,
    request: { prompt: 'image' },
    continuationPolicy: { mode: 'any_completed' as const },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const bridge = createRuntimeWorksBridge({
    workManager: {
      start: async () => work,
      wait: async (input: { onWork?: (item: any) => void }) => {
        events.push('wait')
        input.onWork?.({ ...work, status: 'completed' })
        return { status: 'completed', done: true, completed: [{ ...work, status: 'completed' }], failed: [], cancelled: [], pending: [] }
      },
    } as never,
    wake: {
      workStarted: () => {
        events.push('work.started')
      },
      workObserved: () => {
        events.push('work.observed')
      },
    },
  })

  await bridge.startWork({ id: 'run_1', threadId: 'thread_1' } as AgentRun, { kind: 'generation_job', request: { prompt: 'image' } })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.deepEqual(events, ['work.started'])
})

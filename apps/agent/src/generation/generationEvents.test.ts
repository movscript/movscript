import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGenerationEvent, extractGenerationMonitorRequest } from './generationEvents.js'
import type { JSONValue, ToolCall } from '../state/types.js'

test('generation events prefer structured MCP data over rendered content text', () => {
  const call: ToolCall = {
    name: 'generation_job_create',
    args: { projectId: 42 },
  }
  const result: JSONValue = {
    content: [
      {
        type: 'text',
        text: 'status: queued\njobId: 123',
      },
    ],
    data: {
      status: 'queued',
      jobId: 123,
      terminal: false,
      monitor: {
        tool: 'generation_job_get',
        args: { jobId: 123 },
        timeoutMs: 200,
        pollIntervalMs: 300,
      },
      message: '生成任务已创建（Job #123）。',
    },
  }

  const event = buildGenerationEvent(call, result)
  assert.ok(event)
  assert.equal(event.status, 'queued')
  assert.equal(event.jobId, 123)
  assert.equal(event.stage, 'created')
  assert.equal(event.terminal, false)

  const monitor = extractGenerationMonitorRequest(call, result, event)
  assert.ok(monitor)
  assert.equal(monitor.toolName, 'generation_job_get')
  assert.deepEqual(monitor.args, { jobId: 123, projectId: 42 })
  assert.equal(monitor.timeoutMs, 200)
  assert.equal(monitor.pollIntervalMs, 300)
})

test('generation events clone JSON media and monitor args snapshots', () => {
  const call: ToolCall = {
    name: 'generation_job_create',
    args: { projectId: 42 },
  }
  const result: JSONValue = {
    data: {
      status: 'queued',
      jobId: 123,
      terminal: false,
      media: {
        nested: { value: 'original' },
      },
      monitor: {
        args: {
          jobId: 123,
          nested: { value: 'original' },
        },
      },
    },
  }

  const event = buildGenerationEvent(call, result)
  assert.ok(event)
  const monitor = extractGenerationMonitorRequest(call, result, event)
  assert.ok(monitor)

  const data = (result as any).data
  data.media.nested.value = 'changed'
  data.monitor.args.nested.value = 'changed'

  assert.deepEqual(event.media, { nested: { value: 'original' } })
  assert.deepEqual(monitor.args.nested, { value: 'original' })
})

test('generation monitor requests normalize backend monitor data to get job polling', () => {
  const call: ToolCall = {
    name: 'generation_job_create',
    args: { projectId: 42 },
  }
  const result: JSONValue = {
    data: {
      status: 'queued',
      jobId: 123,
      terminal: false,
      monitor: {
        tool: 'generation_job_get',
        args: {
          jobId: 123,
          timeout_ms: 500,
          heartbeat_ms: 50,
        },
      },
    },
  }

  const event = buildGenerationEvent(call, result)
  assert.ok(event)
  const monitor = extractGenerationMonitorRequest(call, result, event)
  assert.ok(monitor)
  assert.equal(monitor.toolName, 'generation_job_get')
  assert.deepEqual(monitor.args, { jobId: 123, timeout_ms: 500, heartbeat_ms: 50, projectId: 42 })
  assert.equal(monitor.timeoutMs, 500)
  assert.equal(monitor.heartbeatMs, 50)
})

test('runtime work starts emit generation events without synchronous monitor requests', () => {
  const call: ToolCall = {
    name: 'core_work_start',
    args: { kind: 'generation_job', request: { projectId: 42, prompt: 'image' } },
  }
  const result: JSONValue = {
    status: 'started',
    work: {
      id: 'work_1',
      kind: 'generation_job',
      status: 'waiting',
      request: { projectId: 42, prompt: 'image' },
      result: {
        status: 'queued',
        jobId: 123,
        terminal: false,
        monitor: {
          tool: 'generation_job_get',
          args: { jobId: 123, projectId: 42 },
          timeoutMs: 200,
          pollIntervalMs: 300,
        },
      },
    },
  }

  const event = buildGenerationEvent(call, result)
  assert.ok(event)
  assert.equal(event.stage, 'created')
  assert.equal(event.jobId, 123)
  assert.equal(extractGenerationMonitorRequest(call, result, event), undefined)
})

test('generation monitor requests ignore invalid project ids', () => {
  const call: ToolCall = {
    name: 'generation_job_create',
    args: { projectId: 42.5 },
  }
  const result: JSONValue = {
    data: {
      status: 'queued',
      jobId: 123,
      terminal: false,
      monitor: {
        args: { jobId: 123 },
      },
    },
  }

  const event = buildGenerationEvent(call, result)
  assert.ok(event)
  const monitor = extractGenerationMonitorRequest(call, result, event)
  assert.ok(monitor)
  assert.deepEqual(monitor.args, { jobId: 123 })
})

test('generation events ignore invalid job and resource ids', () => {
  const call: ToolCall = {
    name: 'generation_job_create',
    args: { projectId: 42 },
  }
  const result: JSONValue = {
    data: {
      status: 'queued',
      jobId: 0,
      job_id: 42.5,
      output_resource_id: Number.NaN as unknown as number,
      outputResourceId: Number.POSITIVE_INFINITY as unknown as number,
      modelConfigId: -1,
      terminal: false,
      monitor: {
        args: { jobId: 0, job_id: 42.5 },
      },
    },
  }

  const event = buildGenerationEvent(call, result)
  assert.ok(event)
  assert.equal(event.jobId, undefined)
  assert.equal(event.outputResourceId, undefined)
  assert.equal(event.modelConfigId, undefined)
  assert.equal(extractGenerationMonitorRequest(call, result, event), undefined)
})

test('generation events reject non-finite media values', () => {
  const call: ToolCall = {
    name: 'generation_job_get',
    args: {},
  }
  const result = {
    data: {
      status: 'queued',
      media: { score: Number.NaN },
    },
  } as unknown as JSONValue

  const event = buildGenerationEvent(call, result)
  assert.ok(event)
  assert.equal(event.media, undefined)
})

test('generation events reject non-plain payload records', () => {
  const call: ToolCall = {
    name: 'generation_job_get',
    args: {},
  }

  assert.equal(buildGenerationEvent(call, new Date('2026-01-01T00:00:00.000Z') as unknown as JSONValue), undefined)
  assert.equal(buildGenerationEvent(call, { data: new Map([['status', 'queued']]) } as unknown as JSONValue), undefined)
})

test('generation events can recover from invalid data via JSON content text', () => {
  const call: ToolCall = {
    name: 'generation_job_get',
    args: {},
  }
  const event = buildGenerationEvent(call, {
    data: new Date('2026-01-01T00:00:00.000Z'),
    content: [
      {
        type: 'text',
        text: JSON.stringify({ status: 'succeeded', jobId: 123, terminal: true }),
      },
    ],
  } as unknown as JSONValue)

  assert.ok(event)
  assert.equal(event.status, 'succeeded')
  assert.equal(event.jobId, 123)
  assert.equal(event.stage, 'completed')
})

test('generation events treat backend terminal status aliases as final states', () => {
  const completed = buildGenerationEvent({
    name: 'generation_job_get',
    args: {},
  }, {
    data: {
      status: 'finished',
      jobId: 123,
      output_resource_id: 456,
    },
  })
  assert.ok(completed)
  assert.equal(completed.terminal, true)
  assert.equal(completed.stage, 'completed')
  assert.equal(completed.message, 'Job #123 生成完成，输出资源 #456。')

  const failed = buildGenerationEvent({
    name: 'generation_job_get',
    args: {},
  }, {
    data: {
      status: 'error',
      jobId: 124,
    },
  })
  assert.ok(failed)
  assert.equal(failed.terminal, true)
  assert.equal(failed.stage, 'failed')

  const cancelled = buildGenerationEvent({
    name: 'generation_job_get',
    args: {},
  }, {
    data: {
      status: 'canceled',
      jobId: 125,
    },
  })
  assert.ok(cancelled)
  assert.equal(cancelled.terminal, true)
  assert.equal(cancelled.stage, 'cancelled')
})

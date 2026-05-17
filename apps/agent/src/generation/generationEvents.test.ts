import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGenerationEvent, extractGenerationMonitorRequest } from './generationEvents.js'
import type { JSONValue, ToolCall } from '../state/types.js'

test('generation events prefer structured MCP data over rendered content text', () => {
  const call: ToolCall = {
    name: 'movscript_create_generation_job',
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
        tool: 'movscript_get_generation_job',
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
  assert.equal(monitor.toolName, 'movscript_get_generation_job')
  assert.deepEqual(monitor.args, { jobId: 123, projectId: 42 })
  assert.equal(monitor.timeoutMs, 200)
  assert.equal(monitor.pollIntervalMs, 300)
})

test('generation events clone JSON media and monitor args snapshots', () => {
  const call: ToolCall = {
    name: 'movscript_create_generation_job',
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

test('generation monitor requests ignore invalid project ids', () => {
  const call: ToolCall = {
    name: 'movscript_create_generation_job',
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
    name: 'movscript_create_generation_job',
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
    name: 'movscript_get_generation_job',
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
    name: 'movscript_get_generation_job',
    args: {},
  }

  assert.equal(buildGenerationEvent(call, new Date('2026-01-01T00:00:00.000Z') as unknown as JSONValue), undefined)
  assert.equal(buildGenerationEvent(call, { data: new Map([['status', 'queued']]) } as unknown as JSONValue), undefined)
})

test('generation events can recover from invalid data via JSON content text', () => {
  const call: ToolCall = {
    name: 'movscript_get_generation_job',
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

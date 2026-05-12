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

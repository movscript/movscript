import assert from 'node:assert/strict'
import test from 'node:test'
import { MCPError } from '../mcpClient.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import type { AgentRun, JSONValue } from '../state/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import {
  executeRuntimeLocalGenerationTool,
  normalizeRuntimeLocalGenerationToolError,
} from './runtimeLocalGenerationToolExecution.js'

test('executeRuntimeLocalGenerationTool delegates generation calls through the tool executor', async () => {
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const call = {
    name: 'movscript_create_generation_job' as const,
    args: { prompt: 'title card' as JSONValue },
  }

  const result = await executeRuntimeLocalGenerationTool({
    call,
    run: makeRun(),
    mcpClient: {
      initialize: async () => ({}),
      callTool: async (name, args) => {
        calls.push({ name, args })
        return { jobId: 42, status: 'queued' }
      },
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: new StaticToolRegistry([]),
  })

  assert.equal(result.call, call)
  assert.equal(result.source, 'mcp')
  assert.deepEqual(result.result, { jobId: 42, status: 'queued' })
  assert.deepEqual(calls, [{ name: 'movscript_create_generation_job', args: { prompt: 'title card' } }])
})

test('executeRuntimeLocalGenerationTool normalizes backend generation errors', async () => {
  const call = {
    name: 'movscript_create_generation_job' as const,
    args: { prompt: 'title card' as JSONValue },
  }

  const result = await executeRuntimeLocalGenerationTool({
    call,
    run: makeRun(),
    mcpClient: {
      initialize: async () => ({}),
      callTool: async () => {
        throw new MCPError('backend rejected', -32000, {
          type: 'backend_http_error',
          status: 400,
          code: 'bad_prompt',
        })
      },
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: new StaticToolRegistry([]),
  })

  assert.equal(result.call, call)
  assert.equal(result.error, 'backend rejected')
  assert.equal(result.source, 'mcp')
  assert.equal(result.errorData !== undefined, true)
})

test('normalizeRuntimeLocalGenerationToolError preserves backend generation error data', () => {
  const call = {
    name: 'movscript_create_generation_job' as const,
    args: { prompt: 'hello' as JSONValue },
  }
  const error = new MCPError('backend rejected', -32000, {
    type: 'backend_http_error',
    status: 400,
    code: 'bad_prompt',
  })

  const result = normalizeRuntimeLocalGenerationToolError(call, error)

  assert.equal(result.call, call)
  assert.equal(result.error, 'backend rejected')
  assert.equal(result.source, 'mcp')
  assert.equal(result.errorData !== undefined, true)
})

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
}

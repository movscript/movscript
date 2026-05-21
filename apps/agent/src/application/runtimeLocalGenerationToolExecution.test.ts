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
  const call = {
    name: 'agent_io_start' as const,
    args: { kind: 'generation_job' as JSONValue, request: { prompt: 'title card' as JSONValue } as JSONValue },
  }
  const resultValue = { status: 'started', operation: { id: 'io_1', kind: 'generation_job', status: 'running' } }

  const result = await executeRuntimeLocalGenerationTool({
    call,
    run: makeRun(),
    mcpClient: {
      initialize: async () => ({}),
      callTool: async () => ({ ok: true }),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    registry: new StaticToolRegistry([]),
    catalogManager: {
      startIO: async () => resultValue as JSONValue,
    } as any,
  })

  assert.equal(result.call, call)
  assert.equal(result.source, 'runtime')
  assert.deepEqual(result.result, resultValue)
})

test('executeRuntimeLocalGenerationTool normalizes backend generation errors', async () => {
  const call = {
    name: 'agent_io_start' as const,
    args: { kind: 'generation_job' as JSONValue, request: { prompt: 'title card' as JSONValue } as JSONValue },
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
    catalogManager: {
      startIO: async () => {
        throw new MCPError('backend rejected', -32000, {
          type: 'backend_http_error',
          status: 400,
          code: 'bad_prompt',
        })
      },
    } as any,
  })

  assert.equal(result.call, call)
  assert.equal(result.error, 'backend rejected')
  assert.equal(result.source, 'mcp')
  assert.equal(result.errorData !== undefined, true)
})

test('normalizeRuntimeLocalGenerationToolError preserves backend generation error data', () => {
  const call = {
    name: 'agent_io_start' as const,
    args: { kind: 'generation_job' as JSONValue, request: { prompt: 'hello' as JSONValue } as JSONValue },
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

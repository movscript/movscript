import assert from 'node:assert/strict'
import test from 'node:test'

import { MCPError } from '../mcpClient.js'
import type { JSONValue } from '../state/types.js'
import { executeTool } from './toolExecutor.js'

function testRun() {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    status: 'running',
    policy: { approvals: [] },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    steps: [],
  } as never
}

function testOptions(mcpClient: { initialize(): Promise<JSONValue>; callTool(name: string, args?: Record<string, JSONValue>): Promise<JSONValue> }) {
  return {
    run: testRun(),
    mcpClient,
    draftStore: {} as never,
    backendApplyClient: {} as never,
    registry: { get: () => undefined, list: () => [] },
    sandboxMode: false,
  }
}

test('executeTool retries generation once with backend suggested_fix', async () => {
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
      calls.push({ name, args })
      if (calls.length === 1) {
        throw new MCPError('invalid duration', -32000, {
          type: 'backend_http_error',
          status: 400,
          code: 'INVALID_PARAMETER_OPTION',
          field: 'duration',
          suggested_fix: { duration: '5', resolution: '480p' },
        })
      }
      return { status: 'queued', repaired: true }
    },
  }

  const result = await executeTool({
    name: 'movscript_create_generation_job',
    args: {
      prompt: 'make a shot',
      job_type: 'video',
      duration: '6',
      extra_params: { resolution: '720p' },
    },
  }, testOptions(mcpClient))

  assert.deepEqual(result.result, {
    status: 'queued',
    repaired: true,
    repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1]?.args, {
    prompt: 'make a shot',
    job_type: 'video',
    duration: '5',
    extra_params: { resolution: '480p' },
    repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  })
})

test('executeTool returns repaired generation param audit for UI extraction', async () => {
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const paramValidation = {
    model_config_id: 42,
    model_contract_loaded: true,
    params_schema_loaded: true,
    params_schema_rule_count: 4,
    supported_params: ['duration', 'resolution', 'return_last_frame'],
    provided_extra_params: ['resolution', 'return_last_frame'],
    submitted_extra_params: ['resolution', 'return_last_frame'],
  }
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
      calls.push({ name, args })
      if (calls.length === 1) {
        throw new MCPError('invalid draft generation params', -32000, {
          type: 'backend_http_error',
          status: 400,
          code: 'INVALID_PARAMETER_COMBINATION',
          field: 'resolution',
          allowed_values: ['480p'],
          suggested_fix: { resolution: '480p', return_last_frame: false },
        })
      }
      return {
        data: {
          status: 'queued',
          jobId: 101,
          repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
          param_validation: paramValidation,
        },
      }
    },
  }

  const result = await executeTool({
    name: 'movscript_create_generation_job',
    args: {
      prompt: 'make a draft video',
      job_type: 'video',
      extra_params: { draft: true, resolution: '720p', return_last_frame: true },
    },
  }, testOptions(mcpClient))

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1]?.args?.extra_params, {
    draft: true,
    resolution: '480p',
    return_last_frame: false,
  })
  assert.deepEqual(result.result, {
    data: {
      status: 'queued',
          jobId: 101,
          repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
          param_validation: paramValidation,
    },
  })
})

test('executeTool does not repair non-generation MCP validation errors', async () => {
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(): Promise<JSONValue> {
      throw new MCPError('invalid', -32000, {
        type: 'backend_http_error',
        status: 400,
        suggested_fix: { duration: '5' },
      })
    },
  }

  await assert.rejects(
    executeTool({ name: 'movscript_list_models', args: { capability: 'video' } }, testOptions(mcpClient)),
    MCPError,
  )
})

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
    audit_version: 1,
    model_config_id: 42,
    model_contract_loaded: true,
    params_schema_loaded: true,
    params_schema_rule_count: 4,
    supported_params: ['duration', 'resolution', 'return_last_frame'],
    provided_extra_params: ['resolution', 'return_last_frame'],
    submitted_extra_params: ['resolution', 'return_last_frame'],
    preflight_errors: [{
      code: 'INVALID_PARAMETER_COMBINATION',
      field: 'resolution',
      message: 'parameter "resolution" is not allowed for "draft" in the local model contract',
      allowed_values: ['480p'],
    }],
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

test('executeTool removes generation params when backend suggested_fix value is null', async () => {
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
      calls.push({ name, args })
      if (calls.length === 1) {
        throw new MCPError('conflicting generation params', -32000, {
          type: 'backend_http_error',
          status: 400,
          code: 'INVALID_PARAMETER_COMBINATION',
          field: 'duration',
          suggested_fix: { frames: null },
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
      duration: '5',
      extra_params: { frames: 29, resolution: '720p' },
    },
  }, testOptions(mcpClient))

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1]?.args, {
    prompt: 'make a shot',
    job_type: 'video',
    duration: '5',
    extra_params: { resolution: '720p' },
    repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  })
  assert.deepEqual(result.result, {
    status: 'queued',
    repaired: true,
    repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  })
})

test('executeTool removes empty extra_params after null suggested_fix deletes the last param', async () => {
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
      calls.push({ name, args })
      if (calls.length === 1) {
        throw new MCPError('conflicting generation params', -32000, {
          type: 'backend_http_error',
          status: 400,
          code: 'INVALID_PARAMETER_COMBINATION',
          field: 'duration',
          suggested_fix: { frames: null },
        })
      }
      return { status: 'queued', repaired: true }
    },
  }

  await executeTool({
    name: 'movscript_create_generation_job',
    args: {
      prompt: 'make a shot',
      job_type: 'video',
      duration: '5',
      extra_params: { frames: 29 },
    },
  }, testOptions(mcpClient))

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1]?.args, {
    prompt: 'make a shot',
    job_type: 'video',
    duration: '5',
    repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  })
})

test('executeTool removes top-level generation params when backend suggested_fix value is null', async () => {
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
      calls.push({ name, args })
      if (calls.length === 1) {
        throw new MCPError('conflicting generation params', -32000, {
          type: 'backend_http_error',
          status: 400,
          code: 'INVALID_PARAMETER_COMBINATION',
          field: 'duration',
          suggested_fix: { duration: null },
        })
      }
      return { status: 'queued', repaired: true }
    },
  }

  await executeTool({
    name: 'movscript_create_generation_job',
    args: {
      prompt: 'make a shot',
      job_type: 'video',
      duration: '5',
      aspect_ratio: '16:9',
      extra_params: { resolution: '720p' },
    },
  }, testOptions(mcpClient))

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1]?.args, {
    prompt: 'make a shot',
    job_type: 'video',
    aspect_ratio: '16:9',
    extra_params: { resolution: '720p' },
    repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  })
})

test('executeTool does not repair generation input resource validation errors', async () => {
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
      calls.push({ name, args })
      throw new MCPError('too many image inputs', -32000, {
        type: 'backend_http_error',
        status: 400,
        code: 'INVALID_INPUT_COUNT',
        field: 'image',
        required_min: 1,
        allowed_max: 4,
        actual_count: 5,
        suggested_fix: { input_resource_ids: [1, 2, 3, 4] },
      })
    },
  }

  await assert.rejects(
    executeTool({
      name: 'movscript_create_generation_job',
      args: {
        prompt: 'make a shot',
        job_type: 'image_edit',
        input_resource_ids: [1, 2, 3, 4, 5],
      },
    }, testOptions(mcpClient)),
    MCPError,
  )
  assert.equal(calls.length, 1)
})

test('executeTool does not repair generation output type validation errors', async () => {
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
      calls.push({ name, args })
      throw new MCPError('unsupported output type', -32000, {
        type: 'backend_http_error',
        status: 400,
        code: 'UNSUPPORTED_OUTPUT_TYPE',
        field: 'output_type',
        allowed_values: ['image'],
        suggested_fix: { job_type: 'image' },
      })
    },
  }

  await assert.rejects(
    executeTool({
      name: 'movscript_create_generation_job',
      args: {
        prompt: 'make a shot',
        job_type: 'video',
        model_config_id: 42,
      },
    }, testOptions(mcpClient)),
    MCPError,
  )
  assert.equal(calls.length, 1)
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

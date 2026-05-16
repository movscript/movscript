import assert from 'node:assert/strict'
import test from 'node:test'

import { MCPError } from '../mcpClient.js'
import type { AgentRun, JSONValue } from '../state/types.js'
import { KnowledgeManager, loadBuiltinKnowledgeStore } from '../knowledge/index.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import { executeTool } from './toolExecutor.js'

function testRun(): AgentRun {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    status: 'in_progress',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    steps: [],
  }
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

test('executeTool serves runtime knowledge search and bounded get', async () => {
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime knowledge tools')
      },
    }),
    knowledgeManager: new KnowledgeManager(loadBuiltinKnowledgeStore()),
  }

  const search = await executeTool({
    name: 'movscript_search_knowledge',
    args: { query: '关键帧 分镜', domain: 'storyboard', limit: 2 },
  }, options)
  const results = (search.result as any)?.results as any[]
  assert.equal(Array.isArray(results), true)
  assert.equal(results.length > 0, true)
  assert.equal(results.some((result) => result.content !== undefined), false)
  assert.equal(typeof results[0]!.title, 'string')
  assert.equal(results[0]!.domain, 'storyboard')
  assert.match(results[0]!.contentHash, /^sha256:/)
  assert.equal(typeof results[0]!.sourcePath, 'string')

  const body = await executeTool({
    name: 'movscript_get_knowledge',
    args: { id: results[0]!.id, maxChars: 32 },
  }, options)
  assert.equal((body.result as any)?.id, results[0]!.id)
  assert.equal((body.result as any)?.domain, 'storyboard')
  assert.match((body.result as any)?.contentHash, /^sha256:/)
  assert.equal(typeof (body.result as any)?.sourcePath, 'string')
  assert.equal(((body.result as any)?.content as string).length <= 32, true)
})

test('executeTool creates content unit proposal drafts after media proposal deprecation', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'movscript_create_draft',
    args: {
      kind: 'content_unit_proposal',
      proposal: true,
      projectId: 1,
      content: JSON.stringify({
        schema: 'movscript.content_unit_proposal.v1',
        scope: 'content_unit_proposal',
        proposal: {
          units: [{
            title: 'Opening shot',
            kind: 'shot',
            description: 'Character enters the room.',
          }],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime draft creation')
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  assert.equal(draftStore.listDrafts()[0]?.kind, 'content_unit_proposal')
})

test('executeTool enforces per-run knowledge character budget', async () => {
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime knowledge tools')
      },
    }),
    run: {
      ...testRun(),
      metadata: {
        limits: { maxKnowledgeCharsPerRun: 50, maxKnowledgeChunksPerRun: 3 },
        contextLedger: {
          schema: 'movscript.context-ledger.v1',
          retrieved: [{
            ref: { type: 'knowledge', id: 'storyboard.rhythm.basic' },
            source: 'knowledge',
            evidence: 'advisory',
            title: '分镜节奏基础',
            summary: 'movscript_get_knowledge result reference (runtime)',
            charCount: 30,
            retrievedAt: new Date(0).toISOString(),
            usedInPrompt: true,
          }],
        },
      },
    },
    knowledgeManager: new KnowledgeManager(loadBuiltinKnowledgeStore()),
  }

  const body = await executeTool({
    name: 'movscript_get_knowledge',
    args: { id: 'storyboard.hook.short_drama', maxChars: 100 },
  }, options)

  assert.equal(((body.result as any)?.content as string).length <= 20, true)
  assert.equal((body.result as any)?.truncated, true)
})

test('executeTool enforces per-run knowledge chunk budget', async () => {
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime knowledge tools')
      },
    }),
    run: {
      ...testRun(),
      metadata: {
        limits: { maxKnowledgeCharsPerRun: 8000, maxKnowledgeChunksPerRun: 1 },
        contextLedger: {
          schema: 'movscript.context-ledger.v1',
          retrieved: [{
            ref: { type: 'knowledge', id: 'storyboard.rhythm.basic' },
            source: 'knowledge',
            evidence: 'advisory',
            title: '分镜节奏基础',
            summary: 'movscript_get_knowledge result reference (runtime)',
            charCount: 120,
            retrievedAt: new Date(0).toISOString(),
            usedInPrompt: true,
          }],
        },
      },
    },
    knowledgeManager: new KnowledgeManager(loadBuiltinKnowledgeStore()),
  }

  await assert.rejects(
    () => executeTool({
      name: 'movscript_get_knowledge',
      args: { id: 'storyboard.hook.short_drama', maxChars: 100 },
    }, options),
    /knowledge chunk budget exceeded/,
  )
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

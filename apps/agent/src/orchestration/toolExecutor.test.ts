import assert from 'node:assert/strict'
import test from 'node:test'

import { MCPError } from '../mcpClient.js'
import type { AgentRun, JSONValue } from '../state/types.js'
import { KnowledgeManager, loadBuiltinKnowledgeStore } from '../knowledge/index.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import { executeTool } from './toolExecutor.js'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'

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

test('executeTool explains numeric draft ids are not backend script ids', async () => {
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for local draft tools')
      },
    }),
    draftStore: new InMemoryAgentDraftStore(),
  }

  await assert.rejects(
    () => executeTool({ name: 'movscript_get_draft', args: { draftId: 3 } }, options),
    /not backend project script IDs.*movscript_read_project_scripts/s,
  )
})

test('executeTool reads project standards from backend project data with context fallback', async () => {
  const run = testRun()
  run.metadata = {
    context: {
      project: {
        id: 42,
        name: 'Context Project',
        aspect_ratio: '16:9',
        visual_style: 'context style',
        project_style: JSON.stringify({
          camera_language: 'stable camera',
          custom_rules: [
            { key: 'qa', label: 'QA', value: 'Check every output.', prompt_role: 'quality_gate', enabled: true },
            { key: 'style_reference_images', label: 'Style reference images', value: 'Use resource#100 and resource#101 as visual style references only.', prompt_role: 'style', enabled: true },
          ],
        }),
      },
    },
  }
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for project standards')
      },
    }),
    run,
    backendApplyClient: {
      async getProject(): Promise<any> {
        return { performed: false, skippedReason: 'backend disabled in test' }
      },
    } as never,
  }

  const result = await executeTool({
    name: 'movscript_get_project_standards',
    args: { projectId: 42 },
  }, options)

  assert.equal((result.result as any)?.loaded, true)
  assert.equal((result.result as any)?.source, 'run_context')
  assert.equal((result.result as any)?.standards.core.aspect_ratio, '16:9')
  assert.equal((result.result as any)?.standards.core.camera_language, 'stable camera')
  assert.equal((result.result as any)?.standards.enabled_custom_rules[0].prompt_role, 'quality_gate')
  assert.deepEqual((result.result as any)?.standards.style_reference_resource_ids, ['100', '101'])
  assert.match(((result.result as any)?.warnings as string[]).join('\n'), /backend disabled/)
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

test('executeTool applies valid proposal drafts through runtime apply tool', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    projectId: 42,
    kind: 'asset_proposal',
    title: 'Asset candidates',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
      scope: 'asset_proposal',
      proposal: {
        creative_references: [],
        asset_slots: [],
        candidate_plans: [],
      },
    }),
    target: {
      projectId: 42,
      entityType: 'project',
      entityId: 42,
      field: 'proposal',
    },
  })

  const result = await executeTool({
    name: 'movscript_apply_draft',
    args: { draftId: draft.id },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime draft apply')
      },
    }),
    draftStore,
    backendApplyClient: {
      async applyReview(): Promise<any> {
        throw new Error('backend apply should be skipped for asset planning drafts without asset slots')
      },
    } as never,
  })

  assert.equal((result.result as any)?.ok, true)
  assert.equal((result.result as any)?.status, 'applied')
  const applied = draftStore.getDraft(draft.id)
  assert.equal(applied?.status, 'applied')
  assert.equal((applied?.metadata as any)?.appliedBy, 'movscript-agent')
})

test('executeTool ignores non-plain runtime draft source and metadata records', async () => {
  class RuntimeRecord {
    injected = 'runtime'
  }

  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'movscript_create_draft',
    args: {
      kind: 'note',
      title: 'Runtime draft',
      content: 'Draft content',
      source: new RuntimeRecord() as unknown as JSONValue,
      metadata: new RuntimeRecord() as unknown as JSONValue,
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

  const draft = draftStore.listDrafts()[0]
  assert.equal((result.result as any)?.id, draft?.id)
  assert.deepEqual(draft?.source, {
    runId: 'run-1',
    threadId: 'thread-1',
  })
  assert.equal(draft?.metadata, undefined)
})

test('executeTool drops invalid numeric page entity ids from runtime draft source', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const run = testRun()
  run.metadata = {
    clientInput: {
      uiSnapshot: {
        pageContext: {
          pageKey: 'production',
          pageEntityType: 'production',
          pageEntityId: 7.5,
        },
        selection: {
          entityType: 'production',
          entityId: Number.NaN,
        },
      },
    },
  }

  await executeTool({
    name: 'movscript_create_draft',
    args: {
      kind: 'note',
      title: 'Runtime draft',
      content: 'Draft content',
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
    run,
    draftStore,
  })

  assert.deepEqual(draftStore.listDrafts()[0]?.source, {
    runId: 'run-1',
    threadId: 'thread-1',
  })
})

test('executeTool rejects invalid project ids for project standards proposals', async () => {
  for (const projectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY, '42']) {
    await assert.rejects(
      () => executeTool({
        name: 'movscript_create_draft',
        args: {
          kind: 'project_standards_proposal',
          proposal: true,
          projectId,
          content: JSON.stringify({
            schema: DRAFT_CONTENT_SCHEMA_IDS.projectStandardsProposal,
            scope: 'project_standards_proposal',
            proposal: {},
          }),
        },
      }, {
        ...testOptions({
          async initialize(): Promise<JSONValue> {
            return {}
          },
          async callTool(): Promise<JSONValue> {
            throw new Error('MCP should not be called for runtime proposal creation')
          },
        }),
        draftStore: new InMemoryAgentDraftStore(),
      }),
      /create_proposal requires projectId for project_standards_proposal/,
    )
  }
})

test('executeTool ignores invalid production ids for inferred proposal targets', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'movscript_create_draft',
    args: {
      kind: 'production_proposal',
      proposal: true,
      projectId: 42,
      productionId: '7',
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.productionProposal,
        mode: 'snapshot',
        productionId: 7,
        proposalScope: 'production',
        proposal: {
          segments: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime proposal creation')
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  assert.deepEqual(draftStore.listDrafts()[0]?.target, {
    projectId: 42,
    entityType: 'production',
    field: 'proposal',
  })
})

test('executeTool drops invalid numeric entity ids from explicit proposal targets', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'movscript_create_draft',
    args: {
      kind: 'production_proposal',
      proposal: true,
      projectId: 42,
      target: {
        entityType: 'production',
        entityId: 7.5,
        field: 'proposal',
      },
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.productionProposal,
        mode: 'snapshot',
        productionId: 7,
        proposalScope: 'production',
        proposal: {
          segments: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime proposal creation')
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  assert.deepEqual(draftStore.listDrafts()[0]?.target, {
    entityType: 'production',
    field: 'proposal',
  })
})

test('executeTool rejects invalid project ids for memory tools', async () => {
  const memoryManager = new MemoryManager(new InMemoryAgentMemoryStore())
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime memory tools')
      },
    }),
    memoryManager,
  }
  const invalidProjectIds = [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY, '42']

  for (const projectId of invalidProjectIds) {
    await assert.rejects(
      () => executeTool({
        name: 'movscript_search_memories',
        args: { projectId, query: 'preference' } as Record<string, JSONValue>,
      }, options),
      /search_memories requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'movscript_get_memory',
        args: { projectId, id: 'mem_1' } as Record<string, JSONValue>,
      }, options),
      /get_memory requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'movscript_create_memory',
        args: { projectId, title: 'Preference', kind: 'preference', content: 'Remember this.' } as Record<string, JSONValue>,
      }, options),
      /create_memory requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'movscript_delete_memory',
        args: { projectId, id: 'mem_1' } as Record<string, JSONValue>,
      }, options),
      /delete_memory requires projectId/,
    )
  }
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

test('executeTool ignores non-plain backend suggested_fix records', async () => {
  class RuntimeSuggestedFix {
    duration = '5'
  }

  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
      calls.push({ name, args })
      throw new MCPError('invalid duration', -32000, {
        type: 'backend_http_error',
        status: 400,
        code: 'INVALID_PARAMETER_OPTION',
        field: 'duration',
        suggested_fix: new RuntimeSuggestedFix() as unknown as JSONValue,
      })
    },
  }

  await assert.rejects(
    executeTool({
      name: 'movscript_create_generation_job',
      args: {
        prompt: 'make a shot',
        job_type: 'video',
        duration: '6',
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

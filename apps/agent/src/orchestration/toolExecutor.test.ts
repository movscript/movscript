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
import { draftContentFileRef } from '../files/providers/draftFileProvider.js'

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

test('executeTool serves runtime operation wait through the runtime catalog manager', async () => {
  const calls: string[] = []
  const result = await executeTool({
    name: 'agent_io_wait',
    args: { operationIds: ['io_42'] },
  }, {
    ...testOptions({
      initialize: async () => {
        calls.push('mcp.initialize')
        return {}
      },
      callTool: async () => {
        calls.push('mcp.callTool')
        return {}
      },
    }),
    catalogManager: {
      inspectAgentCatalog: () => ({}),
      updateActiveSkills: () => ({}),
      createAgentPlan: () => ({}),
      getAgentPlan: () => ({}),
      replanAgentPlan: () => ({}),
      spawnSubagent: () => ({}),
      listSubagents: () => ({}),
      waitSubagent: () => ({}),
      startIO: () => ({}),
      getIO: () => ({}),
      listIO: () => ({}),
      waitIO: (_run: AgentRun, input?: Record<string, JSONValue>) => {
        calls.push(`runtime.wait:${(input?.operationIds as JSONValue[] | undefined)?.join(',')}`)
        return { status: 'completed', done: true }
      },
      cancelIO: () => ({}),
      cancelSubagent: () => ({}),
    },
  })

  assert.equal(result.source, 'runtime')
  assert.deepEqual(result.result, { status: 'completed', done: true })
  assert.deepEqual(calls, ['runtime.wait:io_42'])
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

test('executeTool edits draft files with explicit file revision preconditions', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    projectId: 42,
    kind: 'asset_proposal',
    title: 'Asset requirements',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
      scope: 'asset_proposal',
      mode: 'snapshot',
      proposal: {
        creative_references: [],
        asset_slots: [{
          id: 9,
          owner: { type: 'creative_reference', id: 7 },
          name: 'Existing portrait',
          kind: 'image',
          status: 'needed',
        }],
        candidate_plans: [],
      },
    }),
  })
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime draft file tools')
      },
    }),
    draftStore,
  }

  await assert.rejects(
    () => executeTool({
      name: 'agent_file_edit',
      args: {
        ref: draftContentFileRef(draft.id),
        baseRevision: 'sha256:stale',
        edits: [{
          type: 'replace_text',
          oldText: '"asset_slots":[]',
          newText: '"asset_slots":[{"name":"New slot","kind":"image"}]',
        }],
      },
    }, options),
    /baseRevision mismatch/,
  )

  const read = await executeTool({
    name: 'agent_file_read',
    args: { ref: draftContentFileRef(draft.id), jsonPointer: '/proposal/asset_slots' },
  }, options)

  assert.equal((read.result as any)?.status, 'read')
  assert.equal((read.result as any)?.value.length, 1)

  const original = draftStore.getDraft(draft.id)?.content ?? ''
  const next = original.replace('"candidate_plans":[]', '"candidate_plans":[{"name":"Plan A"}]')
  const edited = await executeTool({
    name: 'agent_file_edit',
    args: {
      ref: draftContentFileRef(draft.id),
      baseRevision: (read.result as any).revision,
      edits: [{
        type: 'replace_text',
        oldText: original,
        newText: next,
      }],
    },
  }, options)

  assert.equal((edited.result as any)?.status, 'edited')
  const content = JSON.parse(draftStore.getDraft(draft.id)?.content ?? '{}')
  assert.deepEqual(content.proposal.asset_slots.map((slot: any) => slot.name), ['Existing portrait'])
  assert.deepEqual(content.proposal.candidate_plans.map((plan: any) => plan.name), ['Plan A'])
})

test('executeTool delegates agent file tools to the injected file system without requiring a draft', async () => {
  const files = new Map([['/workspace/notes.md', 'alpha beta gamma']])
  const fileSystem = {
    read(input: { ref: string }) {
      const filePath = input.ref
      const content = files.get(filePath)
      if (content === undefined) throw new Error(`missing file: ${filePath}`)
      return {
        file: { provider: 'workspace', kind: 'markdown', id: 'notes', ref: filePath },
        content,
        contentLength: content.length,
        revision: 'sha256:one',
      }
    },
    search() {
      throw new Error('search not used')
    },
    edit(input: { ref: string; edits: Array<{ type: string; oldText?: string; newText?: string }> }) {
      const filePath = input.ref
      const content = files.get(filePath)
      if (content === undefined) throw new Error(`missing file: ${filePath}`)
      const edit = input.edits[0]!
      const replacementCount = content.includes(edit.oldText ?? '') ? 1 : 0
      const next = content.replace(edit.oldText ?? '', edit.newText ?? '')
      files.set(filePath, next)
      return {
        file: { provider: 'workspace', kind: 'markdown', id: 'notes', ref: filePath },
        contentLength: next.length,
        changeSet: {
          id: 'changeset_1',
          fileRef: filePath,
          baseRevision: 'sha256:one',
          nextRevision: 'sha256:two',
          edits: input.edits,
          replacementCount,
          createdAt: '2026-05-21T00:00:00.000Z',
        },
      }
    },
  }
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime file tools')
      },
    }),
    fileSystem: fileSystem as any,
  }

  const read = await executeTool({
    name: 'agent_file_read',
    args: { ref: '/workspace/notes.md' },
  }, options)
  assert.equal((read.result as any)?.draft, undefined)
  assert.equal((read.result as any)?.file.provider, 'workspace')
  assert.equal((read.result as any)?.content, 'alpha beta gamma')

  const edited = await executeTool({
    name: 'agent_file_edit',
    args: {
      ref: '/workspace/notes.md',
      edits: [{
        type: 'replace_text',
        oldText: 'beta',
        newText: 'delta',
      }],
    },
  }, options)
  assert.equal((edited.result as any)?.draft, undefined)
  assert.equal((edited.result as any)?.replacementCount, 1)
  assert.equal(files.get('/workspace/notes.md'), 'alpha delta gamma')
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

test('executeTool propagates MCP validation errors without repair', async () => {
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

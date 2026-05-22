import assert from 'node:assert/strict'
import test from 'node:test'

import { MCPError } from '../mcpClient.js'
import type { AgentRun, JSONValue } from '../state/types.js'
import { KnowledgeManager, loadBuiltinKnowledgeStore } from '../knowledge/index.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import { InMemoryAgentDraftStore, validateDraft } from '../drafts/draftStore.js'
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
    name: 'core_operation_wait',
    args: { operationIds: ['op_42'] },
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
      updateProgressChecklist: () => ({}),
      spawnSubagent: () => ({}),
      listSubagents: () => ({}),
      waitSubagent: () => ({}),
      startOperation: () => ({}),
      getOperation: () => ({}),
      listOperation: () => ({}),
      waitOperation: (_run: AgentRun, input?: Record<string, JSONValue>) => {
        calls.push(`runtime.wait:${(input?.operationIds as JSONValue[] | undefined)?.join(',')}`)
        return { status: 'completed', done: true }
      },
      cancelOperation: () => ({}),
      cancelSubagent: () => ({}),
    },
  })

  assert.equal(result.source, 'runtime')
  assert.deepEqual(result.result, { status: 'completed', done: true })
  assert.deepEqual(calls, ['runtime.wait:op_42'])
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
    name: 'knowledge_search',
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
    name: 'knowledge_get',
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
    () => executeTool({ name: 'draft_get', args: { draftId: 3 } }, options),
    /not backend project script IDs.*movscript_project_script_read/s,
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
    name: 'movscript_project_standards_get',
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
    name: 'draft_create',
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

test('executeTool rejects proposal-kind draft creation without content instead of creating an empty draft', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  await assert.rejects(
    executeTool({
      name: 'draft_create',
      args: {
        kind: 'asset_proposal',
        projectId: 42,
        seedMode: 'editable_snapshot',
        hydrate: true,
      },
    }, {
      ...testOptions({
        async initialize(): Promise<JSONValue> {
          return {}
        },
        async callTool(): Promise<JSONValue> {
          throw new Error('MCP should not be called when proposal content is missing')
        },
      }),
      draftStore,
    }),
    /create_proposal requires content/,
  )

  assert.equal(draftStore.listDrafts().length, 0)
})

test('executeTool hydrates missing asset proposal rows into proposal during draft creation', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []
  const result = await executeTool({
    name: 'draft_create',
    args: {
      kind: 'asset_proposal',
      proposal: true,
      projectId: 42,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
        scope: 'asset_proposal',
        mode: 'snapshot',
        proposal: {
          creative_references: [],
          asset_slots: [],
          candidate_plans: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        calls.push({ name: 'initialize' })
        return {}
      },
      async callTool(name: string, args?: Record<string, JSONValue>): Promise<JSONValue> {
        calls.push({ name, args })
        return {
          seed: {
            data: {
              asset_slots: [{
                id: 9,
                owner: { type: 'creative_reference', id: 7 },
                name: 'Existing portrait',
                kind: 'image',
                status: 'needed',
              }],
            },
          },
        }
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  assert.equal(calls.some((call) => call.name === 'draft_model_get'), true)
  const mcpCall = calls.find((call) => call.name === 'draft_model_get')
  assert.deepEqual(mcpCall?.args, {
    kind: 'asset_proposal',
    target: {
      projectId: 42,
    },
    seedMode: 'editable_snapshot',
    hydrate: true,
  })
  const draft = draftStore.listDrafts()[0]!
  const content = JSON.parse(draft.content)
  assert.equal(content.snapshot_base, undefined)
  assert.deepEqual(content.proposal.asset_slots.map((slot: any) => slot.id), [9])
  assert.equal((draft.metadata as any)?.proposalBaseHydrated, true)
  assert.equal((draft.metadata as any)?.proposalSnapshotSeeded, true)
  assert.deepEqual((draft.metadata as any)?.seed.data.asset_slots.map((slot: any) => slot.id), [9])
})

test('executeTool seeds omitted asset proposal snapshot from current project data', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'draft_create',
    args: {
      kind: 'asset_proposal',
      proposal: true,
      projectId: 42,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
        scope: 'asset_proposal',
        mode: 'snapshot',
        proposal: {
          creative_references: [],
          candidate_plans: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        return {
          seed: {
            data: {
              asset_slots: [{
                client_id: 'slot-existing-9',
                ID: 9,
                project_id: 42,
                owner_type: 'creative_reference',
                owner_id: 7,
                creative_reference_id: 7,
                name: 'Existing portrait',
                kind: 'image',
                resource_id: 12,
                resource: { ID: 12, name: 'raw.png' },
                locked_asset_slot_id: 13,
                locked_asset_slot: { ID: 13, name: 'Candidate', kind: 'image' },
                status: 'needed',
                CreatedAt: '2026-05-21T00:00:00Z',
                UpdatedAt: '2026-05-21T00:00:00Z',
              }],
            },
          },
        }
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  const draft = draftStore.listDrafts()[0]!
  const content = JSON.parse(draft.content)
  assert.equal(content.snapshot_base, undefined)
  assert.deepEqual(content.proposal.asset_slots.map((slot: any) => slot.id), [9])
  assert.deepEqual(content.proposal.asset_slots[0], {
    client_id: 'slot-existing-9',
    id: 9,
    creative_reference_id: 7,
    owner_type: 'creative_reference',
    owner_id: 7,
    kind: 'image',
    name: 'Existing portrait',
    status: 'needed',
    resource_id: 12,
    locked_asset_slot_id: 13,
  })
  assert.equal(validateDraft(draft).ok, true)
  assert.equal((draft.metadata as any)?.proposalBaseHydrated, true)
  assert.equal((draft.metadata as any)?.proposalSnapshotSeeded, true)
})

test('executeTool merges new-only asset proposal snapshots onto hydrated project data', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'draft_create',
    args: {
      kind: 'asset_proposal',
      proposal: true,
      projectId: 42,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
        scope: 'asset_proposal',
        mode: 'snapshot',
        proposal: {
          creative_references: [],
          asset_slots: [{
            client_id: 'new-slot',
            owner: { type: 'creative_reference', id: 7 },
            name: 'New cane detail',
            kind: 'image',
          }],
          candidate_plans: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        return {
          seed: {
            data: {
              asset_slots: [{
                id: 9,
                owner: { type: 'creative_reference', id: 7 },
                name: 'Existing portrait',
                kind: 'image',
                status: 'needed',
              }],
            },
          },
        }
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  const draft = draftStore.listDrafts()[0]!
  const content = JSON.parse(draft.content)
  assert.equal(content.snapshot_base, undefined)
  assert.deepEqual(content.proposal.asset_slots.map((slot: any) => slot.name), ['Existing portrait', 'New cane detail'])
  assert.equal((draft.metadata as any)?.proposalBaseHydrated, true)
  assert.equal(validateDraft(draft).ok, true)
})

test('executeTool falls back to asset slot query when draft model seed omits asset slots', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const calls: string[] = []
  const result = await executeTool({
    name: 'draft_create',
    args: {
      kind: 'asset_proposal',
      proposal: true,
      projectId: 42,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
        scope: 'asset_proposal',
        mode: 'snapshot',
        proposal: {
          creative_references: [],
          candidate_plans: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(name: string): Promise<JSONValue> {
        calls.push(name)
        if (name === 'draft_model_get') {
          return { seed: { data: {}, warnings: ['asset_slots: backend timeout'] } }
        }
        if (name === 'movscript_asset_slot_query') {
          return {
            asset_slots: [{
              id: 9,
              owner: { type: 'creative_reference', id: 7 },
              name: 'Existing portrait',
              kind: 'image',
              status: 'needed',
            }],
          }
        }
        throw new Error(`unexpected tool ${name}`)
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  assert.deepEqual(calls, ['draft_model_get', 'movscript_asset_slot_query'])
  const content = JSON.parse(draftStore.listDrafts()[0]!.content)
  assert.equal(content.snapshot_base, undefined)
  assert.deepEqual(content.proposal.asset_slots.map((slot: any) => slot.id), [9])
})

test('executeTool unwraps MCP tool data while hydrating asset proposal snapshots', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'draft_create',
    args: {
      kind: 'asset_proposal',
      proposal: true,
      projectId: 42,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
        scope: 'asset_proposal',
        mode: 'snapshot',
        proposal: {
          creative_references: [],
          candidate_plans: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        return {
          content: [{ type: 'text', text: 'wrapped MCP result' }],
          data: {
            seed: {
              data: {
                asset_slots: [{
                  id: 9,
                  name: 'Wrapped portrait',
                  kind: 'image',
                  status: 'needed',
                }],
              },
            },
          },
        }
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  const content = JSON.parse(draftStore.listDrafts()[0]!.content)
  assert.equal(content.snapshot_base, undefined)
  assert.deepEqual(content.proposal.asset_slots.map((slot: any) => slot.name), ['Wrapped portrait'])
})

test('executeTool hydrates missing setting proposal rows into proposal during draft creation', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'draft_create',
    args: {
      kind: 'setting_proposal',
      proposal: true,
      projectId: 42,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.settingProposal,
        scope: 'setting_proposal',
        mode: 'snapshot',
        proposal: {
          creative_references: [],
          asset_slots: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(name: string): Promise<JSONValue> {
        assert.equal(name, 'draft_model_get')
        return {
          seed: {
            data: {
              creative_references: [{
                id: 7,
                name: 'Existing hero',
                kind: 'person',
                status: 'active',
              }],
            },
          },
        }
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  const draft = draftStore.listDrafts()[0]!
  const content = JSON.parse(draft.content)
  assert.equal(content.snapshot_base, undefined)
  assert.deepEqual(content.proposal.creative_references.map((reference: any) => reference.id), [7])
  assert.equal((draft.metadata as any)?.proposalBaseHydrated, true)
  assert.equal((draft.metadata as any)?.proposalSnapshotSeeded, true)
})

test('executeTool seeds omitted setting proposal snapshot from current project data', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'draft_create',
    args: {
      kind: 'setting_proposal',
      proposal: true,
      projectId: 42,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.settingProposal,
        scope: 'setting_proposal',
        mode: 'snapshot',
        proposal: {
          asset_slots: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(name: string): Promise<JSONValue> {
        assert.equal(name, 'draft_model_get')
        return {
          seed: {
            data: {
              creative_references: [{
                id: 7,
                name: 'Existing hero',
                kind: 'person',
                status: 'active',
              }],
            },
          },
        }
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  const draft = draftStore.listDrafts()[0]!
  const content = JSON.parse(draft.content)
  assert.equal(content.snapshot_base, undefined)
  assert.deepEqual(content.proposal.creative_references.map((reference: any) => reference.id), [7])
  assert.equal((draft.metadata as any)?.proposalBaseHydrated, true)
  assert.equal((draft.metadata as any)?.proposalSnapshotSeeded, true)
})

test('executeTool does not duplicate proposal rows that already have backend ids', async () => {
  const draftStore = new InMemoryAgentDraftStore()
  const result = await executeTool({
    name: 'draft_create',
    args: {
      kind: 'asset_proposal',
      proposal: true,
      projectId: 42,
      content: JSON.stringify({
        schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
        scope: 'asset_proposal',
        mode: 'snapshot',
        proposal: {
          creative_references: [],
          asset_slots: [{
            id: 9,
            name: 'Existing portrait',
            kind: 'image',
          }],
          candidate_plans: [],
        },
      }),
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        return { seed: { data: { asset_slots: [{ id: 9, name: 'Existing portrait', kind: 'image' }] } } }
      },
    }),
    draftStore,
  })

  assert.equal((result.result as any)?.status, 'created')
  const draft = draftStore.listDrafts()[0]!
  const content = JSON.parse(draft.content)
  assert.equal(content.snapshot_base, undefined)
  assert.equal((draft.metadata as any)?.proposalBaseHydrated, true)
})

test('executeTool reports automatic snapshot base hydration failures clearly', async () => {
  await assert.rejects(
    () => executeTool({
      name: 'draft_create',
      args: {
        kind: 'asset_proposal',
        proposal: true,
        projectId: 42,
        content: JSON.stringify({
          schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
          scope: 'asset_proposal',
          mode: 'snapshot',
          proposal: {
            creative_references: [],
            asset_slots: [],
            candidate_plans: [],
          },
        }),
      },
    }, {
      ...testOptions({
        async initialize(): Promise<JSONValue> {
          return {}
        },
        async callTool(): Promise<JSONValue> {
          return { seed: { data: {} } }
        },
      }),
      draftStore: new InMemoryAgentDraftStore(),
    }),
    /could not hydrate proposal\.asset_slots automatically: hydrated seed did not include asset_slots/,
  )
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
      name: 'draft_file_edit',
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
    name: 'draft_file_read',
    args: { ref: draftContentFileRef(draft.id), jsonPointer: '/proposal/asset_slots' },
  }, options)

  assert.equal((read.result as any)?.status, 'read')
  assert.equal((read.result as any)?.value.length, 1)

  const original = draftStore.getDraft(draft.id)?.content ?? ''
  const next = original.replace('"candidate_plans":[]', '"candidate_plans":[{"name":"TaskGraph A"}]')
  const edited = await executeTool({
    name: 'draft_file_edit',
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
  assert.deepEqual(content.proposal.candidate_plans.map((taskGraph: any) => taskGraph.name), ['TaskGraph A'])
})

test('executeTool delegates agent file tools to the injected file system without requiring a draft', async () => {
  const files = new Map([['/workspace/notes.md', 'alpha\nbeta\ngamma']])
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
    name: 'draft_file_read',
    args: { ref: '/workspace/notes.md' },
  }, options)
  assert.equal((read.result as any)?.draft, undefined)
  assert.equal((read.result as any)?.file.provider, 'workspace')
  assert.equal((read.result as any)?.content, 'alpha\nbeta\ngamma')

  const rangedRead = await executeTool({
    name: 'draft_file_read',
    args: { ref: '/workspace/notes.md', startLine: 2, lineCount: 1 },
  }, options)
  assert.equal((rangedRead.result as any)?.content, 'beta')
  assert.equal((rangedRead.result as any)?.startLine, 2)
  assert.equal((rangedRead.result as any)?.endLine, 2)
  assert.equal((rangedRead.result as any)?.totalLines, 3)

  const edited = await executeTool({
    name: 'draft_file_edit',
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
  assert.equal(files.get('/workspace/notes.md'), 'alpha\ndelta\ngamma')
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
      assetSlotId: 9,
      slot: { id: 9, name: 'Hero portrait', kind: 'image' },
      proposal: {
        creative_references: [],
        asset_slots: [],
        candidate_plans: [{
          output_kind: 'image',
          prompt: 'Hero portrait candidate',
          input_resource_ids: [],
          acceptance_criteria: ['Matches project style'],
        }],
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
    name: 'draft_apply',
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
    name: 'draft_create',
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
    name: 'draft_create',
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
        name: 'draft_create',
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
    name: 'draft_create',
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
    name: 'draft_create',
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
        name: 'core_memory_search',
        args: { projectId, query: 'preference' } as Record<string, JSONValue>,
      }, options),
      /search_memories requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'core_memory_get',
        args: { projectId, id: 'mem_1' } as Record<string, JSONValue>,
      }, options),
      /get_memory requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'core_memory_create',
        args: { projectId, title: 'Preference', kind: 'preference', content: 'Remember this.' } as Record<string, JSONValue>,
      }, options),
      /create_memory requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'core_memory_delete',
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
            summary: 'knowledge_get result reference (runtime)',
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
    name: 'knowledge_get',
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
            summary: 'knowledge_get result reference (runtime)',
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
      name: 'knowledge_get',
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
    executeTool({ name: 'generation_model_list', args: { capability: 'video' } }, testOptions(mcpClient)),
    MCPError,
  )
})

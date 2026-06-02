import assert from 'node:assert/strict'
import test from 'node:test'

import { MCPError } from '../../../../adapters/mcp/client/mcpClient.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'
import { ReferenceManager, loadBuiltinReferenceStore } from '../../../../reference/index.js'
import { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../../../../memory/store/in-memory/memoryStore.js'
import { InMemoryAgentDraftStore, validateDraft } from '../../../../drafts/store/draftStore.js'
import { executeTool } from './toolExecutor.js'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/drafts'
import { draftContentFileRef } from '../../../../files/providers/draftFileProvider.js'
import {
  createDefaultDraftApplyPort,
  createDefaultDraftApplyPreviewPort,
  createDefaultExternalToolGatewayPort,
  createDefaultProposalSnapshotHydrationPort,
  createDefaultProjectStandardsPort,
  createDefaultResourceFilePort,
  createDefaultVideoFrameExtractionPort,
  createDefaultRuntimeToolHandlerRegistry,
} from '../../../../application/shared/tools/runtimeToolHandlers.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import { createRuntimeToolHandlerRegistry } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'

const defaultRuntimeToolHandlers = createDefaultRuntimeToolHandlerRegistry()
const defaultDraftApplyBackend = {
  async applyReview(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
  async previewApplyReview(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
}
const defaultDraftApplyPort = createDefaultDraftApplyPort(defaultDraftApplyBackend)
const defaultDraftApplyPreviewPort = createDefaultDraftApplyPreviewPort(defaultDraftApplyBackend)
const defaultProjectStandardsBackend = {
  async getProject(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
}

function testRun(): AgentRun {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive',
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

function testOptions(mcpClient: { initialize(): Promise<JSONValue>; callTool(name: string, args?: Record<string, JSONValue>): Promise<JSONValue>; readResource?(uri: string): Promise<JSONValue> }) {
  return {
    run: testRun(),
    mcpClient,
    externalToolGatewayPort: createDefaultExternalToolGatewayPort(mcpClient),
    draftStore: {} as never,
    draftApplyPort: defaultDraftApplyPort,
    draftApplyPreviewPort: defaultDraftApplyPreviewPort,
    proposalSnapshotHydrationPort: createDefaultProposalSnapshotHydrationPort(mcpClient),
    resourceFilePort: createDefaultResourceFilePort(mcpClient),
    videoFrameExtractionPort: createDefaultVideoFrameExtractionPort({ downloadResourceFile: async () => ({ performed: false, skippedReason: 'backend disabled in test' }) }),
    projectStandardsPort: createDefaultProjectStandardsPort(defaultProjectStandardsBackend),
    registry: { get: () => undefined, list: () => [] },
    runtimeToolHandlers: defaultRuntimeToolHandlers,
    sandboxMode: false,
  }
}

test('executeTool serves runtime work wait through the runtime catalog manager', async () => {
  const calls: string[] = []
  const result = await executeTool({
    name: 'core_work_wait',
    args: { workIds: ['op_42'] },
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
      updatePlan: () => ({}),
      startWork: () => ({}),
      getWork: () => ({}),
      listWork: () => ({}),
      waitWork: (_run: AgentRun, input?: Record<string, JSONValue>) => {
        calls.push(`runtime.wait:${(input?.workIds as JSONValue[] | undefined)?.join(',')}`)
        return { status: 'completed', done: true }
      },
      cancelWork: () => ({}),
    },
  })

  assert.equal(result.source, 'runtime')
  assert.deepEqual(result.result, { status: 'completed', done: true })
  assert.deepEqual(calls, ['runtime.wait:op_42'])
})

test('executeTool returns schema validation errors before runtime or external execution', async () => {
  let externalCalled = false
  const result = await executeTool({
    name: 'studio_schema_tool',
    args: { count: 'two' },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        externalCalled = true
        return {}
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_schema_tool',
      description: 'Validate input.',
      permission: 'studio.write',
      risk: 'write',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        required: ['name', 'count'],
        properties: {
          name: { type: 'string' },
          count: { type: 'integer' },
        },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([{
      toolNames: ['studio_schema_tool'],
      execute() {
        throw new Error('runtime handler should not run after schema validation fails')
      },
    }]),
  })

  assert.equal(externalCalled, false)
  assert.equal(result.source, 'runtime')
  assert.match(result.error ?? '', /schema validation failed/)
  assert.equal((result.errorData as any)?.code, 'schema_invalid')
  assert.equal(result.pipeline?.stages.some((stage) => stage.name === 'schema_validation' && stage.status === 'failed'), true)
})

test('executeTool schema validation covers catalog JSON schema constraints', async () => {
  const result = await executeTool({
    name: 'studio_rich_schema_tool',
    args: {
      name: 'valid name',
      count: 0,
      mode: 'invalid',
      tags: [],
      nested: { flag: 'yes', extra: true },
      extra: 'not allowed',
      target: false,
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('external gateway should not run after schema validation fails')
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_rich_schema_tool',
      description: 'Validate richer schema constraints.',
      permission: 'studio.write',
      risk: 'write',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'count', 'mode', 'tags', 'nested', 'target'],
        properties: {
          name: { type: 'string', maxLength: 20 },
          count: { type: 'integer', minimum: 1, maximum: 3 },
          mode: { type: 'string', enum: ['fast', 'safe'] },
          tags: { type: 'array', minItems: 1, items: { type: 'string' } },
          nested: {
            type: 'object',
            additionalProperties: false,
            properties: {
              flag: { type: 'boolean' },
            },
          },
          target: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
            ],
          },
        },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
  })

  const errors = (result.errorData as any)?.errors as string[]
  assert.equal((result.errorData as any)?.code, 'schema_invalid')
  assert.ok(errors.includes('args.count must be >= 1'))
  assert.ok(errors.includes('args.mode must be one of "fast", "safe"'))
  assert.ok(errors.includes('args.tags must contain at least 1 item(s)'))
  assert.ok(errors.includes('args.nested.flag expected boolean'))
  assert.ok(errors.includes('args.nested.extra is not allowed'))
  assert.ok(errors.includes('args.extra is not allowed'))
  assert.ok(errors.includes('args.target must match at least one allowed schema'))
})

test('executeTool pipeline normalizes legacy call arguments and records runtime stages', async () => {
  const result = await executeTool({
    name: 'studio_runtime_tool',
    arguments: { value: 'ok' },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('external gateway should not run for runtime handler')
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_runtime_tool',
      description: 'Runtime tool.',
      permission: 'studio.read',
      risk: 'read',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([{
      toolNames: ['studio_runtime_tool'],
      execute(context) {
        return { result: { received: context.args.value ?? null } }
      },
    }]),
  })

  assert.deepEqual(result.result, { received: 'ok' })
  assert.equal(result.pipeline?.source, 'runtime')
  assert.equal(result.pipeline?.execution.concurrencySafe, true)
  assert.deepEqual(result.pipeline?.stages.map((stage) => `${stage.name}:${stage.status}`), [
    'resolve:completed',
    'schema_validation:completed',
    'permission_gate:skipped',
    'sandbox:skipped',
    'runtime_handler:completed',
    'external_gateway:skipped',
    'result_shaping:completed',
  ])
})

test('executeTool permission gate blocks ungranted calls before runtime handlers execute', async () => {
  let runtimeCalled = false
  const result = await executeTool({
    name: 'studio_permission_tool',
    args: { value: 'blocked' },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('external gateway should not run after permission gate blocks')
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_permission_tool',
      description: 'Policy-gated tool.',
      permission: 'studio.write',
      risk: 'write',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([{
      toolNames: ['studio_permission_tool'],
      execute() {
        runtimeCalled = true
        return { result: { ok: true } }
      },
    }]),
    permissionGate: {
      manifest: DEFAULT_AGENT_MANIFEST,
      catalog: { discovered: [], available: [], blocked: [], byName: {} },
      approvalMode: 'interactive',
    },
  })

  assert.equal(runtimeCalled, false)
  assert.match(result.error ?? '', /blocked by permissions/)
  assert.equal((result.errorData as any)?.code, 'tool_permission_blocked')
  assert.equal((result.errorData as any)?.reason, 'not_granted')
  assert.equal(result.pipeline?.stages.some((stage) => stage.name === 'permission_gate' && stage.status === 'failed'), true)
})

test('executeTool serves runtime reference search and bounded get', async () => {
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime reference tools')
      },
    }),
    referenceManager: new ReferenceManager(loadBuiltinReferenceStore()),
  }

  const search = await executeTool({
    name: 'reference_search',
    args: { query: '关键帧 分镜', domain: 'storyboard', limit: 2 },
  }, options)
  const results = (search.result as any)?.results as any[]
  assert.equal(Array.isArray(results), true)
  assert.equal(results.length > 0, true)
  assert.equal(results.some((result) => result.content !== undefined), false)
  assert.equal(typeof results[0]!.title, 'string')
  assert.equal(results[0]!.kind, 'text')
  assert.equal(results[0]!.source, 'local_reference')
  assert.equal(results[0]!.metadata?.domain, 'storyboard')
  assert.match(results[0]!.metadata?.contentHash, /^sha256:/)
  assert.equal(typeof results[0]!.metadata?.sourcePath, 'string')

  const body = await executeTool({
    name: 'reference_get',
    args: { id: results[0]!.id, maxChars: 32 },
  }, options)
  assert.equal(`local_reference:${(body.result as any)?.id}`, results[0]!.id)
  assert.equal((body.result as any)?.domain, 'storyboard')
  assert.match((body.result as any)?.contentHash, /^sha256:/)
  assert.equal(typeof (body.result as any)?.sourcePath, 'string')
  assert.equal(((body.result as any)?.content as string).length <= 32, true)
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
    projectStandardsPort: createDefaultProjectStandardsPort({
      async getProject(): Promise<any> {
        return { performed: false, skippedReason: 'backend disabled in test' }
      },
    }),
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

test('executeTool extracts local video frames and returns image parts only through supplemental model messages', async () => {
  const calls: any[] = []
  const run = testRun()
  run.metadata = {
    backendAuthToken: 'backend-token',
    backendAPIBaseURL: 'http://backend.local/api/v1',
    context: { user: { id: 7 } },
  }
  const result = await executeTool({
    name: 'core_video_extract_frames',
    args: { resource_id: 77, mode: 'range', count: 2, max_frames: 6, max_width: 320, start_sec: 0, end_sec: 2, fps: 2, timestamps_sec: [0, 1.5] },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for local video frame extraction')
      },
    }),
    run,
    videoFrameExtractionPort: {
      async extract(input) {
        calls.push(input)
        return {
          status: 'extracted',
          resourceId: input.resourceId,
          frameCount: 2,
          durationSec: 3,
          video: { durationSec: 3, width: 1920, height: 1080, fps: 30 },
          sampling: {
            mode: input.mode ?? 'timestamps',
            timestampsSec: input.timestampsSec ?? [],
            requestedFrameCount: input.timestampsSec?.length ?? 0,
            returnedFrameCount: 2,
            maxFrames: input.maxFrames ?? 2,
            ...(input.startSec !== undefined ? { startSec: input.startSec } : {}),
            ...(input.endSec !== undefined ? { endSec: input.endSec } : {}),
            ...(input.fps !== undefined ? { fps: input.fps } : {}),
            warnings: [],
          },
          outputLayout: input.outputLayout ?? 'individual',
          download: { performed: true, method: 'GET', url: 'http://backend.local/api/v1/resources/77/file', contentType: 'video/mp4', contentLength: 1234 },
          frames: [
            { index: 1, timestampSec: 0, mimeType: 'image/jpeg', sizeBytes: 10, dataUrl: 'data:image/jpeg;base64,AAAA' },
            { index: 2, timestampSec: 1.5, mimeType: 'image/jpeg', sizeBytes: 11, dataUrl: 'data:image/jpeg;base64,BBBB' },
          ],
        }
      },
    },
  })

  assert.equal(result.source, 'runtime')
  assert.equal(calls[0]?.resourceId, 77)
  assert.equal(calls[0]?.count, 2)
  assert.equal(calls[0]?.mode, 'range')
  assert.equal(calls[0]?.maxFrames, 6)
  assert.equal(calls[0]?.startSec, 0)
  assert.equal(calls[0]?.endSec, 2)
  assert.equal(calls[0]?.fps, 2)
  assert.equal(calls[0]?.maxWidth, 320)
  assert.deepEqual(calls[0]?.timestampsSec, [0, 1.5])
  assert.equal(calls[0]?.run.metadata?.backendAuthToken, 'backend-token')
  assert.equal((result.result as any)?.video?.width, 1920)
  assert.equal((result.result as any)?.sampling?.mode, 'range')
  assert.deepEqual((result.result as any)?.sampling?.timestamps_sec, [0, 1.5])
  assert.equal((result.result as any)?.frames[0]?.image_payload, 'sent_to_model_as_image_part')
  assert.equal(JSON.stringify(result.result).includes('data:image'), false)
  assert.equal(result.supplementalMessages?.length, 1)
  const supplemental = result.supplementalMessages?.[0]
  assert.equal(supplemental?.role, 'user')
  assert.equal(supplemental?.content.filter((part: any) => part.type === 'image').length, 2)
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
        slot: {
          ID: 9,
          project_id: 42,
          owner: { Type: 'creative_reference', ID: 7 },
          name: 'Existing portrait',
          Kind: 'image',
          CreatedAt: '2026-05-21T00:00:00Z',
          UpdatedAt: '2026-05-21T00:00:00Z',
        },
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
                proposal_client_id: 'slot-existing-9',
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
  assert.deepEqual(content.slot, {
    id: 9,
    owner: { type: 'creative_reference', id: 7 },
    kind: 'image',
    name: 'Existing portrait',
  })
  assert.equal(validateDraft(draft).ok, true)
  assert.equal((draft.metadata as any)?.proposalBaseHydrated, true)
  assert.equal((draft.metadata as any)?.proposalSnapshotSeeded, true)
})

test('executeTool normalizes hydrated setting proposal rows during draft creation', async () => {
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
              creative_references: [{
                ID: 14,
                project_id: 42,
                proposal_client_id: 'cr_tongzilou_old_room',
                kind: 'location',
                name: '筒子楼老屋/旧屋',
                description: '周建国一家1982年初居住的狭小旧屋。',
                content: '需要保持空间连续性。',
                importance: 'core',
                status: 'needs_review',
                profile_json: '',
                tags_json: '',
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
  assert.deepEqual(content.proposal.creative_references, [{
    client_id: 'cr_tongzilou_old_room',
    id: 14,
    kind: 'location',
    name: '筒子楼老屋/旧屋',
    description: '周建国一家1982年初居住的狭小旧屋。',
    content: '需要保持空间连续性。',
    importance: 'core',
    status: 'needs_review',
    profile_json: '',
    tags_json: '',
  }])
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
        proposal: {},
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
      name: 'core_file_edit',
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
    name: 'core_file_read',
    args: { ref: draftContentFileRef(draft.id), jsonPointer: '/proposal/asset_slots' },
  }, options)

  assert.equal((read.result as any)?.status, 'read')
  assert.equal((read.result as any)?.value.length, 1)

  const original = draftStore.getDraft(draft.id)?.content ?? ''
  const next = original.replace('"candidate_plans":[]', '"candidate_plans":[{"name":"TaskGraph A"}]')
  const edited = await executeTool({
    name: 'core_file_edit',
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
    name: 'core_file_read',
    args: { ref: '/workspace/notes.md' },
  }, options)
  assert.equal((read.result as any)?.draft, undefined)
  assert.equal((read.result as any)?.file.provider, 'workspace')
  assert.equal((read.result as any)?.content, 'alpha\nbeta\ngamma')

  const rangedRead = await executeTool({
    name: 'core_file_read',
    args: { ref: '/workspace/notes.md', startLine: 2, lineCount: 1 },
  }, options)
  assert.equal((rangedRead.result as any)?.content, 'beta')
  assert.equal((rangedRead.result as any)?.startLine, 2)
  assert.equal((rangedRead.result as any)?.endLine, 2)
  assert.equal((rangedRead.result as any)?.totalLines, 3)

  const edited = await executeTool({
    name: 'core_file_edit',
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

test('executeTool reads and searches readonly movscript resources through core file tools', async () => {
  const resourceReads: string[] = []
  const options = testOptions({
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(): Promise<JSONValue> {
      throw new Error('MCP tools should not be called for resource file reads')
    },
    async readResource(uri: string): Promise<JSONValue> {
      resourceReads.push(uri)
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: '第一行\n老张把字条塞进伞柄\n第三行',
        }],
      }
    },
  })

  const read = await executeTool({
    name: 'core_file_read',
    args: {
      ref: 'movscript://project/5/script-version/13/content',
      startLine: 2,
      lineCount: 1,
    },
  }, options)
  assert.equal(resourceReads[0], 'movscript://project/5/script-version/13/content?startLine=2&lineCount=1&maxChars=20000')
  assert.equal((read.result as any)?.file.provider, 'mcp')
  assert.equal((read.result as any)?.content, '第一行\n老张把字条塞进伞柄\n第三行')

  const searched = await executeTool({
    name: 'core_file_search',
    args: {
      ref: 'movscript://project/5/script-version/13/content',
      query: '字条',
    },
  }, options)
  assert.equal((searched.result as any)?.matchCount, 1)
  assert.equal((searched.result as any)?.matches[0].line, 2)

  await assert.rejects(
    () => executeTool({
      name: 'core_file_edit',
      args: {
        ref: 'movscript://project/5/script-version/13/content',
        edits: [{ type: 'replace_text', oldText: '字条', newText: '纸条' }],
      },
    }, options),
    /cannot edit readonly MCP resource/,
  )
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
    draftApplyPort: createDefaultDraftApplyPort({
      async applyReview(): Promise<any> {
        throw new Error('backend apply should be skipped for asset planning drafts without asset slots')
      },
    }),
  })

  assert.equal((result.result as any)?.status, 'applied')
  const applied = draftStore.getDraft(draft.id)
  assert.equal(applied?.status, 'draft')
  assert.equal((applied?.metadata as any)?.lastApplyStatus, 'applied')
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
      kind: 'runtime_note',
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
      kind: 'runtime_note',
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
        scope: 'production_proposal',
        mode: 'snapshot',
        productionId: 7,
        proposalScope: 'production',
        proposal: {
          segments: [],
        },
        impact_notes: [],
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
        scope: 'production_proposal',
        mode: 'snapshot',
        productionId: 7,
        proposalScope: 'production',
        proposal: {
          segments: [],
        },
        impact_notes: [],
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

test('executeTool enforces per-run reference character budget', async () => {
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime reference tools')
      },
    }),
    run: {
      ...testRun(),
      metadata: {
        limits: { maxReferenceCharsPerRun: 50, maxReferenceChunksPerRun: 3 },
        contextLedger: {
          schema: 'movscript.context-ledger.v1',
          retrieved: [{
            ref: { type: 'reference', id: 'storyboard.rhythm.basic' },
            source: 'reference',
            evidence: 'advisory',
            title: '分镜节奏基础',
            summary: 'reference_get result reference (runtime)',
            charCount: 30,
            retrievedAt: new Date(0).toISOString(),
            usedInPrompt: true,
          }],
        },
      },
    },
    referenceManager: new ReferenceManager(loadBuiltinReferenceStore()),
  }

  const body = await executeTool({
    name: 'reference_get',
    args: { id: 'storyboard.hook.short_drama', maxChars: 100 },
  }, options)

  assert.equal(((body.result as any)?.content as string).length <= 20, true)
  assert.equal((body.result as any)?.truncated, true)
})

test('executeTool enforces per-run reference chunk budget', async () => {
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime reference tools')
      },
    }),
    run: {
      ...testRun(),
      metadata: {
        limits: { maxReferenceCharsPerRun: 8000, maxReferenceChunksPerRun: 1 },
        contextLedger: {
          schema: 'movscript.context-ledger.v1',
          retrieved: [{
            ref: { type: 'reference', id: 'storyboard.rhythm.basic' },
            source: 'reference',
            evidence: 'advisory',
            title: '分镜节奏基础',
            summary: 'reference_get result reference (runtime)',
            charCount: 120,
            retrievedAt: new Date(0).toISOString(),
            usedInPrompt: true,
          }],
        },
      },
    },
    referenceManager: new ReferenceManager(loadBuiltinReferenceStore()),
  }

  await assert.rejects(
    () => executeTool({
      name: 'reference_get',
      args: { id: 'storyboard.hook.short_drama', maxChars: 100 },
    }, options),
    /reference chunk budget exceeded/,
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

import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { buildLayeredCatalogRegistry } from '../catalog/registry.js'
import { EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER } from '../contracts/runtimeContract.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import type { AgentMemory } from '../memory/types.js'
import type { MCPResource, MCPTool } from '../state/types.js'
import { DEFAULT_TOOL_REGISTRY } from '../tools/toolRegistry.js'
import { buildRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import { buildRuntimeRunPreview } from './runtimeRunPreview.js'

test('buildRuntimeRunPreview builds a preview without persisting a run', async () => {
  const previousModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(mkdtempSync(join(tmpdir(), 'runtime-run-preview-test-')), 'model-config.json')

  const calls: string[] = []
  const memoryQueries: unknown[] = []
  const thread = {
    id: 'thread_1',
    title: 'Preview thread',
    archived: false,
    status: 'idle' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [{
      id: 'msg_1',
      threadId: 'thread_1',
      role: 'user' as const,
      content: 'thread fallback message',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  }
  const memories: AgentMemory[] = [{
    id: 'mem_1',
    projectId: 42,
    title: 'Default tone',
    kind: 'preference',
    content: 'Prefer concise answers.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }]
  const catalogSnapshot = buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: buildLayeredCatalogRegistry({
      manifest: DEFAULT_AGENT_MANIFEST,
      tools: DEFAULT_TOOL_REGISTRY.list(),
      version: '2026-01-01T00:00:00.000Z',
    }),
    pluginWarnings: ['catalog warning'],
  })

  try {
    const preview = await buildRuntimeRunPreview({
      store: {
        getThread(id) {
          calls.push(`getThread:${id}`)
          return id === thread.id ? thread : undefined
        },
      },
      mcpClient: {
        async initialize() {
          calls.push('initialize')
          return {}
        },
        async callTool(name, args) {
          calls.push(`callTool:${name}:${JSON.stringify(args)}`)
          return { data: { focus: { project: { id: 42 }, productionId: 9 } } }
        },
        async listTools(): Promise<MCPTool[]> {
          calls.push('listTools')
          return []
        },
        async listResources(): Promise<MCPResource[]> {
          calls.push('listResources')
          return []
        },
      },
      memoryManager: {
        loadRelevantMemories(query: unknown) {
          memoryQueries.push(query)
          return memories
        },
      } as never,
      draftStore: new InMemoryAgentDraftStore(),
      catalogSnapshot,
      contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
      previewInput: {
        threadId: thread.id,
        agentManifest: DEFAULT_AGENT_MANIFEST,
        clientInput: {
          message: 'client input message',
          uiSnapshot: {
            route: { pathname: '/projects/42' },
            project: { id: 42, name: 'Preview Project' },
          },
        },
        policy: { maxToolCalls: 3.8, maxIterations: 2.2 },
      },
      makePreviewId: () => 'preview_1',
      makeApprovalId: () => 'approval_1',
      now: () => '2026-01-01T00:00:01.000Z',
    })

    assert.equal(preview.id, 'preview_1')
    assert.equal(preview.status, 'preview')
    assert.equal(preview.threadId, thread.id)
    assert.equal(preview.currentProjectId, 42)
    assert.match(preview.message, /client input message/)
    assert.doesNotMatch(preview.message, /thread fallback message/)
    assert.ok(preview.context)
    assert.ok(preview.policy)
    assert.ok(preview.tools)
    assert.ok(preview.promptPreview)
    assert.ok(preview.debug)
    const context = preview.context
    const policy = preview.policy
    const tools = preview.tools
    const promptPreview = preview.promptPreview
    const debug = preview.debug
    assert.equal(context.project?.id, 42)
    assert.equal(context.productionId, 9)
    assert.deepEqual(preview.memoryIds, [])
    assert.equal(preview.memoryCount, 0)
    assert.equal(policy.maxToolCalls, 3)
    assert.equal(policy.maxIterations, 2)
    assert.ok(tools.discovered.length > 0)
    assert.ok(promptPreview.messages.length > 0)
    assert.ok(debug.promptPartIds.length > 0)
    assert.deepEqual(preview.toolCalls, [])
    assert.deepEqual(preview.pendingApprovals, [])
    assert.deepEqual(preview.warnings, ['catalog warning'])
    assert.deepEqual(memoryQueries, [])
    assert.deepEqual(calls, [
      'getThread:thread_1',
      'initialize',
      'callTool:movscript_get_focus:{}',
      'initialize',
      'listTools',
      'listResources',
    ])
  } finally {
    if (previousModelConfigPath === undefined) delete process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
    else process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = previousModelConfigPath
  }
})

test('buildRuntimeRunPreview ignores invalid focus project ids at preview boundaries', async () => {
  const previousModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(mkdtempSync(join(tmpdir(), 'runtime-run-preview-invalid-project-test-')), 'model-config.json')

  const memoryQueries: unknown[] = []
  const catalogSnapshot = buildRuntimeCatalogSnapshot({
    id: 'catalog_1',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: DEFAULT_TOOL_REGISTRY,
    layeredRegistry: buildLayeredCatalogRegistry({
      manifest: DEFAULT_AGENT_MANIFEST,
      tools: DEFAULT_TOOL_REGISTRY.list(),
      version: '2026-01-01T00:00:00.000Z',
    }),
  })

  try {
    const preview = await buildRuntimeRunPreview({
      store: { getThread: () => undefined },
      mcpClient: {
        async initialize() {
          return {}
        },
        async callTool() {
          return { data: { focus: { project: { id: '42' }, productionId: 9 } } }
        },
        async listTools(): Promise<MCPTool[]> {
          return []
        },
        async listResources(): Promise<MCPResource[]> {
          return []
        },
      },
      memoryManager: {
        loadRelevantMemories(query: unknown) {
          memoryQueries.push(query)
          return []
        },
      } as never,
      draftStore: new InMemoryAgentDraftStore(),
      catalogSnapshot,
      contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
      previewInput: { message: 'memory preview scope check', agentManifest: DEFAULT_AGENT_MANIFEST },
      makePreviewId: () => 'preview_invalid_project',
      makeApprovalId: () => 'approval_1',
      now: () => '2026-01-01T00:00:01.000Z',
    })

    assert.equal(preview.currentProjectId, undefined)
    const context = preview.context
    assert.ok(context)
    assert.equal(context.project?.id, undefined)
    assert.deepEqual(memoryQueries, [{ query: 'memory preview scope check' }])
  } finally {
    if (previousModelConfigPath === undefined) delete process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
    else process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = previousModelConfigPath
  }
})

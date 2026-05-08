import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AgentRuntime } from './runtime/agentRuntime.js'
import { InMemoryAgentMemoryStore } from './runtime/memory/memoryStore.js'
import { InMemoryAgentStore } from './runtime/store/store.js'
import { InMemoryAgentDraftStore } from './runtime/store/draftStore.js'
import { BackendApplyClient } from './runtime/store/backendApplyClient.js'
import type { ApplyDraftReview } from './runtime/store/draftApply.js'
import { DEFAULT_AGENT_MANIFEST } from './runtime/manifest/agentManifest.js'
import { StaticAgentRuntimeContractResolver } from './runtime/contracts/runtimeContract.js'
import { InMemoryAgentCatalogStateStore } from './runtime/index.js'
import { createAgentRequestListener } from './server.js'
import { RuntimeModelConfigStore } from './runtime/model/modelConfig.js'
import type { AgentServerContext } from './bootstrap/agentServerContext.js'
import type { JSONValue, MCPResource, MCPTool } from './types.js'

class StubMCPClient {
  async initialize(): Promise<JSONValue> {
    return { ok: true }
  }

  async callTool(name: string): Promise<JSONValue> {
    if (name === 'movscript_get_context_pack') return { content: [{ type: 'text', text: JSON.stringify({ snapshot: { project: { id: 42, name: 'Project A' } } }) }] }
    return { ok: true }
  }

  async listTools(): Promise<MCPTool[]> {
    return []
  }

  async listResources(): Promise<MCPResource[]> {
    return []
  }
}

class StubBackendApplyClient extends BackendApplyClient {
  readonly calls: ApplyDraftReview[] = []

  override async applyReview(review: ApplyDraftReview) {
    this.calls.push(review)
    return {
      performed: true,
      method: 'PATCH' as const,
      url: 'http://backend/api/v1/projects/42/entities/content-units/7',
      payload: { description: review.proposedValue },
    }
  }
}

test('memories endpoints stay project-scoped', async () => {
  const runtime = new AgentRuntime({
    mcpClient: new StubMCPClient(),
    store: new InMemoryAgentStore(),
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    memoryStore: new InMemoryAgentMemoryStore(),
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    skillCatalog: [],
    toolRegistry: { get: () => undefined, list: () => [] } as never,
    catalogStateStore: new InMemoryAgentCatalogStateStore(),
    contractResolver: new StaticAgentRuntimeContractResolver([]),
    updateState: buildUpdateState(),
  })
  const context = buildServerContext(runtime)
  const handler = createAgentRequestListener(context)

  const local = runtime.createMemory({ projectId: 42, title: 'Local', kind: 'preference', content: 'local' })
  const other = runtime.createMemory({ projectId: 7, title: 'Other', kind: 'preference', content: 'other' })

  const listRes = await dispatch(handler, 'GET', '/memories?projectId=42')
  const listJson = JSON.parse(listRes.body) as { memories: Array<{ id: string }> }
  assert.equal(listRes.statusCode, 200)
  assert.deepEqual(listJson.memories.map((item) => item.id), [local.id])

  const detailRes = await dispatch(handler, 'GET', `/memories/${local.id}?projectId=42`)
  const detailJson = JSON.parse(detailRes.body) as { memory: { id: string; projectId: number } }
  assert.equal(detailRes.statusCode, 200)
  assert.equal(detailJson.memory.id, local.id)
  assert.equal(detailJson.memory.projectId, 42)

  const missingRes = await dispatch(handler, 'GET', `/memories/${other.id}?projectId=42`)
  assert.equal(missingRes.statusCode, 404)

  const deleteRes = await dispatch(handler, 'DELETE', `/memories/${local.id}?projectId=42`)
  assert.equal(deleteRes.statusCode, 200)
  assert.equal(runtime.getMemory(42, local.id), undefined)
  assert.ok(runtime.getMemory(7, other.id))
})

test('memory list accepts non-project scopes without server errors', async () => {
  const runtime = new AgentRuntime({
    mcpClient: new StubMCPClient(),
    store: new InMemoryAgentStore(),
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    memoryStore: new InMemoryAgentMemoryStore(),
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    skillCatalog: [],
    toolRegistry: { get: () => undefined, list: () => [] } as never,
    catalogStateStore: new InMemoryAgentCatalogStateStore(),
    contractResolver: new StaticAgentRuntimeContractResolver([]),
    updateState: buildUpdateState(),
  })
  const handler = createAgentRequestListener(buildServerContext(runtime))
  runtime.createMemory({ projectId: 42, title: 'Local', kind: 'preference', content: 'local' })

  const globalRes = await dispatch(handler, 'GET', '/memories?scope=global')
  assert.equal(globalRes.statusCode, 200)
  assert.deepEqual(JSON.parse(globalRes.body), { memories: [] })

  const threadRes = await dispatch(handler, 'GET', '/memories?scope=thread&threadId=t1')
  assert.equal(threadRes.statusCode, 200)
  assert.deepEqual(JSON.parse(threadRes.body), { memories: [] })
})

test('create memory requires projectId through the HTTP layer', async () => {
  const runtime = new AgentRuntime({
    mcpClient: new StubMCPClient(),
    store: new InMemoryAgentStore(),
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    memoryStore: new InMemoryAgentMemoryStore(),
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    skillCatalog: [],
    toolRegistry: { get: () => undefined, list: () => [] } as never,
    catalogStateStore: new InMemoryAgentCatalogStateStore(),
    contractResolver: new StaticAgentRuntimeContractResolver([]),
    updateState: buildUpdateState(),
  })
  const handler = createAgentRequestListener(buildServerContext(runtime))
  const res = await dispatch(handler, 'POST', '/memories', { title: 'Missing project', kind: 'preference', content: 'x' })
  assert.equal(res.statusCode, 500)
  const json = JSON.parse(res.body) as { error: string }
  assert.match(json.error, /projectId is required/i)
})

test('draft apply endpoint is an application-layer action outside agent runs', async () => {
  const backendApplyClient = new StubBackendApplyClient()
  const runtime = new AgentRuntime({
    mcpClient: new StubMCPClient(),
    store: new InMemoryAgentStore(),
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient,
    memoryStore: new InMemoryAgentMemoryStore(),
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    skillCatalog: [],
    toolRegistry: { get: () => undefined, list: () => [] } as never,
    catalogStateStore: new InMemoryAgentCatalogStateStore(),
    contractResolver: new StaticAgentRuntimeContractResolver([]),
    updateState: buildUpdateState(),
  })
  const handler = createAgentRequestListener(buildServerContext(runtime))
  const draft = runtime.createLocalDraft({
    projectId: 42,
    kind: 'content_unit',
    title: 'Description update',
    content: 'New description',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
  })

  const res = await dispatch(handler, 'POST', `/drafts/${draft.id}/apply`, {
    currentValue: 'Old description',
  })
  const json = JSON.parse(res.body) as { status: string; draft: { status: string } }

  assert.equal(res.statusCode, 200)
  assert.equal(json.status, 'applied')
  assert.equal(json.draft.status, 'applied')
  assert.equal(runtime.getDraft(draft.id)?.status, 'applied')
  assert.equal(backendApplyClient.calls.length, 1)
  assert.equal(runtime.listRuns().length, 0)
})

function buildServerContext(agentRuntime: AgentRuntime): AgentServerContext {
  return {
    port: 0,
    mcpEndpoint: 'http://127.0.0.1:0/mcp',
    paths: {
      statePath: '/tmp/state.json',
      memoryPath: '/tmp/memories.json',
      draftPath: '/tmp/drafts.json',
      catalogStatePath: '/tmp/catalog.json',
      modelConfigPath: '/tmp/model-config.json',
    },
    updates: buildUpdateState(),
    client: new StubMCPClient() as never,
    agentRuntime,
    backendApplyClient: new BackendApplyClient(),
    modelConfigStore: new RuntimeModelConfigStore('/tmp/model-config.json'),
    pluginCatalog: {
      skillsDir: '/tmp',
      toolsDir: '/tmp',
      builtinSkillsDir: '/tmp',
      builtinToolsDir: '/tmp',
      bundlesDir: '/tmp',
      builtinBundlesDir: '/tmp',
      skillCount: 0,
      toolCount: 0,
      bundleCount: 0,
      activeBundleIds: [],
      availableBundleIds: [],
      warnings: [],
    } as never,
  }
}

function buildUpdateState(): AgentServerContext['updates'] {
  return {
    current: { policyVersion: '0', channel: 'manual', severity: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    applied: [],
    warnings: [],
    history: [],
    policy: { channel: 'manual', allowRemote: false },
  } as never
}

function dispatch(
  handler: ReturnType<typeof createAgentRequestListener>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter() as unknown as IncomingMessage & {
      method?: string
      url?: string
      headers: Record<string, string>
      setEncoding: (encoding: BufferEncoding) => void
    }
    req.method = method
    req.url = path
    req.headers = { host: '127.0.0.1' }
    ;(req as any).setEncoding = () => {}

    const resBody = new PassThrough()
    let statusCode = 0
    const res = {
      writeHead(code: number) {
        statusCode = code
      },
      setHeader() {},
      end(chunk?: string) {
        if (chunk) resBody.end(chunk)
        else resBody.end()
      },
      write(chunk: string) {
        resBody.write(chunk)
      },
      writableEnded: false,
    } as unknown as ServerResponse

    let output = ''
    resBody.setEncoding('utf8')
    resBody.on('data', (chunk) => {
      output += chunk
    })
    resBody.on('end', () => resolve({ statusCode, body: output }))
    resBody.on('error', reject)

    void handler(req, res)
    if (body !== undefined) {
      req.emit('data', JSON.stringify(body))
    }
    req.emit('end')
  })
}
